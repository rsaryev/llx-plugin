import { warning, type PluginIssue } from '../format/issues.ts';
import type { PluginFiles } from '../ports/files.ts';
import { byCodeUnit, listSorted } from '../format/listing.ts';

/**
 * A Git LFS pointer file, which is what an LFS-tracked file is after a clone (plugins/host-
 * marketplace.md, "Keep plugin files out of Git LFS": "The clone never downloads LFS content, so
 * LFS-tracked files arrive as pointer files"). The docs do not describe the pointer's text; the
 * layout is Git LFS's own (a `version` line naming its spec, an `oid sha256:` line, a `size` line),
 * a judgment (spec/judgments.md). A pointer is a small text file, so a host reads at most
 * `MAX_POINTER_BYTES` of a file to ask. Git writes the lines with `\n`, and a checkout that converts
 * line ends leaves `\r\n`; both are read (judgment).
 */

const MAX_POINTER_BYTES = 1024;

export interface LfsPointer {
  /** The SHA-256 of the real content, lower case hex. */
  readonly oid: string;
  /** The size of the real content in bytes. */
  readonly size: number;
}

const VERSION = /^version https:\/\/git-lfs\.github\.com\/spec\/v\d+$/;
const OID = /^oid sha256:([0-9a-f]{64})$/;
const SIZE = /^size (\d+)$/;

/** The first capture group of `pattern` in `line`, if it matches. */
const captured = (pattern: RegExp, line: string | undefined): string | undefined =>
  pattern.exec(line ?? '')?.[1];

/** The pointer a text is, or `undefined` for any other text. */
export function readLfsPointer(text: string): LfsPointer | undefined {
  if (text.length > MAX_POINTER_BYTES) return undefined;
  const [version, oid, size, ...rest] = text.trimEnd().split(/\r?\n/);
  const digest = captured(OID, oid);
  const bytes = captured(SIZE, size);
  const wellFormed = rest.length === 0 && VERSION.test(version ?? '');
  return wellFormed && digest !== undefined && bytes !== undefined
    ? { oid: digest, size: Number(bytes) }
    : undefined;
}

/** The warning for a plugin file that is a pointer: the plugin needs the real file and cannot get it. */
export const lfsPointerIssue = (path: string): PluginIssue =>
  warning(
    path,
    `${path} is a Git LFS pointer file, not the file itself: the clone never downloads LFS content. Keep plugin files out of Git LFS`,
  );

const child = (directory: string, name: string): string =>
  directory === '.' ? name : `${directory}/${name}`;

/** The warning for the file at `path` when it is a regular, small file that holds a pointer. */
async function pointerWarning(
  files: PluginFiles,
  path: string,
  signal?: AbortSignal,
): Promise<PluginIssue | undefined> {
  const stat = await files.stat(path, signal);
  if (stat === undefined || !stat.isFile || stat.isSymlink || stat.size > MAX_POINTER_BYTES) {
    return undefined;
  }
  const text = await files.readText(path, signal);
  return text !== undefined && readLfsPointer(text) !== undefined
    ? lfsPointerIssue(path)
    : undefined;
}

/** The entries of `directory` to look at: files, and directories but `.git`, never through a link. */
async function lookups(
  files: PluginFiles,
  directory: string,
  signal?: AbortSignal,
): Promise<{ readonly paths: readonly string[]; readonly directories: readonly string[] }> {
  const paths: string[] = [];
  const directories: string[] = [];
  for (const entry of (await listSorted(files, directory, signal)) ?? []) {
    const path = child(directory, entry.name);
    const stat = await files.stat(path, signal);
    const walked = stat?.isDirectory === true && !stat.isSymlink && entry.name !== '.git';
    (walked ? directories : paths).push(path);
  }
  return { paths, directories };
}

/**
 * The install check for a git-based plugin that was cloned: one warning per file of the plugin that
 * is a Git LFS pointer, since the clone never downloads LFS content and the plugin needs the real
 * file. Lists the plugin through its files (not into `.git`, not through links) and reads only
 * files small enough to be a pointer. Ordered by path.
 */
export async function lfsPointerIssues(
  files: PluginFiles,
  { signal }: { readonly signal?: AbortSignal | undefined } = {},
): Promise<readonly PluginIssue[]> {
  const found: PluginIssue[] = [];
  const pending = ['.'];
  for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
    const seen = await lookups(files, directory, signal);
    pending.push(...seen.directories);
    for (const path of seen.paths) {
      const issue = await pointerWarning(files, path, signal);
      if (issue !== undefined) found.push(issue);
    }
  }
  return found.toSorted((a, b) => byCodeUnit(a.path, b.path));
}
