import {
  createHookRegistry,
  SOURCE_POLICY,
  withoutSpent,
  type HookRegistry,
  type HookSource,
  type RegisteredHandler,
} from '../hooks/index.ts';

import type { PolicyScope } from '../settings/index.ts';
import type { Seen, SessionCore } from './session-core.ts';
import type { HookHandle } from './session-hook-scope.ts';
import type { ActivePlugin, HostState } from './state.ts';
import { pluginOnlyAllows } from '../hooks/select/lock-gates.ts';
import { registerHooks } from '../hooks/register.ts';
import type { HookSessionGates } from '../settings/hooks/session-gates.ts';

/**
 * The hooks of a session and every change made to them: what the state declares, what a skill, an
 * agent or the host's run registers, what an update keeps and what a `once` run spends. Nothing
 * else writes `core.registry`.
 */

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
const declaredEntries = (
  state: HostState,
  gates: HookSessionGates,
): readonly RegisteredHandler[] => [
  ...state.active.flatMap(pluginEntries),
  ...settingsEntries(gates),
];

export const initialRegistry = (state: HostState, gates: HookSessionGates): HookRegistry =>
  createHookRegistry(declaredEntries(state, gates));

/** A handler the session registered after it opened: an update keeps it (`SourcePolicy.scoped`). */
const isScoped = (entry: RegisteredHandler): boolean => SOURCE_POLICY[entry.source.kind].scoped;

/**
 * Whether a scoped handler outlives an update: the plugin it belongs to still runs, and the
 * plugin-only lock of the new settings does not silence its source (judgment, spec/judgments.md: a
 * handler a lock silences is dropped at any update that finds the lock set).
 */
function survives(entry: RegisteredHandler, state: HostState, gates: HookSessionGates): boolean {
  const pluginRuns =
    entry.pluginId === undefined || state.active.some((plugin) => plugin.id === entry.pluginId);
  return pluginRuns && (!gates.pluginOnlyHooks || pluginOnlyAllows(entry));
}

/** The registrations without the ids an update dropped; one left with none is forgotten. */
function settleRegistrations(core: SessionCore, lost: ReadonlySet<string>): void {
  for (const [prefix, registration] of core.registrations) {
    const ids = registration.ids.filter((id) => !lost.has(id));
    if (ids.length === registration.ids.length) continue;
    if (ids.length === 0) core.registrations.delete(prefix);
    else core.registrations.set(prefix, { ids });
  }
}

/**
 * The registry of a new state: the declared handlers are rebuilt from it, the scoped ones stay
 * when they survive it (`survives`), and the registrations follow what stayed.
 */
export function refreshRegistry(core: SessionCore, { state, gates }: Seen): void {
  const scoped = core.registry.get().entries.filter(isScoped);
  const kept = scoped.filter((entry) => survives(entry, state, gates));
  const stays = new Set(kept);
  const lost = new Set(scoped.filter((entry) => !stays.has(entry)).map((entry) => entry.id));
  core.registry.set(createHookRegistry([...declaredEntries(state, gates), ...kept]));
  settleRegistrations(core, lost);
}

/** Drops what `prefix` registered: by the ids it registered, so removal never matches by text. */
export function dropRegistration(core: SessionCore, prefix: string): void {
  const registration = core.registrations.get(prefix);
  core.registrations.delete(prefix);
  core.registry.set(core.registry.get().without(registration?.ids ?? []));
}

/**
 * Registers `entries` under `prefix`, replacing the ones the prefix registered before ("replaces,
 * never stacks", as a skill invoked again does). An entry the current state would drop at an
 * update (its plugin no longer runs, or the plugin-only lock silences it) is not registered, as
 * docs/API.md ("Updating") keeps scoped hooks "unless their pluginId no longer runs". The handle
 * removes them unless the prefix was registered again since.
 */
export function registerEntries(
  core: SessionCore,
  seen: Seen,
  prefix: string,
  entries: readonly RegisteredHandler[],
): HookHandle {
  const kept = entries.filter((entry) => survives(entry, seen.state, seen.gates));
  const registration = { ids: kept.map((entry) => entry.id) };
  const previous = core.registrations.get(prefix);
  core.registrations.set(prefix, registration);
  core.registry.set(
    core.registry
      .get()
      .without(previous?.ids ?? [])
      .with(kept),
  );
  return {
    remove: () => {
      if (core.registrations.get(prefix) === registration) dropRegistration(core, prefix);
    },
  };
}

/**
 * Drops the `once` registrations a run spent (`OnceClaims`): by identity, so a hook registered
 * again under the same id while the run was in flight stays.
 */
export function dropSpent(core: SessionCore): void {
  const registry = core.registry.get();
  const kept = withoutSpent(registry, core.onceClaims);
  if (kept !== registry) core.registry.set(kept);
}
