/** Claude Code's plugin format: reading and validating what a plugin folder holds. */
export { SEVERITIES, blocksLoading, type PluginIssue, type Severity } from './issues.ts';
export { readManifest, validateManifest, type ManifestResult } from './manifest.ts';
export type {
  CommandEntry,
  PluginDependency,
  PluginManifest,
  UserConfigOption,
} from './manifest-schema.ts';
export { TRAVERSAL } from './paths.ts';
