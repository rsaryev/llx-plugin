import {
  createHookRegistry,
  pluginOnlyAllows,
  registerHooks,
  type HookRegistry,
  type HookSource,
  type HookSourceKind,
  type RegisteredHandler,
} from '../hooks/index.ts';
import type { HookSessionGates } from '../settings/hooks/index.ts';
import type { PolicyScope } from '../settings/index.ts';
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

/** The hooks the state declares itself: every enabled plugin's, then the settings files'. */
export const declaredEntries = (
  state: HostState,
  gates: HookSessionGates,
): readonly RegisteredHandler[] => [
  ...state.active.flatMap(pluginEntries),
  ...settingsEntries(gates),
];

export const initialRegistry = (state: HostState, gates: HookSessionGates): HookRegistry =>
  createHookRegistry(declaredEntries(state, gates));

/**
 * The kinds of handler an update keeps: those a session registered after it opened (a skill's, an
 * agent's, the host's own run). The plugin and settings handlers are the state's, rebuilt from it.
 */
const KEPT: { readonly [K in HookSourceKind]: boolean } = {
  skill: true,
  agent: true,
  session: true,
  plugin: false,
  settings: false,
};

export const isScoped = (entry: RegisteredHandler): boolean => KEPT[entry.source.kind];

/**
 * Whether a scoped handler outlives an update: the plugin it belongs to still runs, and the
 * plugin-only lock of the new settings does not silence its source (judgment, spec/judgments.md: a
 * handler a lock silences is dropped at any update that finds the lock set).
 */
export function survives(
  entry: RegisteredHandler,
  state: HostState,
  gates: HookSessionGates,
): boolean {
  const pluginRuns =
    entry.pluginId === undefined || state.active.some((plugin) => plugin.id === entry.pluginId);
  return pluginRuns && (!gates.pluginOnlyHooks || pluginOnlyAllows(entry));
}
