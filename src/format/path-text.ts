/**
 * Path text: the one owner of what a path says as written (absolute, climbing, where it resolves)
 * and of the `PluginFiles` spelling (plugins/loading.md, "Paths that escape the plugin
 * directory"; plugins/manifest-reference.md, "Path rules"). Pure over strings: nothing is looked
 * up. A backslash is a separator on Windows only; "on macOS and Linux" it is part of a name.
 */

/** Whose path rules apply: a backslash separates on `windows` only. */
export type PathPlatform = 'posix' | 'windows';

const ABSOLUTE = /^(?:[\\/]|[A-Za-z]:)/;

/** A path from a file system root: `/x`, `\x`, or a drive (`C:`, `C:/x`, `C:\x`). */
export const isAbsolutePath = (path: string): boolean => ABSOLUTE.test(path);

/** The segments of `path`, split on the platform's separators. */
const segmentsOf = (path: string, platform: PathPlatform): string[] =>
  path.split(platform === 'windows' ? /[\\/]/ : '/');

/**
 * The named segments of a relative path once `.`, empty segments and `..` are resolved, or
 * `undefined` when it climbs above where it starts.
 */
export function resolveSegments(path: string, platform: PathPlatform): string[] | undefined {
  const kept: string[] = [];
  for (const part of segmentsOf(path, platform)) {
    if (part === '..' && kept.length === 0) return undefined;
    if (part === '..') kept.pop();
    else if (part !== '' && part !== '.') kept.push(part);
  }
  return kept;
}

/** Whether a path names a place outside the folder it is relative to: absolute, or climbing above it. */
export const leavesFolder = (path: string, platform: PathPlatform): boolean =>
  isAbsolutePath(path) || resolveSegments(path, platform) === undefined;

/**
 * Whether a component path leaves the plugin as written (plugins/loading.md, "Paths that escape the
 * plugin directory"): it climbs with `..`, is absolute, or, "on macOS and Linux, contains a
 * backslash anywhere in it, even when the path stays inside the plugin". On Windows a backslash is
 * a separator, so `..\x` climbs there too. Any `..` segment counts, even one that comes back down.
 */
export function escapesAsWritten(path: string, platform: PathPlatform): boolean {
  if (isAbsolutePath(path)) return true;
  if (platform === 'posix' && path.includes('\\')) return true;
  return segmentsOf(path, platform).includes('..');
}

/**
 * A component path as a `PluginFiles` path: relative to the root, `/`-separated, no `.` or empty
 * segment, no trailing slash; the plugin root is `.` ("Both `"."` and `"./"` denote the plugin
 * root"). `.//x` is `x`, as a file system resolves it under the root: the result never starts
 * with `/`, so a port that resolves it against the root stays there. On Windows a backslash
 * separates like `/`. `..` is kept; `locate` rejects it before any read.
 */
export function rootRelative(path: string, platform: PathPlatform = 'posix'): string {
  const parts = segmentsOf(path, platform).filter((part) => part !== '' && part !== '.');
  return parts.length === 0 ? '.' : parts.join('/');
}

/** `base` and a child name, as a root-relative path. */
export const childPath = (base: string, name: string): string =>
  base === '.' ? name : `${base}/${name}`;

/** An absolute path in `/` spelling: a Windows path's backslashes as `/`, no trailing slash. */
const forward = (path: string, platform: PathPlatform): string =>
  (platform === 'windows' ? path.replaceAll('\\', '/') : path).replace(/(?<=.)\/+$/, '');

/**
 * Where `path` leads from the folder `root` (an absolute, `/`-spelled path): an absolute `path`
 * as itself in `/` spelling, a relative one joined to `root` with `.` and `..` resolved.
 */
export function resolveFrom(root: string, path: string, platform: PathPlatform): string {
  if (isAbsolutePath(path)) return forward(path, platform);
  const parts = forward(root, platform).split('/');
  for (const part of segmentsOf(path, platform)) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/** `path` with no trailing `/` (a root `/` becomes empty). */
export const withoutTrailingSlashes = (path: string): string => path.replace(/\/+$/, '');

/** True when `path` is `root` or inside it, by whole path segments (both in one `/` spelling). */
export function isWithin(root: string, path: string): boolean {
  const base = withoutTrailingSlashes(root);
  const candidate = withoutTrailingSlashes(path);
  return candidate === base || candidate.startsWith(`${base}/`);
}
