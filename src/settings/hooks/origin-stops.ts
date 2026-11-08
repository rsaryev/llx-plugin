import { parsePluginId } from '../plugins/plugin-id.ts';
import type {
  ForceEnabled,
  HookFrontmatterOwner,
  HookSource,
  PluginHookSource,
  Stops,
} from './origins.ts';

/**
 * Which lock stops a hook of each origin: one registry typed over the origin kinds, so a new kind
 * fails to compile until it says what the locks do to it. `disableAllHooks` is two columns because
 * its reach "depends on which file carries the key" (settings-reference.md).
 */
const NEVER: Stops = {
  managedDisable: false,
  otherDisable: false,
  managedOnly: false,
  pluginOnly: false,
  commandSource: false,
};

/** A hook that every lock but the one on `strictPluginOnlyCustomization.hooks` stops: the user's own. */
const OWN: Stops = {
  ...NEVER,
  managedDisable: true,
  otherDisable: true,
  managedOnly: true,
  pluginOnly: true,
};

/** The built-in plugins ("Mods built into Claude Code") are not stopped by any of these settings. */
const isBuiltin = (id: string): boolean => parsePluginId(id)?.origin === 'builtin';

/**
 * A plugin's hooks. Under `allowManagedHooksOnly` and a `disableAllHooks` outside managed settings
 * they run only when managed settings force-enable the plugin, and a mod only when it also counts as
 * the organization's ("A mod in such a plugin loads only when it counts as your organization's").
 */
function pluginStops(plugin: PluginHookSource, forceEnabled: ForceEnabled): Stops {
  if (isBuiltin(plugin.id)) return NEVER;
  const trusted = forceEnabled(plugin.id) && (!plugin.isMod || plugin.isOrgMod);
  return {
    managedDisable: true,
    otherDisable: !trusted,
    managedOnly: !trusted,
    pluginOnly: plugin.skillsDirPlugin,
    commandSource: plugin.commandSource,
  };
}

type Kind = HookSource['kind'];
type Members = { readonly [K in Kind]: Extract<HookSource, { readonly kind: K }> };
type Registry = {
  readonly [K in Kind]: (origin: Members[K], forceEnabled: ForceEnabled) => Stops;
};

/** Frontmatter hooks of an agent are blocked under `allowManagedHooksOnly` whatever the source. */
const AGENT_BLOCKED: { readonly [O in HookFrontmatterOwner]: boolean } = {
  skill: false,
  command: false,
  agent: true,
};

type Frontmatter = Members['frontmatter'];
type From = Frontmatter['from'];
type FromMembers = { readonly [F in From]: Extract<Frontmatter, { readonly from: F }> };
type FromRegistry = {
  readonly [F in From]: (origin: FromMembers[F], forceEnabled: ForceEnabled) => Stops;
};

/** A skill, command or agent of the managed policy directory or bundled with Claude Code. */
const OUR_OWN: Stops = { ...NEVER, managedDisable: true, managedOnly: true };

const FROM: FromRegistry = {
  user: () => OWN,
  project: () => OWN,
  addDir: () => OWN,
  synced: () => OWN,
  managed: () => OUR_OWN,
  bundled: () => OUR_OWN,
  plugin: (origin, forceEnabled) => {
    const stops = pluginStops(origin.plugin, forceEnabled);
    return { ...stops, managedOnly: stops.managedOnly || AGENT_BLOCKED[origin.owner] };
  },
};

function applyFrom<F extends From>(
  registry: { readonly [P in F]: (origin: FromMembers[P], forceEnabled: ForceEnabled) => Stops },
  from: F,
  origin: FromMembers[F],
  forceEnabled: ForceEnabled,
): Stops {
  return registry[from](origin, forceEnabled);
}

const STOPS: Registry = {
  managedSettings: () => ({ ...NEVER, managedDisable: true }),
  sdkCallback: () => NEVER,
  settings: () => OWN,
  plugin: (origin, forceEnabled) => pluginStops(origin, forceEnabled),
  frontmatter: (origin, forceEnabled) => applyFrom(FROM, origin.from, origin, forceEnabled),
};

function apply<K extends Kind>(
  registry: { readonly [P in K]: (origin: Members[P], forceEnabled: ForceEnabled) => Stops },
  kind: K,
  origin: Members[K],
  forceEnabled: ForceEnabled,
): Stops {
  return registry[kind](origin, forceEnabled);
}

/** Which locks stop a hook of this origin. */
export const stopsOf = (origin: HookSource, forceEnabled: ForceEnabled): Stops =>
  apply(STOPS, origin.kind, origin, forceEnabled);
