import type { PathContext } from '../types.ts';

/**
 * Path arithmetic on the kit's one path form: absolute, `/`-separated, no `.` or `..` segments.
 * Pure string work, because the kit never calls the host's `path` module (docs/ARCHITECTURE.md, L3)
 * and path rules match on POSIX form everywhere (permissions.md, "Where a pattern anchors").
 */
export type Platform = PathContext['platform'];

/**
 * `C:\Users\alice` becomes `/c/Users/alice`: "On Windows, paths are normalized to POSIX form before
 * matching" (permissions.md). A UNC path `\\server\share` keeps its two leading slashes' meaning
 * through the later folding to `/server/share`; networks are told apart on the raw spelling
 * (`network.ts`).
 */
const DRIVE_PREFIX = /^([A-Za-z]):(?=[\\/]|$)/;
const NORMALIZERS: { readonly [P in Platform]: (path: string) => string } = {
  posix: (path) => path,
  windows: (path) =>
    path
      .replaceAll('\\', '/')
      .replace(DRIVE_PREFIX, (_, drive: string) => `/${drive.toLowerCase()}`),
};

export const toPosixPath = (path: string, platform: Platform): string =>
  NORMALIZERS[platform](path);

/** Folds `.`, `..` and repeated slashes of a POSIX path; the result is absolute. */
export function normalizeAbsolute(path: string): string {
  const kept: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') kept.pop();
    else kept.push(segment);
  }
  return `/${kept.join('/')}`;
}

/** `path` against `base` (a normalised absolute path), normalised; an absolute `path` ignores `base`. */
export const resolvePath = (base: string, path: string): string =>
  normalizeAbsolute(path.startsWith('/') ? path : `${base}/${path}`);

/** A host path in POSIX form, resolved against the session's current directory. */
export function absolutePath(path: string, paths: PathContext): string {
  const cwd = normalizeAbsolute(toPosixPath(paths.cwd, paths.platform));
  return resolvePath(cwd, toPosixPath(path, paths.platform));
}

/** The text of `path` below `root` (`''` for the root itself), or `undefined` when it is not below. */
export function relativeWithin(root: string, path: string): string | undefined {
  if (root === '/') return path.slice(1);
  if (path === root) return '';
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
}

export function dirnameOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

/** Whether a segment holds a gitignore wildcard (or an escape), so a literal prefix ends before it. */
export const hasGlobSyntax = (segment: string): boolean => /[*?[\\]/.test(segment);
