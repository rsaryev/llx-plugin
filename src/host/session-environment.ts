import {
  createEnvFiles,
  subprocessEnvironment,
  type EnvFiles,
  type SubprocessKind,
} from '../hooks/index.ts';
import { resolveSettingsEnv, type SettingsEnv } from '../settings/index.ts';
import { currentOf, type SessionCore } from './session-core.ts';
import type { SessionOptions } from './session-types.ts';

export interface HookEnvironment {
  readonly settings: SettingsEnv;
  readonly files?: EnvFiles;
}
const FILES = new WeakMap<SessionCore, EnvFiles>();

/** Environment files live for the session; settings environment is read afresh after host.update. */
export function environmentFor(core: SessionCore, options: SessionOptions): HookEnvironment {
  const { state } = currentOf(core);
  const { ports, envFiles } = state.options;
  let files = FILES.get(core);
  if (files === undefined && envFiles !== undefined) {
    const inherited = ports.environment.get('CLAUDE_ENV_FILE');
    files = createEnvFiles(envFiles, { launchScript: inherited === '' ? undefined : inherited });
    FILES.set(core, files);
  }
  const settings = resolveSettingsEnv(state.view.layers, {
    isFolderTrusted: () => options.trusted ?? true,
    environment: ports.environment.snapshot(),
    windows: state.options.windows ?? false,
    ...(state.options.launchOwnsEnvironment === undefined
      ? {}
      : { launchOwnsEnvironment: state.options.launchOwnsEnvironment }),
  });
  return { settings, ...(files === undefined ? {} : { files }) };
}

export function subprocessFor(core: SessionCore, options: SessionOptions, kind: SubprocessKind) {
  const { state } = currentOf(core);
  return subprocessEnvironment({
    kind,
    environment: state.options.ports.environment.snapshot(),
    settingsEnv: environmentFor(core, options).settings.values,
    windows: state.options.windows ?? false,
    sessionId: options.sessionId,
    processId: state.options.processId,
  });
}
