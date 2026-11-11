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

/** `~` alone or before a separator; `~alice` is a folder of that name (spec/judgments.md). */
const HOME_PREFIX = /^~(?=[\\/]|$)/;

/** A path with a leading `~` spelled as the home directory. */
export const homeExpanded = (path: string, home: string): string =>
  path.replace(HOME_PREFIX, () => home);

/**
 * A host path in POSIX form, `~` expanded and resolved against the session's current directory:
 * the one reading of a path the rules, the working directories and the modes share.
 */
export function absolutePath(
  path: string,
  paths: Pick<PathContext, 'cwd' | 'home' | 'platform'>,
): string {
  const cwd = normalizeAbsolute(toPosixPath(paths.cwd, paths.platform));
  return resolvePath(cwd, toPosixPath(homeExpanded(path, paths.home), paths.platform));
}

/**
 * The spelling two paths are compared in. Windows names compare without case and drop the dots and
 * spaces that end them (`.GIT`, `.git.` and `.git ` are `.git`); POSIX names compare as written,
 * macOS included (spec/judgments.md).
 */
const FOLDS: { readonly [P in Platform]: (path: string) => string } = {
  posix: (path) => path,
  windows: (path) =>
    path
      .split('/')
      .map((segment) => (/^\.\.?$/.test(segment) ? segment : segment.replace(/[. ]+$/, '')))
      .join('/')
      .toLowerCase(),
};

export const foldPath = (path: string, platform: Platform): string => FOLDS[platform](path);

/**
 * The text of `path` below `root` (`''` for the root itself), or `undefined` when it is not below;
 * on Windows both are folded first (`foldPath`), and so is the text returned.
 */
export function relativeWithin(
  root: string,
  path: string,
  platform: Platform = 'posix',
): string | undefined {
  const base = foldPath(root, platform);
  const below = foldPath(path, platform);
  if (base === '/') return below.slice(1);
  if (below === base) return '';
  return below.startsWith(`${base}/`) ? below.slice(base.length + 1) : undefined;
}

export function dirnameOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

/** Whether a segment holds a gitignore wildcard (or an escape), so a literal prefix ends before it. */
export const hasGlobSyntax = (segment: string): boolean => /[*?[\\]/.test(segment);
