import type { SessionEndReason } from '../../protocol/exit-reasons.ts';
import { type AnyModEventName, type StreamEventName } from '../../protocol/mods-events.ts';
import { registeredView, type ModsRegistered } from './registered.ts';
import { commandPresentation, withDefaultPorts, type RunGate } from '../api/index.ts';
import type {
  ChunkOf,
  EventOf,
  ModChain,
  RegisteredHook,
  RegisterTier,
  ResultOf,
} from '../types.ts';
import type { ModsUi } from '../ui/index.ts';
import type { LoadedMod, ModPlugin, ReloadOutcome } from './loader.ts';
import {
  announceSessionStart,
  dispatchOptionsFor,
  runCommandThrough,
  sessionEndInput,
  type FireSettings,
  type RunCommandOptions,
} from './host-support.ts';
import { createModSet, type ModLoadReport } from './mod-set.ts';
import { modLineChannel } from './line-channel.ts';
import { createReplayLedger, replayedLine } from '../api/replay.ts';
import { pluginDirsOf, watchesPluginDirs } from './plugin-dirs.ts';
import { wire } from './wiring.ts';
import type { ModsHostOptions } from './host-options.ts';

export type { ModsHostOptions } from './host-options.ts';

export type { ModLoadReport } from './mod-set.ts';

/** What a caller of `fire` may give: its own signal, the core behaviour at the end of the chain, and the narrowing options the chain has. */
export type FireOptions = FireSettings;
export type { CommandOrigin, RunCommandOptions } from './host-support.ts';

export interface ModsHost {
  /**
   * Loads hooks modules in the order policy gives; every failure is a line, never a throw. A mod is
   * keyed by its name: a plugin loaded again replaces its earlier copy, it is never added twice.
   */
  load(plugins: readonly ModPlugin[]): Promise<ModLoadReport>;
  /**
   * Loads one plugin among the mods already loaded ("One mod": turning a mod on again). Its tier
   * comes from policy; it runs last in its tier, and a line says when the policy would have put it
   * earlier. A copy of the plugin that is loaded is replaced. The built-in guard loads first when policy needs it.
   */
  loadMod(plugin: ModPlugin): Promise<ModLoadReport>;
  /**
   * Turns one mod off: its hooks stop, what it added goes, and `reload` does not bring it back.
   * Answers whether a mod was unloaded, so asking twice is harmless. The built-in guard stays.
   */
  unloadMod(name: string): Promise<boolean>;
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
  /**
   * The user runs `/<command>`: fires `command.run`. A command a mod registered that reaches the end of
   * the chain with no answer gets `<mod> registered /<command> but no command.run hook answered it`
   * (troubleshoot.md); any other command ends in `options.core`, the host's own behaviour: the
   * command's body only, never `runCommand` again (docs/API.md, "The mods API").
   */
  runCommand(
    command: string,
    args: string,
    options?: RunCommandOptions,
  ): Promise<ResultOf<'command.run'>>;
  /**
   * The session ends: fires `session.end` with `reason`, `sessionId` (the session port's id) and
   * `resume: { id }` (claude-code/index.d.ts:12106). `options.core` is the host's own ending.
   */
  endSession(reason: SessionEndReason, options?: FireOptions): Promise<ResultOf<'session.end'>>;
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
  /**
   * Tells the session what happened to its input, which decides what its mods' calls return: after
   * `interrupt` the calls that start new work are refused until `userInput`; after `endInput` they are
   * refused for good. `setLimits` replaces `limits` for the next run of a host that outlives one.
   */
  readonly input: Pick<RunGate, 'interrupt' | 'userInput' | 'endInput' | 'setLimits' | 'notice'>;
  /**
   * `/clear`, `/resume` and `/branch` reset every `$.state` value to its default, and `session.start`
   * does not fire again (interface.md, "Load a saved value again after `/clear`"). The host calls this
   * for each of them; it then fires `classic.SessionStart` with `source` set to `clear`, `resume` or
   * `fork`, which is the hook a mod loads its saved values again in.
   */
  resetState(): void;
  readonly ui: ModsUi;
  readonly chain: ModChain;
  /** What mods registered: commands, tools and subagent types, and when that changes (read only). */
  readonly registered: ModsRegistered;
  active(): readonly LoadedMod[];
  /** Notes for plugin details/Errors; conditional protected rows with no door filter get no note. */
  guardedHookNotes(name: string): readonly string[];
  dispose(): Promise<void>;
}

const noop = (): void => undefined;

/** The mods runtime for one session. */
function lifetime(parts: {
  readonly wired: ReturnType<typeof wire>;
  readonly mods: ReturnType<typeof createModSet>;
  readonly builtIns: LoadedMod[];
  readonly background: AbortController;
  readonly stopListening: (() => void) | undefined;
}): Pick<
  ModsHost,
  'input' | 'resetState' | 'ui' | 'chain' | 'registered' | 'active' | 'guardedHookNotes' | 'dispose'
> {
  const { wired, mods, builtIns, background, stopListening } = parts;
  return {
    input: wired.gate,
    resetState: () => wired.state.reset(),
    ui: wired.ui,
    chain: wired.chain,
    registered: registeredView(wired.registries),
    active: () => [...builtIns, ...mods.loaded()],
    guardedHookNotes: (name) => {
      const mod = mods.loaded().find((loaded) => loaded.name === name);
      return mod === undefined ? [] : wired.guardNotes(mod);
    },
    async dispose() {
      stopListening?.();
      await mods.unloadAll();
      for (const mod of builtIns.toReversed()) await mod.unload();
      builtIns.length = 0;
      background.abort(new Error('the mods host was disposed'));
    },
  };
}

/** The facts of the session a line about a mod is placed by, read at each line. */
const sessionFacts = (options: ModsHostOptions) => ({
  isInteractive: options.isInteractive ?? true,
  pluginDir: pluginDirsOf(options.policy).length > 0,
  ...(options.hotReload === undefined ? {} : { hotReload: options.hotReload() }),
  ...(options.outputFormat === undefined ? {} : { outputFormat: options.outputFormat }),
});

export function createModsHost(options: ModsHostOptions): ModsHost {
  const debug = options.debug ?? noop;
  const background = new AbortController();
  // Work stops when the host's signal aborts and when the host is disposed, whichever comes first.
  const signal = options.signal
    ? AbortSignal.any([options.signal, background.signal])
    : background.signal;
  const { policy } = options;
  const notify = options.onNotice ?? noop;
  const sessionNow = () => sessionFacts(options);
  /** The calls a fresh copy of a mod's `session.start` does not make again, with the line that says so. */
  const replay = createReplayLedger((mod, kind) => {
    const line = replayedLine(mod, kind);
    debug(line);
    notify({ line, channel: modLineChannel(sessionNow(), 'fresh-copy') });
  });
  const ports = withDefaultPorts(options.ports);
  const wired = wire({
    ...options,
    ports,
    debug,
    report: options.report ?? noop,
    signal,
    replay,
    guardNotice: (line) => notify({ line, channel: modLineChannel(sessionNow(), 'guard-lift') }),
  });
  const { chain, env } = wired;
  /** What the host registered itself: a reload does not touch it. */
  const builtIns: LoadedMod[] = [];
  const dispatchOptions = dispatchOptionsFor({ env, debug, signal });
  const mods = createModSet({
    wired,
    policy,
    debug,
    announce: (started, mode) =>
      options.firesSessionStart === false
        ? Promise.resolve()
        : announceSessionStart({ options, chain, dispatchOptions, replay }, started, mode),
    session: sessionNow,
    notify,
    forget: (name) => replay.forget(name),
  });
  /** The worker's replacement is handled before the runtime goes on (`ModRuntime.onCrash`). */
  const stopListening = options.runtime.onCrash?.((crash) => mods.crashed(crash));

  return {
    load: (given) => mods.load(given),
    loadMod: (plugin) => mods.loadMod(plugin),
    unloadMod: (name) => mods.unloadMod(name),
    reload: () => mods.reload(),
    reloadMod: (name) => mods.reloadMod(name),
    fire: (name, input, opts = {}) => chain.dispatch(name, input, dispatchOptions(opts)),
    runCommand: (command, args, opts = {}) =>
      runCommandThrough(
        {
          registries: wired.registries,
          chain,
          dispatchOptions,
          presentation: () => commandPresentation(options.iface.viewport()),
        },
        { command, args },
        opts,
      ),
    endSession: async (reason, opts = {}) =>
      chain.dispatch(
        'session.end',
        await sessionEndInput(ports.session, reason),
        dispatchOptions(opts),
      ),
    fireStream: (name, input, opts = {}) =>
      chain.dispatchStream(name, input, dispatchOptions(opts)),
    registerBuiltIn: async (name, tier, hooks) => {
      const mod = await wired.registerNative(name, tier, hooks);
      builtIns.push(mod);
      return mod;
    },
    pluginDirs: () => pluginDirsOf(policy),
    watchesPluginDirs: (isInteractive) => watchesPluginDirs(policy, isInteractive),
    ...lifetime({ wired, mods, builtIns, background, stopListening }),
  };
}
