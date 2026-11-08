import type { HookSource, HookSourceKind } from './contracts.ts';

/** Which declaration sites are a plugin's: a registry over the union, so a new kind is a compile error here. */
const PLUGIN_SOURCES: { readonly [K in HookSourceKind]: boolean } = {
  plugin: true,
  settings: false,
  skill: false,
  agent: false,
  session: false,
};

export const isPluginSource = (source: HookSource): boolean => PLUGIN_SOURCES[source.kind];

/**
 * The name a plugin hook's notices give its plugin: the manifest name, else the plugin id. One
 * rule for the block error ("This hook comes from the <plugin> plugin.") and the missing
 * directory notice.
 */
export const pluginLabel = (entry: {
  readonly pluginId?: string | undefined;
  readonly source: HookSource;
}): string | undefined => entry.source.pluginName ?? entry.pluginId;
