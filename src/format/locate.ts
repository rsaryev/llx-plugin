import type { FileStat, PluginFiles } from '../ports/index.ts';
import type { PluginIssue } from './issues.ts';
import { escapedPathIssue, type LinkRoots } from './path-escape.ts';

/**
 * A component path as a `PluginFiles` path: relative to the root, `/`-separated, no `.` or empty
 * segment, no trailing slash; the plugin root is `.` ("Both `"."` and `"./"` denote the plugin
 * root"). `.//x` is `x`, as a file system resolves it under the root: the result never starts
 * with `/`, so a port that resolves it against the root stays there. `..` is kept; `locate`
 * rejects it before any read.
 */
export function rootRelative(path: string): string {
  const parts = path.split('/').filter((part) => part !== '' && part !== '.');
  return parts.length === 0 ? '.' : parts.join('/');
}

/** `base` and a child name, as a root-relative path. */
export const childPath = (base: string, name: string): string =>
  base === '.' ? name : `${base}/${name}`;

/** What a path turned out to be: what it is, or the issue that stops it loading; neither when it is missing. */
export interface Located {
  readonly stat?: FileStat;
  readonly issue?: PluginIssue;
}

/** What `locate` needs: the folder, and what decides whether a path leaves it. */
export interface LocateContext {
  readonly files: PluginFiles;
  /** The backslash rule is the platform's: "on macOS and Linux" a backslash escapes. */
  readonly platform: 'posix' | 'windows';
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
 * whether it was declared. `written` is the spelling the message quotes. Every reader of a
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
  const stat = await context.files.stat(rootRelative(written), context.signal);
  const resolvesTo = stat?.isSymlink === true ? stat.realPath : undefined;
  const linked =
    resolvesTo === undefined
      ? undefined
      : escapedPathIssue({
          ...declared,
          resolvesTo,
          ...(context.roots && { roots: context.roots }),
        });
  if (linked) return { issue: linked };
  return stat && (stat.isFile || stat.isDirectory) ? { stat } : {};
}
