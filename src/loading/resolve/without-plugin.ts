import type { Locations } from '../../ports/index.ts';

/**
 * Judgment (spec/judgments.md): a handler of no plugin (a settings file's) has no plugin folder
 * and no data folder, so the two plugin variables stay as written instead of naming the folder of
 * a plugin that is not there. The docs show these two only in plugin hooks. Every method
 * delegates, since a host's `Locations` may be a class instance.
 */
export function locationsWithoutPlugin(locations: Locations): Locations {
  return {
    homeDir: () => locations.homeDir(),
    projectDir: () => locations.projectDir(),
    pluginRoot: () => '${CLAUDE_PLUGIN_ROOT}',
    pluginData: () => Promise.resolve('${CLAUDE_PLUGIN_DATA}'),
    joinPath: (base, relativePath) => locations.joinPath(base, relativePath),
    existingDirectory: (candidates, signal) => locations.existingDirectory(candidates, signal),
  };
}
