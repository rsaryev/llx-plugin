import { satisfiesRange } from './semver.ts';

/**
 * Which folders `--plugin-dir` loads as plugins (plugins/dependencies.md, "Test a plugin and its
 * dependency locally": "When both plugins are in one parent folder, you can pass that folder to
 * `--plugin-dir` once. If the folder isn't itself a plugin, Claude Code loads each child folder
 * that has a `.claude-plugin/plugin.json`. Requires Claude Code v2.1.265 or later"). Pure over the
 * listing the host read; the kit has no disk.
 */

/** A folder as the host listed it. */
export interface PluginDirListing {
  /** The folder holds `.claude-plugin/plugin.json`. */
  readonly hasManifest: boolean;
  /** Its child folders, with whether each holds `.claude-plugin/plugin.json`. */
  readonly children: readonly { readonly path: string; readonly hasManifest: boolean }[];
}

const PARENT_FOLDERS = '>=2.1.265';

/**
 * The paths to load for one `--plugin-dir` value: the folder itself when it is a plugin, else each
 * child folder that is one (from Claude Code 2.1.265; before that a folder that is no plugin loads
 * nothing). `hostVersion` absent means a current version. Judgment: only direct children count, as
 * the docs say "each child folder".
 */
export function pluginDirFolders(
  path: string,
  listing: PluginDirListing,
  hostVersion?: string,
): readonly string[] {
  if (listing.hasManifest) return [path];
  if (hostVersion !== undefined && !satisfiesRange(hostVersion, PARENT_FOLDERS)) return [];
  return listing.children.filter((child) => child.hasManifest).map((child) => child.path);
}
