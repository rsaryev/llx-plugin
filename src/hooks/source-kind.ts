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
