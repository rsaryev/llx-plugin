import {
  createHookEngine,
  createHookRegistry,
  ifEvaluatorFor,
  registerHooks,
  type EventFactsOf,
  type HookOutcome,
  type HookRegistry,
  type HookSession,
  type HookSource,
  type RegisteredHandler,
} from '../hooks/index.ts';
import type { HookEvent } from '../protocol/official.ts';
import type { HookSessionGates } from '../settings/hooks/index.ts';
import type { PolicyScope } from '../settings/index.ts';
import type { SessionCore } from './session-core.ts';
import {
  createHookScope,
  recordOutcome,
  registerEntries,
  type HookScope,
  type TurnScope,
} from './session-hook-scope.ts';
import type { SessionOptions } from './session-types.ts';
import type { ActivePlugin, HostState } from './state.ts';

/** Where the hooks of a settings file of each scope are declared (hooks.md, "Hook locations"). */
const SETTINGS_SOURCE: { readonly [S in PolicyScope]: HookSource } = {
  managed: { kind: 'settings', label: '[settings]', managed: true },
  parent: { kind: 'settings', label: '[settings]' },
  flag: { kind: 'settings', label: '[settings]' },
  local: { kind: 'settings', label: '[settings]', scope: 'local' },
  project: { kind: 'settings', label: '[settings]', scope: 'project' },
  user: { kind: 'settings', label: '[settings]', scope: 'user' },
  addDir: { kind: 'settings', label: '[settings]' },
};

const pluginEntries = (plugin: ActivePlugin): readonly RegisteredHandler[] =>
  registerHooks(plugin.plugin.hooks, {
    idPrefix: plugin.id,
    source: {
      kind: 'plugin',
      label: `[plugin:${plugin.plugin.name}]`,
      pluginName: plugin.plugin.name,
    },
    pluginId: plugin.id,
  });

const settingsEntries = (gates: HookSessionGates): readonly RegisteredHandler[] =>
  gates.settingsHooks.flatMap(({ scope, hooks }) =>
    registerHooks(hooks, { idPrefix: `settings:${scope}`, source: SETTINGS_SOURCE[scope] }),
  );

/** The hooks a session starts with: every enabled plugin's, then the settings files'. */
export const initialRegistry = (state: HostState, gates: HookSessionGates): HookRegistry =>
  createHookRegistry([...state.active.flatMap(pluginEntries), ...settingsEntries(gates)]);

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
  dispatch<E extends HookEvent>(
    event: E,
    facts: EventFactsOf<E>,
    options: { readonly signal: AbortSignal },
  ): Promise<HookOutcome<E>>;
}

/**
 * The hooks of one turn over the session's core: the engine and the `if` path context are made from
 * the turn's options (cheap), the registry is the core's, so a skill's hooks and the `once` hooks
 * already consumed are the same in every turn. A skill's `once` hook that ran is dropped after the
 * dispatch, which also leaves its `watchPaths` and background promises in the core.
 */
export function createHookPart(
  state: HostState,
  core: SessionCore,
  options: SessionOptions,
  turn?: TurnScope,
): { readonly part: HookPart & HookScope; readonly skills: SkillHooksRegistrar } {
  const { ports } = state.options;
  const { gates, registry } = core;
  const session = sessionOf(state, gates, options);
  const windows = state.options.windows ?? false;
  const engine = createHookEngine(ports, {
    windows,
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
  return {
    skills: {
      registerSkillHooks(prefix, entries) {
        registerEntries(core, prefix, entries);
      },
    },
    part: {
      ...createHookScope(core, session, turn),
      async dispatch(event, facts, { signal }) {
        const outcome = await engine.dispatch(registry.get(), { event, facts, session, signal });
        registry.set(registry.get().without(outcome.consumedOnce));
        recordOutcome(core, outcome);
        return outcome;
      },
    },
  };
}
