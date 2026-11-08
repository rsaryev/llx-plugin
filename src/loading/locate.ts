import { error, type PluginIssue } from '../format/issues.ts';
import { pathEscapes } from '../format/messages.ts';
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

const leavesFolder = (path: string): boolean => path.startsWith('/') || /^\.\.(\/|$)/.test(path);

/**
 * Containment and existence (plugins/manifest-reference.md, "Containment and existence"; loading.md,
 * "Paths that escape the plugin directory"): a path with `..`, or a symlink that leads outside the
 * plugin, "doesn't load" and is reported as `<component> path escapes plugin directory: <path>`; a
 * path that is not there is `undefined` and the caller decides whether it was declared.
 * `written` is the spelling the message quotes.
 */
export async function locate(
  files: PluginFiles,
  component: string,
  written: string,
  signal?: AbortSignal,
): Promise<Located> {
  const path = rootRelative(written);
  if (written.split('/').includes('..') || written.startsWith('/')) {
    return { issue: error(component, pathEscapes(component, written)) };
  }
  const stat = await files.stat(path, signal);
  if (stat?.isSymlink === true && stat.realPath !== undefined && leavesFolder(stat.realPath)) {
    return { issue: error(component, pathEscapes(component, written, stat.realPath)) };
  }
  return stat && (stat.isFile || stat.isDirectory) ? { stat } : {};
}
