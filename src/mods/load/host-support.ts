import { ENGINE_ORIGIN } from '../../protocol/mods-events.ts';
import type { DispatchOptions, ModChain, ReentryInfo } from '../types.ts';
import type { PluginFiles } from '../../ports/index.ts';
import { GUARD_NAME } from '../../protocol/mods-settings.ts';
import {
  loadMod,
  reloadMod,
  type LoadedMod,
  type LoaderEnv,
  type ModPlugin,
  type ReloadOutcome,
} from './loader.ts';
import { sameSlot, type OrderedMod } from './order.ts';
import type { LoadOutcome } from './prepare.ts';
import type { ReplayLedger, ReplayMode } from '../api/replay.ts';
import type { Wired } from './wiring.ts';
import { commandRunEnd } from '../events/index.ts';
import type { CommandPresentation, CommandRunDepth } from '../api/index.ts';
import type { SessionEndReason } from '../../protocol/exit-reasons.ts';

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

/**
 * The input of `session.end` (claude-code/index.d.ts:12106): the reason, the ending session's id and
 * what `claude --resume` takes to return to it, the same id (:12612).
 */
export async function sessionEndInput(
  session: { id(): Promise<string> },
  reason: SessionEndReason,
): Promise<{ reason: SessionEndReason; sessionId: string; resume: { id: string } }> {
  const sessionId = await session.id();
  return { reason, sessionId, resume: { id: sessionId } };
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
  const outcome = await reloadMod(env, current, sameSlot(current, plugin.candidate), plugin.files);
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

/**
 * Who ran a command, in `prompt.submit`'s words (claude-code/index.d.ts:9635, `PromptOrigin`):
 * `composer` for the person's Enter, `sdk`, `bridge`, ... The host stamps it; one it does not stamp
 * is `unclassified`, "a command queued with no stamp at all".
 */
export interface CommandOrigin {
  readonly kind: string;
  readonly [field: string]: unknown;
}

/** What `ModsHost.runCommand` takes besides the command: the fire options, and who ran it. */
export interface RunCommandOptions extends FireSettings {
  readonly origin?: CommandOrigin;
}

/**
 * `command.run` for a command the user typed: a command a mod registered that reaches the end of the
 * chain with no answer gets the reply of troubleshoot.md ("`no command.run hook answered it`"), any
 * other ends in the host's own behaviour. The event carries `origin` and `presentation`
 * (claude-code/index.d.ts:1836); `command` is pinned, so the lookup is of the command as fired.
 */
interface CommandHost {
  readonly registries: Wired['registries'];
  readonly chain: ModChain;
  readonly dispatchOptions: (opts: FireSettings) => DispatchOptions;
  readonly presentation: () => CommandPresentation;
}

interface CommandRequest {
  readonly command: string;
  readonly args: string;
}

/** The `command.run` chain of one `runCommand`: the hooks, then the body, marked as that command's. */
function fireCommand(host: CommandHost, request: CommandRequest, opts: RunCommandOptions) {
  const { origin = { kind: 'unclassified' }, ...fire } = opts;
  const { commandRuns } = host.registries;
  return host.chain.dispatch(
    'command.run',
    { ...request, origin, presentation: host.presentation() },
    host.dispatchOptions({
      ...fire,
      core: (e) =>
        commandRunEnd(host.registries.commands.get(request.command)?.plugin, request.command, () =>
          commandRuns.within(request.command, 'body', () => fire.core?.(e) ?? Promise.resolve({})),
        ),
    }),
  );
}

/**
 * A `runCommand` from inside the body of the same command (`options.core` or `ModCommands.run`
 * calling it again): `command.run` is "one slash command about to run" (claude-code/index.d.ts:1834),
 * and its hooks have run, so the body runs at once with the event as the nested call gives it. A
 * body that calls `runCommand` once more would never end, and is refused.
 */
const NESTED_RUN: {
  readonly [D in CommandRunDepth]: (
    host: CommandHost,
    request: CommandRequest,
    opts: RunCommandOptions,
  ) => Promise<unknown>;
} = {
  outside: fireCommand,
  body: (host, request, opts) => {
    const { origin = { kind: 'unclassified' }, core } = opts;
    const e = { ...request, origin, presentation: host.presentation() };
    return host.registries.commandRuns.within(request.command, 'collapsed', () =>
      Promise.resolve(core?.(e) ?? {}),
    );
  },
  collapsed: (_host, request) =>
    Promise.reject(
      new Error(`/${request.command}: its body ran runCommand for itself again; refused`),
    ),
};

export function runCommandThrough(
  host: CommandHost,
  request: CommandRequest,
  opts: RunCommandOptions,
): Promise<unknown> {
  const depth = host.registries.commandRuns.depth(request.command);
  return NESTED_RUN[depth](host, request, opts);
}
