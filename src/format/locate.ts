import type { FileStat, PluginFiles } from '../ports/index.ts';
import type { PluginIssue } from './issues.ts';
import { escapedPathIssue, type DeclaredPath, type LinkRoots } from './path-escape.ts';
import { rootRelative, type PathPlatform, withoutTrailingSlashes } from './path-text.ts';

/** What a path turned out to be: what it is, or the issue that stops it loading; neither when it is missing. */
export interface Located {
  readonly stat?: FileStat;
  readonly issue?: PluginIssue;
}

/** What `locate` needs: the folder, and what decides whether a path leaves it. */
export interface LocateContext {
  readonly files: PluginFiles;
  /** The backslash rule is the platform's: "on macOS and Linux" a backslash escapes. */
  readonly platform: PathPlatform;
  /** Where the plugin and its marketplace really are, so links between plugins of one marketplace load. */
  readonly roots?: LinkRoots;
  readonly signal?: AbortSignal;
}

/** What a caller may leave out of a `LocateContext`. */
export type LocateOptions = Partial<Omit<LocateContext, 'files'>>;

/**
 * The context every loader of plugin paths shares. `platform` defaults to `posix`, the stricter
 * one: a backslash in a declared path escapes there.
 */
export const locateContext = (files: PluginFiles, options: LocateOptions = {}): LocateContext => ({
  files,
  platform: options.platform ?? 'posix',
  ...(options.roots && { roots: options.roots }),
  ...(options.signal && { signal: options.signal }),
});

/**
 * Containment and existence (plugins/manifest-reference.md, "Containment and existence"; loading.md,
 * "Paths that escape the plugin directory"): a path with `..`, an absolute path, a backslash on
 * macOS and Linux, or a symlink that leads outside the plugin (other than to another plugin of
 * its marketplace) "doesn't load" and is reported as `<component> path escapes plugin directory:
 * <path>` (`escapedPathIssue`); a path that is not there is `undefined` and the caller decides
 * whether it was declared. `written` is the spelling the message quotes. A link is seen on the
 * path itself and on every folder above it: each ancestor is stat'd once per call, since a port
 * reports a link only on the entry it is asked about (`FileStat.realPath`). Every reader of a
 * declared or standard plugin path decides containment here, and nowhere else.
 */
export async function locate(
  context: LocateContext,
  component: string,
  written: string,
  own?: boolean,
): Promise<Located> {
  const declared = { component, written, platform: context.platform, own: own === true };
  const asWritten = escapedPathIssue(declared);
  if (asWritten) return { issue: asWritten };
  const path = rootRelative(written, context.platform);
  const [stat, ...folders] = await Promise.all(
    [path, ...ancestorsOf(path)].map((one) => context.files.stat(one, context.signal)),
  );
  const parts = path.split('/');
  const crossed = folders.map((folder, index) => through(folder, parts.slice(index + 1)));
  const leaf = stat?.isSymlink === true ? stat.realPath : undefined;
  const linked = [...crossed, leaf]
    .filter((resolvesTo): resolvesTo is string => resolvesTo !== undefined)
    .map((resolvesTo) => linkIssue(context, declared, resolvesTo))
    .find((issue) => issue !== undefined);
  if (linked) return { issue: linked };
  return stat && (stat.isFile || stat.isDirectory) ? { stat } : {};
}

/** The folders above a root-relative path, nearest the root first: `a/b/c` has `a` and `a/b`. */
const ancestorsOf = (path: string): string[] =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, index, parts) => parts.slice(0, index + 1).join('/'));

/** Where the path leads through a folder that is a link: its real path and the segments below it. */
const through = (folder: FileStat | undefined, below: readonly string[]): string | undefined =>
  folder?.isSymlink === true && folder.realPath !== undefined
    ? [withoutTrailingSlashes(folder.realPath), ...below].join('/')
    : undefined;

const linkIssue = (
  context: LocateContext,
  declared: DeclaredPath,
  resolvesTo: string,
): PluginIssue | undefined =>
  escapedPathIssue({ ...declared, resolvesTo, ...(context.roots && { roots: context.roots }) });
