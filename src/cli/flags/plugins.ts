import type { PluginDirectoryReading } from '../../loading/plugin-folder.ts';
import { satisfiesRange } from '../../marketplace/semver.ts';
import { sideloadRefusal } from './sideload.ts';
import { refuse, type Contribution, type FlagContext, type SessionPluginRequest } from './types.ts';
import { wordsOf } from './values.ts';
import { withoutTrailingSlashes } from '../../format/path-text.ts';

/**
 * `--plugin-dir` and `--plugin-url` (cli-reference.md, "CLI flags"; plugins/cli-reference.md,
 * "Flags that load a plugin for one session"): plugins for this session only, of the `inline` origin
 * (`<name>@inline`, `--json` scope `session`). The kit maps the flags to requests; the host reads the
 * folder (a folder that is no plugin holds plugins: `readPluginDirectory`), fetches the archive and
 * names each plugin from its manifest. Which same-named copy loads is the install stream's
 * (`copyThatLoads`).
 */

const ARCHIVE = /\.zip$/i;

const requestOf = (
  source: SessionPluginRequest['source'],
  location: string,
): SessionPluginRequest => ({
  source,
  location,
  origin: 'inline',
});

/** "Each flag takes one path. Repeat the flag for more paths": a path is never split, even with a space in it. */
export function pluginDir(paths: readonly string[], context: FlagContext): Contribution {
  const refusal = sideloadRefusal('--plugin-dir', context.facts);
  if (refusal !== undefined) return refuse(refusal);
  return {
    sessionPlugins: paths.map((path) =>
      requestOf(ARCHIVE.test(path) ? 'archive' : 'directory', path),
    ),
  };
}

/** "Repeat the flag for multiple plugins, or pass space-separated URLs in a single quoted value." */
export function pluginUrl(values: readonly string[], context: FlagContext): Contribution {
  const refusal = sideloadRefusal('--plugin-url', context.facts);
  if (refusal !== undefined) return refuse(refusal);
  const urls = values.flatMap(wordsOf);
  return { sessionPlugins: urls.map((url) => requestOf('url', url)) };
}

const PARENT_FOLDERS = '>=2.1.265';

type FoldersOf = (
  location: string,
  reading: PluginDirectoryReading,
  hostVersion: string | undefined,
) => readonly string[];

/**
 * A directory is itself unless it holds plugins; a folder of plugins needs Claude Code 2.1.265
 * (plugins/create.md: "Loading a folder of plugins requires Claude Code v2.1.265 or later"), and an
 * older host loads nothing from it. `hostVersion` absent means a current version.
 */
const directoryFolders: FoldersOf = (location, reading, hostVersion) => {
  if (!reading.isFolder) return [location];
  if (hostVersion !== undefined && !satisfiesRange(hostVersion, PARENT_FOLDERS)) return [];
  return reading.plugins.map((name) => `${withoutTrailingSlashes(location)}/${name}`);
};

/** One row per source: a directory may hold plugins; an archive and a URL are one plugin. */
const FOLDERS: { readonly [S in SessionPluginRequest['source']]: FoldersOf } = {
  directory: directoryFolders,
  archive: (location) => [location],
  url: (location) => [location],
};

/**
 * The folders to load for one request, given what `readPluginDirectory` read in the directory: an
 * archive or a URL is one plugin; a directory is itself when it is a plugin, else each immediate
 * subfolder that holds a `.claude-plugin/plugin.json`.
 */
export function pluginFoldersOf(
  request: SessionPluginRequest,
  reading: PluginDirectoryReading,
  hostVersion?: string,
): readonly string[] {
  return FOLDERS[request.source](request.location, reading, hostVersion);
}
