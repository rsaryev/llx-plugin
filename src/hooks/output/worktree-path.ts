/**
 * What a `WorktreeCreate` hook returned, read as the worktree path (hooks.md, "WorktreeCreate
 * output"): a command hook prints it "as the last non-empty line of stdout" and "Claude Code strips
 * ANSI escape codes before reading that line"; an HTTP hook returns `hookSpecificOutput.worktreePath`.
 * "If the hook fails or produces no path, worktree creation fails." A relative path is resolved
 * "against the directory the hook ran in, collapsing any `.` or `..` segments in it"; "Claude Code
 * refuses an absolute path that contains `.` or `..` segments, and any path that passes through a
 * symlink below the repository root", and "the error names the rejected component". Whether the
 * resulting path is a directory the session can enter is the host's: it is the one that can look.
 */

const ESC = '\u001b';
const BEL = '\u0007';

/** The index after the CSI sequence whose parameters start at `from`: up to one final byte, `@` to `~`. */
function csiEnd(text: string, from: number): number {
  let cursor = from;
  while (cursor < text.length) {
    const code = text.codePointAt(cursor) ?? 0;
    cursor += 1;
    if (code >= 0x40 && code <= 0x7e) break;
  }
  return cursor;
}

/** The index after the OSC string that starts at `from`: up to BEL, or the terminator `ESC \`. */
function oscEnd(text: string, from: number): number {
  let cursor = from;
  while (cursor < text.length) {
    if (text[cursor] === BEL) return cursor + 1;
    if (text[cursor] === ESC && text[cursor + 1] === '\\') return cursor + 2;
    cursor += 1;
  }
  return cursor;
}

/** The index after the escape sequence that starts at `at` (an `ESC`), as a terminal reads it. */
function escapeEnd(text: string, at: number): number {
  const kind = text[at + 1];
  if (kind === '[') return csiEnd(text, at + 2);
  if (kind === ']') return oscEnd(text, at + 2);
  return Math.min(at + 2, text.length);
}

/** `text` without its ANSI escape sequences (CSI, OSC and two-character escapes). */
export function stripAnsi(text: string): string {
  let kept = '';
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] === ESC) {
      cursor = escapeEnd(text, cursor);
    } else {
      kept += text[cursor] ?? '';
      cursor += 1;
    }
  }
  return kept;
}

/** The last non-empty line of `stdout` after the ANSI escapes are stripped, or `undefined`. */
export function lastPathLine(stdout: string): string | undefined {
  return stripAnsi(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .findLast((line) => line !== '');
}

/** The path, or why creation fails. */
export type WorktreePath = { readonly path: string } | { readonly failure: string };

/** What the host knows about where the hook ran. */
export interface WorktreeLocation {
  /** The directory the hook ran in: a relative path is resolved against it. */
  readonly ranIn: string;
  /** The repository root: only a symlink below it is refused. */
  readonly repositoryRoot?: string;
  /**
   * Whether a path is itself a symbolic link. The kit reads no file system, so the host answers;
   * without it no path is checked for links.
   */
  readonly isSymlink?: (path: string) => Promise<boolean>;
}

/** What a merged `WorktreeCreate` outcome holds of the hooks' answers. */
export interface WorktreeAnswer {
  readonly proceed: boolean;
  /** The stdout of each command hook that exited 0. */
  readonly stdout: readonly string[];
  readonly effects: { readonly worktreePath?: string };
}

const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;
const isAbsolute = (path: string): boolean => path.startsWith('/') || WINDOWS_DRIVE.test(path);
const segmentsOf = (path: string): string[] => path.split(/[\\/]/).filter((part) => part !== '');
const joinWith = (separator: string, root: string, parts: readonly string[]): string =>
  `${root}${parts.join(separator)}`;

/** The leading root of an absolute path (`/` or `C:\`), kept as written. */
const rootOf = (path: string): string => (path.startsWith('/') ? '/' : path.slice(0, 3));
const separatorOf = (path: string): string =>
  path.includes('\\') && !path.includes('/') ? '\\' : '/';

/** `relative` resolved against `base`, the `.` and `..` segments collapsed (`..` stops at the root). */
function resolveRelative(base: string, relative: string): string {
  const parts = segmentsOf(isAbsolute(base) ? base.slice(rootOf(base).length) : base);
  for (const segment of segmentsOf(relative)) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return joinWith(separatorOf(base), isAbsolute(base) ? rootOf(base) : '', parts);
}

/** The first component of `path` below `root` that is a symbolic link. */
async function firstSymlinkBelow(
  path: string,
  location: Required<Pick<WorktreeLocation, 'repositoryRoot' | 'isSymlink'>>,
): Promise<string | undefined> {
  const { repositoryRoot, isSymlink } = location;
  const rootParts = segmentsOf(repositoryRoot);
  const parts = segmentsOf(path);
  const inside = rootParts.every((part, index) => parts[index] === part);
  if (!inside) return undefined;
  const separator = separatorOf(path);
  const root = rootOf(path);
  for (let length = rootParts.length + 1; length <= parts.length; length += 1) {
    const prefix = joinWith(separator, root, parts.slice(0, length));
    if (await isSymlink(prefix)) return parts[length - 1];
  }
  return undefined;
}

/** The candidate text of the hooks' answers: an HTTP hook's path, else a command hook's last line. */
export function worktreeCandidate(answer: WorktreeAnswer): string | undefined {
  const http = answer.effects.worktreePath;
  if (http !== undefined && http.trim() !== '') return http.trim();
  return answer.stdout.map(lastPathLine).findLast((line) => line !== undefined);
}

/**
 * The worktree path a `WorktreeCreate` outcome asks the session to use, or why creation fails.
 *
 * Judgment (spec/judgments.md): the docs name the refusals and say the error names the rejected
 * component, not the words; and when an HTTP hook and a command hook both answer, the HTTP
 * hook's `worktreePath` is the one used.
 */
export async function resolveWorktreePath(
  answer: WorktreeAnswer,
  location: WorktreeLocation,
): Promise<WorktreePath> {
  if (!answer.proceed)
    return { failure: 'The WorktreeCreate hook failed, so no worktree was created.' };
  const given = worktreeCandidate(answer);
  if (given === undefined) {
    return { failure: 'The WorktreeCreate hook returned no worktree path.' };
  }
  if (isAbsolute(given)) {
    const dotted = segmentsOf(given).find((segment) => segment === '.' || segment === '..');
    if (dotted !== undefined) {
      return {
        failure: `The worktree path "${given}" contains a "${dotted}" segment; return a normalized path.`,
      };
    }
  }
  const path = isAbsolute(given) ? given : resolveRelative(location.ranIn, given);
  const { repositoryRoot, isSymlink } = location;
  if (repositoryRoot !== undefined && isSymlink !== undefined) {
    const link = await firstSymlinkBelow(path, { repositoryRoot, isSymlink });
    if (link !== undefined) {
      return {
        failure: `The worktree path "${path}" passes through the symlink "${link}" below the repository root.`,
      };
    }
  }
  return { path };
}
