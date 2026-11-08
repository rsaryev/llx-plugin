import type { SettingSource } from '../../protocol/official.ts';
import type { HookSession, HookSourceKind, RegisteredHandler } from '../contracts.ts';

/**
 * The two managed settings that narrow where hooks may come from (hooks.md, "Hook locations" and
 * "Limits on skill hooks"; settings-reference.md, "allowManagedHooksOnly" and
 * "strictPluginOnlyCustomization.hooks"). Each is a gate per source kind, typed over the kinds.
 */

type Lock = (entry: RegisteredHandler, session: HookSession) => boolean;

const open: Lock = () => true;
const blocked: Lock = () => false;
const managed: Lock = (entry) => entry.source.managed === true;

/** Hooks of a plugin force-enabled in managed `enabledPlugins`, matched on its full id. */
const forceEnabled: Lock = (entry, session) =>
  entry.pluginId !== undefined && session.forceEnabledPlugins?.has(entry.pluginId) === true;

/**
 * `allowManagedHooksOnly: true`: "Your user, project, local, and plugin hooks are blocked. Hooks
 * from plugins force-enabled in managed settings `enabledPlugins` are exempt"; managed hooks and
 * the SDK's in-process hooks (the `session` kind) run; "hooks declared in agent frontmatter" are
 * blocked. Judgment (spec/judgments.md): a skill's frontmatter hooks follow the same split as the
 * rest, so they run only when the skill is managed or comes from a force-enabled plugin.
 */
const MANAGED_ONLY: { readonly [K in HookSourceKind]: Lock } = {
  settings: managed,
  skill: (entry, session) => managed(entry, session) || forceEnabled(entry, session),
  agent: blocked,
  plugin: forceEnabled,
  session: open,
};

/** The settings files a user or project owns: the ones a plugin-only lock silences. */
const USER_OWNED_SCOPES: { readonly [S in SettingSource]: boolean } = {
  user: true,
  project: true,
  local: true,
};

/**
 * "Hooks from user, project, and local `settings.json`" and the frontmatter hooks of skills and
 * agents "from the sources that a `skills` or `agents` lock would block" stop; "hooks in managed
 * settings, and hooks from plugins" keep running, and a skill keeps its frontmatter hooks only if
 * it is "a plugin skill, a bundled skill, or a skill in the managed settings directory". A source
 * with no user or project scope (a bundled skill, a `--settings` file) is not the user's own.
 */
const notUserOwned: Lock = (entry) => {
  const { managed: isManaged, pluginName, scope } = entry.source;
  if (isManaged === true || pluginName !== undefined || scope === undefined) return true;
  return !USER_OWNED_SCOPES[scope];
};

const PLUGIN_ONLY: { readonly [K in HookSourceKind]: Lock } = {
  settings: notUserOwned,
  skill: notUserOwned,
  agent: notUserOwned,
  plugin: open,
  session: open,
};

/** Whether neither managed lock the session has set keeps the handler's source from running. */
export const passesLocks = (entry: RegisteredHandler, session: HookSession): boolean =>
  (session.allowManagedHooksOnly !== true || MANAGED_ONLY[entry.source.kind](entry, session)) &&
  (session.pluginOnlyHooks !== true || PLUGIN_ONLY[entry.source.kind](entry, session));
