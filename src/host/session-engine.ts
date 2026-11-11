import { createHookEngine, ifEvaluatorFor, type HookEngine } from '../hooks/index.ts';
import { currentOf, type EngineInputs, type SessionCore } from './session-core.ts';
import { environmentFor, portsOf } from './session-environment.ts';
import type { SessionOptions } from './session-types.ts';

/**
 * The one engine of a session (docs/API.md, "Hooks"): a session's dispatch is `createHookEngine`'s
 * dispatch, and what lasts across its dispatches (the Stop block count, the `once` holds, the
 * environment files) is the core's, so an engine built again keeps it. The engine is built again
 * only when what it is built over changes: the host's state (an update), or the turn's ports,
 * working directory, added folders or trust.
 */

const inputsOf = (core: SessionCore, options: SessionOptions): EngineInputs => ({
  state: currentOf(core).state,
  ports: options.ports,
  cwd: options.cwd,
  additionalDirectories: options.additionalDirectories,
  trusted: options.trusted,
});

const sameInputs = (a: EngineInputs, b: EngineInputs): boolean =>
  a.state === b.state &&
  a.ports === b.ports &&
  a.cwd === b.cwd &&
  a.additionalDirectories === b.additionalDirectories &&
  a.trusted === b.trusted;

function built(core: SessionCore, options: SessionOptions): HookEngine {
  const { state, gates } = currentOf(core);
  const ports = portsOf(state, options);
  const environment = environmentFor(core, options);
  const windows = state.options.windows ?? false;
  return createHookEngine(ports, {
    ...state.options.hookExecution,
    windows,
    stopCap: core.stopCap,
    onceClaims: core.onceClaims,
    settingsEnv: environment.settings.values,
    ...(environment.files === undefined ? {} : { envFiles: environment.files }),
    ...(state.options.processId === undefined ? {} : { processId: state.options.processId }),
    ifEvaluator: ifEvaluatorFor({
      paths: {
        cwd: options.cwd,
        home: ports.locations.homeDir(),
        primaryWorkingDirectory: options.cwd,
        additionalDirectories: options.additionalDirectories ?? [],
        platform: windows ? 'windows' : 'posix',
      },
    }),
    userConfigOf: (id) =>
      state.active.find((plugin) => plugin.id === id)?.userConfig ?? { declared: {}, values: {} },
    httpPolicy: gates.httpPolicy,
  });
}

export function engineFor(core: SessionCore, options: SessionOptions): HookEngine {
  const inputs = inputsOf(core, options);
  const last = core.engine.get();
  if (last !== undefined && sameInputs(last.inputs, inputs)) return last.engine;
  const engine = built(core, options);
  core.engine.set({ inputs, engine });
  return engine;
}
