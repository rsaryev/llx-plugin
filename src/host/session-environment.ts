import {
  createEnvFiles,
  subprocessEnvironment,
  type EnvFiles,
  type HookPorts,
  type SubprocessKind,
} from '../hooks/index.ts';
import type { Environment } from '../ports/index.ts';
import { applySettingsEnv, resolveSettingsEnv, type SettingsEnv } from '../settings/index.ts';

import { currentOf, type SessionCore } from './session-core.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostState } from './state.ts';
import { SUBPROCESS_ONLY } from '../settings/env/resolve-env.ts';

export interface HookEnvironment {
  readonly settings: SettingsEnv;
  readonly files?: EnvFiles;
}
const FILES = new WeakMap<SessionCore, EnvFiles>();

/** The host's ports with each port the turn's `ports` gives in place of the host's of that name. */
const launchPortsOf = (state: HostState, options: SessionOptions): HookPorts => ({
  ...state.options.ports,
  ...options.ports,
});

/**
 * The settings `env` that applies to the session: the files' values over its launch environment
 * (the environment port as the host or the turn gave it), with trust and the launch environment's
 * precedence (settings-reference.md, "How `env` values interact with your shell").
 */
function settingsEnvOf(state: HostState, options: SessionOptions): SettingsEnv {
  return resolveSettingsEnv(state.view.layers, {
    isFolderTrusted: () => options.trusted ?? true,
    environment: launchPortsOf(state, options).environment.snapshot(),
    windows: state.options.windows ?? false,
    ...(state.options.launchOwnsEnvironment === undefined
      ? {}
      : { launchOwnsEnvironment: state.options.launchOwnsEnvironment }),
  });
}

/**
 * Claude Code's own process environment: "Claude Code writes each `env` entry into the process
 * environment, replacing the value inherited from the shell" (env-vars.md, "Set variables in settings
 * files"), all but `NO_COLOR` and `FORCE_COLOR`, which "reach only subprocesses". Read lazily, at the
 * first variable asked.
 */
function processEnvironment(
  launch: Environment,
  settings: () => SettingsEnv,
  windows: boolean,
): Environment {
  const fold = (name: string): string => (windows ? name.toUpperCase() : name);
  let own: Readonly<Record<string, string>> | undefined;
  const ownOf = () =>
    (own ??= Object.fromEntries(
      Object.entries(settings().values).filter(([name]) => !SUBPROCESS_ONLY.includes(name)),
    ));
  return {
    get: (name) =>
      Object.entries(ownOf()).find(([key]) => fold(key) === fold(name))?.[1] ?? launch.get(name),
    snapshot: () => applySettingsEnv(launch.snapshot(), ownOf(), windows),
  };
}

/**
 * The ports of a session's turn: the host's, each port the turn's `ports` gives replacing the
 * host's of that name, with the environment Claude Code's process has (the settings `env` over the
 * port's). The engine, the skills, the workflows, the agents and the components read these, so a
 * session's own ports are the ones all of them see.
 */
export function portsOf(state: HostState, options: SessionOptions): HookPorts {
  const launch = launchPortsOf(state, options);
  const windows = state.options.windows ?? false;
  const settings = () => settingsEnvOf(state, options);
  return { ...launch, environment: processEnvironment(launch.environment, settings, windows) };
}

/** Environment files live for the session; settings environment is read afresh after host.update. */
export function environmentFor(core: SessionCore, options: SessionOptions): HookEnvironment {
  const { state } = currentOf(core);
  const { environment } = launchPortsOf(state, options);
  let files = FILES.get(core);
  if (files === undefined && state.options.envFiles !== undefined) {
    const inherited = environment.get('CLAUDE_ENV_FILE');
    files = createEnvFiles(state.options.envFiles, {
      sessionId: options.sessionId,
      launchScript: inherited === '' ? undefined : inherited,
    });
    FILES.set(core, files);
  }
  const settings = settingsEnvOf(state, options);
  return { settings, ...(files === undefined ? {} : { files }) };
}

export function subprocessFor(core: SessionCore, options: SessionOptions, kind: SubprocessKind) {
  const { state } = currentOf(core);
  return subprocessEnvironment({
    kind,
    environment: launchPortsOf(state, options).environment.snapshot(),
    settingsEnv: environmentFor(core, options).settings.values,
    windows: state.options.windows ?? false,
    sessionId: options.sessionId,
    processId: state.options.processId,
    effort: options.effort?.level,
  });
}
