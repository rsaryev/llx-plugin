import type { PluginFiles } from '../../ports/index.ts';
import {
  ENGINE_ORIGIN,
  type AnyModEventName,
  type StreamEventName,
} from '../../protocol/mods-events.ts';
import { GUARD_NAME } from '../../protocol/mods-settings.ts';
import type { ModHostPorts } from '../api/index.ts';
import type { DenyRuleChecker, ModCompiler, ModRuntime } from '../ports.ts';
import type {
  ChunkOf,
  EventOf,
  HookReport,
  ModChain,
  ReentryInfo,
  RegisteredHook,
  RegisterTier,
  ResultOf,
} from '../types.ts';
import type { ModInterface, ModsUi } from '../ui/index.ts';
import { loadMod, type LoadedMod, type LoadOutcome, type ModPlugin } from './loader.ts';
import { orderMods, type OrderedMod } from './order.ts';
import { sideloadRefusal } from './plugin-dirs.ts';
import type { ModsPolicyInput } from './policy-input.ts';
import { wire } from './wiring.ts';

/**
 * The mods runtime a host embeds (docs/API.md, "Mods"): the chain, the events, the API, the
 * interface and the loader wired together. The host passes the ports and the plugins it found;
 * the kit decides which hooks modules load, in which order and tier, and runs their hooks.
 */

export interface ModsHostOptions {
  readonly ports: ModHostPorts;
  readonly iface: ModInterface;
  readonly runtime: ModRuntime;
  readonly compiler: ModCompiler;
  readonly policy: ModsPolicyInput;
  /** The permission rules, for the guard's check of a call a user's mod approved. */
  readonly deny: DenyRuleChecker;
  /** The debug log (troubleshoot.md, "Read the debug log"). */
  readonly debug?: (line: string) => void;
  readonly report?: (report: HookReport) => void;
  readonly signal?: AbortSignal;
}

export interface ModLoadReport {
  readonly loaded: readonly LoadedMod[];
  /** Why a hooks module is not loaded, one line each: `hooks module <id> not loaded: <reason>`, `<mod>: refused by <mod>: <reason>`. */
  readonly lines: readonly string[];
  /** The message startup exits with when managed settings reject `--plugin-dir` (`disableSideloadFlags`). */
  readonly startupRefusal?: string;
}

export interface FireOptions {
  readonly signal?: AbortSignal;
  /** Claude Code's own behaviour, at the end of the chain; without it the chain ends in `undefined`. */
  readonly core?: (e: unknown) => Promise<unknown> | AsyncGenerator<unknown, unknown>;
  /** Only this mod's hooks handle the event (`session.start` once for each loaded mod). */
  readonly only?: string;
  readonly reentry?: ReentryInfo;
  readonly groupMs?: number;
}

export interface ModsHost {
  /** Loads hooks modules in the order policy gives; every failure is a line, never a throw. */
  load(plugins: readonly ModPlugin[]): Promise<ModLoadReport>;
  /** `/reload-plugins`: unloads every mod and loads the same plugins again. */
  reload(): Promise<ModLoadReport>;
  fire<N extends AnyModEventName>(
    name: N,
    input: EventOf<N>,
    options?: FireOptions,
  ): Promise<ResultOf<N>>;
  fireStream<N extends StreamEventName>(
    name: N,
    input: EventOf<N>,
    options?: FireOptions,
  ): AsyncGenerator<ChunkOf<N>, ResultOf<N>>;
  /**
   * A mod the host provides itself, such as one built into Claude Code: its hooks are registered as
   * given, in the tier given, and it shows in `active()` as built in. `unload()` takes it away.
   */
  registerBuiltIn(
    name: string,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
  ): Promise<LoadedMod>;
  readonly ui: ModsUi;
  readonly chain: ModChain;
  active(): readonly LoadedMod[];
  dispose(): Promise<void>;
}

const noop = (): void => undefined;
const UNLOADED = '; the version loaded before is unloaded';

/** What ordering says before any module loads: its notes, and a line for each module policy keeps out. */
const skippedLines = (order: ReturnType<typeof orderMods>): string[] => [
  ...order.notes,
  ...order.skipped.map((skip) => `hooks module ${skip.candidate.id} not loaded: ${skip.reason}`),
];

/** The mods runtime for one session. */
export function createModsHost(options: ModsHostOptions): ModsHost {
  const debug = options.debug ?? noop;
  const background = new AbortController();
  const signal = options.signal ?? background.signal;
  const wired = wire({ ...options, debug, report: options.report ?? noop, signal });
  const { chain, env } = wired;
  const { policy } = options;
  let loaded: LoadedMod[] = [];
  let plugins: readonly ModPlugin[] = [];

  /** The guard is registered by the host; every other module is the loader's. */
  async function loadOne(mod: OrderedMod, files: PluginFiles | undefined): Promise<LoadOutcome> {
    if (mod.candidate.isBuiltin && mod.candidate.name === GUARD_NAME) {
      return { mod: await wired.registerGuard() };
    }
    return files ? loadMod(env, mod, files) : {};
  }

  async function loadAll(
    given: readonly ModPlugin[],
    before: ReadonlySet<string>,
  ): Promise<ModLoadReport> {
    plugins = given;
    const refusal = sideloadRefusal(policy);
    if (refusal !== undefined) return { loaded: [], lines: [], startupRefusal: refusal };
    const order = orderMods(
      policy,
      given.map((plugin) => plugin.candidate),
    );
    const filesOf = new Map<string, PluginFiles>(
      given.map((plugin) => [plugin.candidate.id, plugin.files]),
    );
    const lines = skippedLines(order);
    for (const mod of order.ordered) {
      const outcome = await loadOne(mod, filesOf.get(mod.candidate.id));
      if (outcome.mod) loaded.push(outcome.mod);
      if (outcome.line !== undefined) {
        lines.push(before.has(mod.candidate.name) ? `${outcome.line}${UNLOADED}` : outcome.line);
      }
    }
    for (const line of lines) debug(line);
    return { loaded: [...loaded], lines };
  }

  async function unloadAll(): Promise<ReadonlySet<string>> {
    const names = new Set(loaded.map((mod) => mod.name));
    for (const mod of loaded.toReversed()) await mod.unload();
    loaded = [];
    return names;
  }

  const dispatchOptions = (opts: FireOptions) => ({
    origin: ENGINE_ORIGIN,
    signal: opts.signal ?? signal,
    core: opts.core ?? (() => Promise.resolve(undefined)),
    report: env.report,
    debug,
    ...(opts.only === undefined ? {} : { only: opts.only }),
    ...(opts.reentry === undefined ? {} : { reentry: opts.reentry }),
    ...(opts.groupMs === undefined ? {} : { groupMs: opts.groupMs }),
  });

  return {
    load: (given) => loadAll(given, new Set()),
    reload: async () => loadAll(plugins, await unloadAll()),
    fire: (name, input, opts = {}) => chain.dispatch(name, input, dispatchOptions(opts)),
    fireStream: (name, input, opts = {}) =>
      chain.dispatchStream(name, input, dispatchOptions(opts)),
    registerBuiltIn: async (name, tier, hooks) => {
      const mod = await wired.registerNative(name, tier, hooks);
      loaded.push(mod);
      return mod;
    },
    ui: wired.ui,
    chain,
    active: () => [...loaded],
    async dispose() {
      await unloadAll();
      background.abort(new Error('the mods host was disposed'));
    },
  };
}
