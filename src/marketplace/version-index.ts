/** What identifies an installed plugin: its version, its names and its cache folder. */
export {
  resolvePluginVersion,
  UNKNOWN_VERSION,
  usableVersion,
  type PluginVersion,
  isVersionSegment,
  type VersionInput,
  type VersionSource,
  type VersionOrigin,
} from './version-resolution.ts';
export { copyModeHash, linkModeHash, shortHash12, subdirectoryPathHash } from './version-hash.ts';
export {
  unknownVersionSteps,
  type PluginRef,
  type UnknownVersionPlan,
  type VersionStep,
} from './version-troubleshooting.ts';
export { lookupPlugin, pluginNames, type PluginLookup, type PluginNames } from './plugin-names.ts';
export {
  folderCollisions,
  folderOf,
  type FolderCollision,
  type FolderPlatform,
  type SharedThing,
} from './folder-collision.ts';
