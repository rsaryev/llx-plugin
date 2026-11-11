import { error, type PluginIssue } from '../format/issues.ts';
import type { PluginFiles } from '../ports/files.ts';
import { PLUGIN_CONTENT_DIRECTORIES } from './plugin-content.ts';
import { listSorted } from '../format/listing.ts';
import { leavesFolder } from '../format/path-text.ts';

/**
 * What a `command` source's printed directory must hold and stay within (plugins/marketplace-
 * reference.md, "Output that fails the install or update", "Copy mode and link mode"), judged
 * through a read-only view rooted at that directory.
 */

const MIB = 1024 * 1024;
/** "In copy mode, the directory is larger than 256 MiB or has more than 20,000 entries." */
const COPY_LIMITS = { maxBytes: 256 * MIB, maxEntries: 20_000 } as const;

export interface CopyLimits {
  readonly maxBytes: number;
  readonly maxEntries: number;
}

/** The two ways a directory is too large to copy: the verdict, once a limit is broken. */
export const tooManyEntries = (maxEntries: number): PluginIssue =>
  error('source', `The printed directory has more than ${maxEntries} entries, too many to copy`);
/** `256 MiB` for a whole number of MiB (the docs' limit), else the bytes. */
const sizeText = (bytes: number): string =>
  bytes % MIB === 0 ? `${bytes / MIB} MiB` : `${bytes} bytes`;
export const tooLarge = (maxBytes: number): PluginIssue =>
  error('source', `The printed directory is larger than ${sizeText(maxBytes)}, too large to copy`);

const problem = (message: string): PluginIssue => error('source', message);

export async function contentIssue(
  files: PluginFiles,
  signal: AbortSignal,
): Promise<PluginIssue | undefined> {
  const top = (await listSorted(files, '.', signal)) ?? [];
  const has = top.some(
    (entry) => entry.isDirectory && PLUGIN_CONTENT_DIRECTORIES.includes(entry.name),
  );
  return has
    ? undefined
    : problem(
        'The printed directory has no plugin content at its top level (a .claude-plugin/ directory, or skills/, commands/, agents/ or hooks/)',
      );
}

interface Tally {
  entries: number;
  bytes: number;
  readonly pending: string[];
}

const child = (directory: string, name: string): string =>
  directory === '.' ? name : `${directory}/${name}`;

/** Counts one entry; the verdict when it breaks a limit. Symlinks count as one entry and are not followed. */
async function countEntry(
  files: PluginFiles,
  path: string,
  tally: Tally,
  signal: AbortSignal,
): Promise<PluginIssue | undefined> {
  tally.entries += 1;
  if (tally.entries > COPY_LIMITS.maxEntries) {
    return tooManyEntries(COPY_LIMITS.maxEntries);
  }
  const stat = await files.stat(path, signal);
  if (stat === undefined || stat.isSymlink) return undefined;
  if (stat.isDirectory) tally.pending.push(path);
  tally.bytes += stat.isFile ? stat.size : 0;
  return tally.bytes > COPY_LIMITS.maxBytes ? tooLarge(COPY_LIMITS.maxBytes) : undefined;
}

/** In copy mode: the directory is at most 256 MiB with at most 20,000 entries. */
export async function copyLimitIssue(
  files: PluginFiles,
  signal: AbortSignal,
): Promise<PluginIssue | undefined> {
  const tally: Tally = { entries: 0, bytes: 0, pending: ['.'] };
  for (
    let directory = tally.pending.pop();
    directory !== undefined;
    directory = tally.pending.pop()
  ) {
    for (const entry of (await listSorted(files, directory, signal)) ?? []) {
      const issue = await countEntry(files, child(directory, entry.name), tally, signal);
      if (issue !== undefined) return issue;
    }
  }
  return undefined;
}

/** In link mode: "the install fails if a top-level entry is a symlink that points outside the printed directory". */
export async function linkIssue(
  files: PluginFiles,
  signal: AbortSignal,
): Promise<PluginIssue | undefined> {
  for (const entry of (await listSorted(files, '.', signal)) ?? []) {
    const stat = await files.stat(entry.name, signal);
    if (stat?.isSymlink === true && leavesFolder(stat.realPath ?? '', 'windows')) {
      return problem(
        `The top-level entry "${entry.name}" is a symlink that points outside the printed directory`,
      );
    }
  }
  return undefined;
}
