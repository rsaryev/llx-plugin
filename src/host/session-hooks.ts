import type { SubprocessKind } from '../hooks/index.ts';
import { environmentFor, subprocessFor, type HookEnvironment } from './session-environment.ts';
export type { HookEnvironment } from './session-environment.ts';
import {
  createHookEngine,
  ifEvaluatorFor,
  type EventFactsOf,
  type HookOutcome,
  type HookSession,
  type RegisteredHandler,
} from '../hooks/index.ts';
import type { HookEvent } from '../protocol/official.ts';
import type { HookSessionGates } from '../settings/hooks/index.ts';
import { currentOf, type SessionCore } from './session-core.ts';
import {
  createHookScope,
  recordOutcome,
  registerEntries,
  type HookScope,
  type TurnScope,
} from './session-hook-scope.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostState } from './state.ts';

/**
 * The hook session of one turn: the common input fields and the gates. `promptId`, `scratchpadDir`,
 * `agent` and `folderTrustAccepted` pass through as given; absent, the input omits them.
 */
function sessionOf(
  state: HostState,
  gates: HookSessionGates,
  options: SessionOptions,
): HookSession {
  return {
    sessionId: options.sessionId,
    transcriptPath: options.transcriptPath,
    cwd: options.cwd,
    permissionMode: options.permissionMode,
    ...(options.effort === undefined ? {} : { effort: options.effort }),
    ...(options.promptId === undefined ? {} : { promptId: options.promptId }),
    ...(options.scratchpadDir === undefined ? {} : { scratchpadDir: options.scratchpadDir }),
    ...(options.agent === undefined ? {} : { agent: options.agent }),
    interactive: options.interactive ?? true,
    trusted: options.trusted ?? true,
    ...(options.folderTrustAccepted === undefined
      ? {}
      : { folderTrustAccepted: options.folderTrustAccepted }),
    disableAllHooks: gates.disableAllHooks,
    allowManagedHooksOnly: gates.allowManagedHooksOnly,
    pluginOnlyHooks: gates.pluginOnlyHooks,
    forceEnabledPlugins: new Set(
      state.active.filter((plugin) => gates.forceEnabled(plugin.id)).map((plugin) => plugin.id),
    ),
    mcpAvailable: state.options.ports.mcp !== undefined,
  };
}

/**
 * What the skills of the session use to add their hooks: the session keeps the registry, so the
 * skill part never holds hooks of its own. `prefix` names one skill; its hooks replace the ones that
 * skill registered before, so invoking it again does not stack them.
 */
export interface SkillHooksRegistrar {
  registerSkillHooks(prefix: string, entries: readonly RegisteredHandler[]): void;
}

export interface HookPart {
  readonly hookEnvironment: HookEnvironment;
  subprocessEnvironment(kind: SubprocessKind): Record<string, string>;
  dispatch<E extends HookEvent>(
    event: E,
    facts: EventFactsOf<E>,
    options: { readonly signal: AbortSignal },
  ): Promise<HookOutcome<E>>;
}

/** The engine of one dispatch: the `if` path context is the turn's, the policy and options the settings'. */
function engineOf(
  state: HostState,
  gates: HookSessionGates,
  options: SessionOptions,
  environment: HookEnvironment,
) {
  const { ports } = state.options;
  const windows = state.options.windows ?? false;
  return createHookEngine(ports, {
    windows,
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

/**
 * The hooks of one turn over the session's core: the engine and the `if` path context are made at
 * each dispatch from the turn's options and the current settings (cheap), the registry is the
 * core's, so a skill's hooks and the `once` hooks already consumed are the same in every turn. A
 * skill's `once` hook that ran is dropped after the dispatch, which also leaves its `watchPaths`
 * and background promises in the core.
 */
export function createHookPart(
  core: SessionCore,
  optionsOf: () => SessionOptions,
  turn?: TurnScope,
): { readonly part: HookPart & HookScope; readonly skills: SkillHooksRegistrar } {
  const sessionNow = (): HookSession => {
    const { state, gates } = currentOf(core);
    return sessionOf(state, gates, optionsOf());
  };
  return {
    skills: {
      registerSkillHooks(prefix, entries) {
        registerEntries(core, prefix, entries);
      },
    },
    part: {
      get hookEnvironment() {
        return environmentFor(core, optionsOf());
      },
      subprocessEnvironment: (kind) => subprocessFor(core, optionsOf(), kind),
      ...createHookScope(core, sessionNow, turn),
      async dispatch(event, facts, { signal }) {
        const { state, gates } = currentOf(core);
        const options = optionsOf();
        const session = sessionOf(state, gates, options);
        const outcome = await engineOf(
          state,
          gates,
          options,
          environmentFor(core, options),
        ).dispatch(core.registry.get(), {
          event,
          facts,
          session,
          signal,
        });
        core.registry.set(core.registry.get().without(outcome.consumedOnce));
        recordOutcome(core, outcome);
        return outcome;
      },
    },
  };
}
