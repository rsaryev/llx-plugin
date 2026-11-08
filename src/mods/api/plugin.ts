import type { PluginNamespace } from '../types.ts';
import type { Deps } from './call.ts';

/** `$.plugin`: this plugin's name and directory (reference.md, "Mods API methods"). */
export const pluginApi = (deps: Deps): PluginNamespace => ({
  name: deps.plugin,
  root: deps.ports.locations.pluginRoot(deps.plugin),
});
