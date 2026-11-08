/**
 * A plugin id is `<name>@<origin>`: the origin is a marketplace name or one of the reserved ones
 * (`inline`, `skills-dir`, `synced`, plugins/loading.md, "Find where a plugin came from") or
 * `builtin` for a plugin inside Claude Code (settings-reference.md, `pluginConfigs`).
 */
export type PluginId = `${string}@${string}`;

export interface ParsedPluginId {
  readonly name: string;
  readonly origin: string;
}

/** One `@`, no whitespace, a name and an origin on each side: the shape `enabledPlugins` reads. */
const PLUGIN_ID = /^([^@\s]+)@([^@\s]+)$/;

export function parsePluginId(text: string): ParsedPluginId | undefined {
  const [, name, origin] = PLUGIN_ID.exec(text) ?? [];
  return name === undefined || origin === undefined ? undefined : { name, origin };
}

export const isPluginId = (text: string): text is PluginId => parsePluginId(text) !== undefined;

/**
 * A built-in plugin that two releases name differently, current id first. The docs give two:
 * `pluginConfigs` reads the Project instructions plugin under either id ("Later versions read an
 * entry under either ID"), and `prependPlugins` accepts the guard as `sec-default@builtin`, the id
 * every release reads, or as `cc-plugin-sec-default@builtin`.
 */
export type IdForms = readonly [current: PluginId, previous: PluginId];

export const agentsMdIdForms: IdForms = ['cc-plugin-agents-md@builtin', 'agents-md@builtin'];
export const guardIdForms: IdForms = ['sec-default@builtin', 'cc-plugin-sec-default@builtin'];

/** Every spelling of `id` among `registry`'s plugins, the current one first; `id` alone otherwise. */
export function spellingsOf(registry: readonly IdForms[], id: string): readonly string[] {
  return registry.find((forms) => forms.some((form) => form === id)) ?? [id];
}

export const isGuardId = (id: string): boolean => spellingsOf([guardIdForms], id).length > 1;
