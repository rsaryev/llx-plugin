import { ENGINE_ORIGIN } from '../../protocol/mods-events.ts';
import type { DispatchOptions, ModChain, ReentryInfo } from '../types.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { GUARD_NAME } from '../../protocol/mods-settings.ts';
import {
  loadMod,
  reloadMod,
  type LoadedMod,
  type LoaderEnv,
  type LoadOutcome,
  type ModPlugin,
  type ReloadOutcome,
} from './loader.ts';
import type { OrderedMod } from './order.ts';
import type { ReplayLedger, ReplayMode } from '../api/replay.ts';
import type { Wired } from './wiring.ts';

/** What the host passes the chain when it fires an event itself. */
export interface FireSettings {
  readonly signal?: AbortSignal;
  /** Claude Code's own behaviour, at the end of the chain; without it the chain ends in `undefined`. */
  readonly core?: (e: unknown) => Promise<unknown> | AsyncGenerator<unknown, unknown>;
  /** Where managed `PreToolUse` hooks run: before the first mod; an answer here stops the chain. */
  readonly before?: DispatchOptions['before'];
  /** Only this mod's hooks handle the event. */
  readonly only?: string;
  readonly reentry?: ReentryInfo;
  readonly groupMs?: number;
}

/** The dispatch options of an event the host fires, from what the caller gave and the host's own signal and log. */
export const dispatchOptionsFor =
  (host: {
    readonly env: LoaderEnv;
    readonly debug: (line: string) => void;
    readonly signal: AbortSignal;
  }) =>
  (opts: FireSettings): DispatchOptions => ({
    origin: ENGINE_ORIGIN,
    signal: opts.signal ?? host.signal,
    core: opts.core ?? (() => Promise.resolve(undefined)),
    report: host.env.report,
    debug: host.debug,
    ...(opts.before === undefined ? {} : { before: opts.before }),
    ...(opts.only === undefined ? {} : { only: opts.only }),
    ...(opts.reentry === undefined ? {} : { reentry: opts.reentry }),
    ...(opts.groupMs === undefined ? {} : { groupMs: opts.groupMs }),
  });

export interface ReloadedOne {
  readonly outcome: ReloadOutcome;
  /** The mods loaded after it: the new version in the old one's place, or without it when neither version runs. */
  readonly loaded: LoadedMod[];
  /** The new version, when there is one: `session.start` fires for it again. */
  readonly replaced?: LoadedMod;
}

/** Reloads the loaded mod `name` from its plugin, or `undefined` when the host has no such mod. */
export async function reloadOne(
  env: LoaderEnv,
  plugins: readonly ModPlugin[],
  loaded: readonly LoadedMod[],
  name: string,
): Promise<ReloadedOne | undefined> {
  const index = loaded.findIndex((mod) => mod.name === name);
  const current = loaded[index];
  const plugin = plugins.find((candidate) => candidate.candidate.name === name);
  if (!current || !plugin) return undefined;
  const outcome = await reloadMod(
    env,
    current,
    { candidate: plugin.candidate, tier: current.tier },
    plugin.files,
  );
  const next = outcome.mod
    ? loaded.with(index, outcome.mod)
    : loaded.filter((mod) => mod !== current);
  return {
    outcome,
    loaded: [...next],
    ...(outcome.mod && outcome.mod !== current ? { replaced: outcome.mod } : {}),
  };
}

/** `session.start` for each mod, to that mod alone, with the surface, whether the session is interactive and the directory. */
export async function announceSessionStart(
  host: {
    readonly options: {
      readonly iface: { surface(): string };
      readonly ports: { readonly session: { cwd(): Promise<string> } };
      readonly isInteractive?: boolean;
    };
    readonly chain: ModChain;
    readonly dispatchOptions: (opts: FireSettings) => DispatchOptions;
    /** Numbers the calls of each `session.start`, so a fresh copy's repeated calls are not made again. */
    readonly replay: ReplayLedger;
  },
  mods: readonly LoadedMod[],
  mode: ReplayMode,
): Promise<void> {
  const input = {
    surface: host.options.iface.surface(),
    isInteractive: host.options.isInteractive ?? true,
    cwd: await host.options.ports.session.cwd(),
  };
  for (const mod of mods) {
    await host.replay.window(mod.name, mode, () =>
      host.chain.dispatch('session.start', input, host.dispatchOptions({ only: mod.name })),
    );
  }
}

/** The guard is registered by the host; every other module is the loader's. */
export async function loadOne(
  wired: Pick<Wired, 'env' | 'registerGuard'>,
  mod: OrderedMod,
  files: PluginFiles | undefined,
): Promise<LoadOutcome> {
  if (mod.candidate.isBuiltin && mod.candidate.name === GUARD_NAME) {
    return { mod: await wired.registerGuard() };
  }
  return files ? loadMod(wired.env, mod, files) : {};
}
