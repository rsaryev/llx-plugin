import { pluginDirFolders, type PluginDirListing } from '../../marketplace/plugin-dir-folders.ts';
import { sideloadRefusal } from './sideload.ts';
import { refuse, type Contribution, type FlagContext, type SessionPluginRequest } from './types.ts';

/**
 * `--plugin-dir` and `--plugin-url` (cli-reference.md, "CLI flags"; plugins/cli-reference.md,
 * "Flags that load a plugin for one session"): plugins for this session only, of the `inline` origin
 * (`<name>@inline`, `--json` scope `session`). The kit maps the flags to requests; the host reads the
 * folder (a folder that is no plugin holds plugins: `pluginDirFolders`), fetches the archive and
 * names each plugin from its manifest. Which same-named copy loads is the install stream's
 * (`copyThatLoads`).
 */

const ARCHIVE = /\.zip$/i;
const WHITESPACE = /\s+/;

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
  const urls = values.flatMap((value) => value.split(WHITESPACE).filter((url) => url !== ''));
  return { sessionPlugins: urls.map((url) => requestOf('url', url)) };
}

type FoldersOf = (
  location: string,
  listing: PluginDirListing,
  hostVersion: string | undefined,
) => readonly string[];

/** One row per source: a directory may hold plugins; an archive and a URL are one plugin. */
const FOLDERS: { readonly [S in SessionPluginRequest['source']]: FoldersOf } = {
  directory: pluginDirFolders,
  archive: (location) => [location],
  url: (location) => [location],
};

/**
 * The folders to load for one request, given what the host listed in the directory: an archive or a
 * URL is one plugin; a directory is itself when it holds `.claude-plugin/plugin.json`, else "each
 * child folder that holds" one (`pluginDirFolders`, from Claude Code 2.1.265).
 */
export function pluginFoldersOf(
  request: SessionPluginRequest,
  listing: PluginDirListing,
  hostVersion?: string,
): readonly string[] {
  return FOLDERS[request.source](request.location, listing, hostVersion);
}
