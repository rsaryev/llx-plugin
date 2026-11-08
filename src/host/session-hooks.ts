import {
  createHookEngine,
  createHookRegistry,
  ifEvaluatorFor,
  registerHooks,
  type EventFactsOf,
  type HookOutcome,
  type HookSession,
  type HookSource,
  type RegisteredHandler,
} from '../hooks/index.ts';
import type { HookEvent } from '../protocol/official.ts';
import { hookSessionGates, type HookSessionGates } from '../settings/hooks/index.ts';
import type { PolicyScope } from '../settings/index.ts';
import type { ActivePlugin, HostState } from './state.ts';
import type { SessionDirectories } from './session-directories.ts';
import type { SessionOptions } from './types.ts';

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

function sessionOf(
  state: HostState,
  gates: HookSessionGates,
  options: SessionOptions,
): Omit<HookSession, 'cwd'> {
  return {
    sessionId: options.sessionId,
    transcriptPath: options.transcriptPath,
    permissionMode: options.permissionMode,
    ...(options.effort === undefined ? {} : { effort: options.effort }),
    interactive: options.interactive ?? true,
    trusted: options.trusted ?? true,
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

/** The engine for one working directory: path rules in an `if` read it, so a `/cd` builds another. */
function engineFor(
  state: HostState,
  gates: HookSessionGates,
  options: SessionOptions,
  cwd: string,
) {
  const { ports } = state.options;
  const windows = state.options.windows ?? false;
  return createHookEngine(ports, {
    windows,
    ifEvaluator: ifEvaluatorFor({
      paths: {
        cwd,
        home: ports.locations.homeDir(),
        primaryWorkingDirectory: cwd,
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
 * The hooks of a session: every enabled plugin's, then the settings files', through the engine
 * with the policy of the settings. A skill's hooks join them when the skill is expanded
 * (`registerSkillHooks`), and a skill's `once` hook that ran is dropped after the dispatch. The
 * registry outlives a `/cd`: only the working directory the hooks see changes.
 */
export function createHookPart(
  state: HostState,
  options: SessionOptions,
  directories: SessionDirectories,
): HookPart & SkillHooksRegistrar {
  const gates = hookSessionGates(state.view, state.parent);
  const session = sessionOf(state, gates, options);
  let engine = { cwd: directories.cwd(), run: engineFor(state, gates, options, directories.cwd()) };
  let registry = createHookRegistry([
    ...state.active.flatMap(pluginEntries),
    ...settingsEntries(gates),
  ]);
  return {
    registerSkillHooks(prefix, entries) {
      const previous = registry.entries.filter((entry) => entry.id.startsWith(`${prefix}:`));
      registry = registry.without(previous.map((entry) => entry.id)).with(entries);
    },
    async dispatch(event, facts, { signal }) {
      const cwd = directories.cwd();
      if (engine.cwd !== cwd) engine = { cwd, run: engineFor(state, gates, options, cwd) };
      const outcome = await engine.run.dispatch(registry, {
        event,
        facts,
        session: { ...session, cwd },
        signal,
      });
      registry = registry.without(outcome.consumedOnce);
      return outcome;
    },
  };
}
