import type { PluginFiles } from '../../ports/index.ts';
import { type AnyModEventName, type StreamEventName } from '../../protocol/mods-events.ts';
import type { ModHostPorts } from '../api/index.ts';
import type { DenyRuleChecker, MatcherEngine, ModCompiler, ModRuntime } from '../ports.ts';
import type {
  ChunkOf,
  EventOf,
  HookReport,
  ModChain,
  RegisteredHook,
  RegisterTier,
  ResultOf,
} from '../types.ts';
import type { ModInterface, ModsUi } from '../ui/index.ts';
import type { LoadedMod, ModPlugin, ReloadOutcome } from './loader.ts';
import {
  announceSessionStart,
  loadOne,
  dispatchOptionsFor,
  reloadOne,
  type FireSettings,
} from './host-support.ts';
import { orderMods } from './order.ts';
import { pluginDirsOf, sideloadRefusal, watchesPluginDirs } from './plugin-dirs.ts';
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
  /** Where the regular expressions of mods' matchers run; without one, in this thread (`MatcherEngine`). */
  readonly matcherEngine?: MatcherEngine;
  /** How long the engine has for one test of one pattern, in milliseconds (default 100). */
  readonly matcherMs?: number;
  /**
   * The transcript line (or stderr) for a skipped hook: the first of each mod, event and kind until
   * the mod reloads. The debug log gets every occurrence.
   */
  readonly report?: (report: HookReport) => void;
  readonly signal?: AbortSignal;
  /**
   * For the test kit: why a mods API call ends in nothing, or `undefined` for a call that ends in its
   * effect. The call fails with that reason once no hook before the caller has answered it.
   */
  readonly unanswered?: (name: string) => string | undefined;
  /**
   * Whether `session.start` fires for each mod after `load` and `reload` (reference.md, "Session":
   * "Once for each loaded mod ... and again after a reload of that mod"). The default is true; the test
   * kit turns it off, as "`session.start` doesn't run by itself" there (test.md).
   */
  readonly firesSessionStart?: boolean;
  /** Whether the session is interactive, for the input of `session.start` (default true). */
  readonly isInteractive?: boolean;
}

export interface ModLoadReport {
  readonly loaded: readonly LoadedMod[];
  /** Why a hooks module is not loaded, one line each: `hooks module <id> not loaded: <reason>`, `<mod>: refused by <mod>: <reason>`. */
  readonly lines: readonly string[];
  /** The message startup exits with when managed settings reject `--plugin-dir` (`disableSideloadFlags`). */
  readonly startupRefusal?: string;
}

/** What a caller of `fire` may give: its own signal, the core behaviour at the end of the chain, and the narrowing options the chain has. */
export type FireOptions = FireSettings;

export interface ModsHost {
  /** Loads hooks modules in the order policy gives; every failure is a line, never a throw. */
  load(plugins: readonly ModPlugin[]): Promise<ModLoadReport>;
  /** `/reload-plugins`: unloads every mod and loads the same plugins again. */
  reload(): Promise<ModLoadReport>;
  /**
   * A save in the directory of one mod loaded with `--plugin-dir`: its hooks module is read again and
   * `register` runs again. A save that breaks the module keeps the version loaded before.
   */
  reloadMod(name: string): Promise<ReloadOutcome | undefined>;
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
   * given, in the tier given, and it shows in `active()` as built in. `/reload-plugins` leaves it
   * alone ("Mods built into Claude Code are unaffected"); `dispose()` takes it away.
   */
  registerBuiltIn(
    name: string,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
  ): Promise<LoadedMod>;
  /**
   * The plugin directories the host loads for the session, to hand over to `load`: `--plugin-dir`,
   * then `CLAUDE_CODE_PLUGIN_DIRS` (none when `disableSideloadFlags` is on).
   */
  pluginDirs(): readonly string[];
  /** Whether a save in a `--plugin-dir` directory reloads its mod (`reloadMod`): always interactively, otherwise with `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`. */
  watchesPluginDirs(isInteractive: boolean): boolean;
  readonly ui: ModsUi;
  readonly chain: ModChain;
  active(): readonly LoadedMod[];
  dispose(): Promise<void>;
}

const noop = (): void => undefined;
/** troubleshoot.md ties the suffix to `hooks module did not load`, not to a refusal by another mod. */
const UNLOADED = '; the version loaded before is unloaded';
const DID_NOT_LOAD = 'hooks module did not load';

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
  /** What the host registered itself: a reload does not touch it. */
  const builtIns: LoadedMod[] = [];
  let plugins: readonly ModPlugin[] = [];

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
      const outcome = await loadOne(wired, mod, filesOf.get(mod.candidate.id));
      if (outcome.mod) loaded.push(outcome.mod);
      if (outcome.line !== undefined) {
        const unloaded = before.has(mod.candidate.name) && outcome.line.includes(DID_NOT_LOAD);
        lines.push(unloaded ? `${outcome.line}${UNLOADED}` : outcome.line);
      }
    }
    for (const line of lines) debug(line);
    if (options.firesSessionStart !== false) await announceStart(loaded);
    return { loaded: [...loaded], lines };
  }

  const announceStart = (mods: readonly LoadedMod[]): Promise<void> =>
    announceSessionStart({ options, chain, dispatchOptions }, mods);

  async function unloadAll(): Promise<ReadonlySet<string>> {
    const names = new Set(loaded.map((mod) => mod.name));
    for (const mod of loaded.toReversed()) await mod.unload();
    loaded = [];
    return names;
  }

  const dispatchOptions = dispatchOptionsFor({ env, debug, signal });

  return {
    load: (given) => loadAll(given, new Set()),
    reload: async () => loadAll(plugins, await unloadAll()),
    reloadMod: async (name) => {
      const done = await reloadOne(env, plugins, loaded, name);
      if (!done) return undefined;
      loaded = done.loaded;
      debug(done.outcome.line);
      if (done.replaced && options.firesSessionStart !== false)
        await announceStart([done.replaced]);
      return done.outcome;
    },
    fire: (name, input, opts = {}) => chain.dispatch(name, input, dispatchOptions(opts)),
    fireStream: (name, input, opts = {}) =>
      chain.dispatchStream(name, input, dispatchOptions(opts)),
    registerBuiltIn: async (name, tier, hooks) => {
      const mod = await wired.registerNative(name, tier, hooks);
      builtIns.push(mod);
      return mod;
    },
    pluginDirs: () => pluginDirsOf(policy),
    watchesPluginDirs: (isInteractive) => watchesPluginDirs(policy, isInteractive),
    ui: wired.ui,
    chain,
    active: () => [...builtIns, ...loaded],
    async dispose() {
      await unloadAll();
      for (const mod of builtIns.toReversed()) await mod.unload();
      builtIns.length = 0;
      background.abort(new Error('the mods host was disposed'));
    },
  };
}
