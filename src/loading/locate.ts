import type { PluginIssue } from '../format/issues.ts';
import { escapedPathIssue, type LinkRoots } from '../format/path-escape.ts';
import type { FileStat, PluginFiles } from '../ports/index.ts';

/**
 * A component path as a `PluginFiles` path: relative to the root, `/`-separated, no `./`, no trailing
 * slash; the plugin root is `.` ("Both `"."` and `"./"` denote the plugin root").
 */
export function rootRelative(path: string): string {
  const stripped = path.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  return stripped === '' || stripped === '.' ? '.' : stripped;
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

/** Whether the path is one of the plugin's own files (errors.md reports those by full path). */
const ownedBy = (own: boolean | undefined): boolean => own === true;

/**
 * Containment and existence (plugins/manifest-reference.md, "Containment and existence"; loading.md,
 * "Paths that escape the plugin directory"): a path with `..`, an absolute path, a backslash on
 * macOS and Linux, or a symlink that leads outside the plugin (other than to another plugin of
 * its marketplace) "doesn't load" and is reported as `<component> path escapes plugin directory:
 * <path>` (`escapedPathIssue`); a path that is not there is `undefined` and the caller decides
 * whether it was declared. `written` is the spelling the message quotes.
 */
export async function locate(
  context: LocateContext,
  component: string,
  written: string,
  own?: boolean,
): Promise<Located> {
  const declared = { component, written, platform: context.platform, own: ownedBy(own) };
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
