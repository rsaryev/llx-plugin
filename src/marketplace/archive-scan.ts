import { error, type PluginIssue } from '../format/issues.ts';
import type { ArchiveEntry, ArchiveScan, ArchiveStats } from '../ports/marketplace.ts';
import { escapesAsWritten, isAbsolutePath, withoutTrailingSlashes } from '../format/path-text.ts';

/**
 * What the kit reads out of a zip's entry list without unzipping anything (plugins/host-
 * marketplace.md, "Stay within the download limits for hosted files"; plugins/marketplace-
 * reference.md, "archive plugin source"): the totals the extraction limits judge, and the names
 * and links that must not leave the plugin directory. Pure over `ArchiveReader.scan`.
 *
 * Judgments (spec/judgments.md): the docs name no zip-slip or link rule for an archive, so an entry
 * whose path would leave the folder it is extracted into, and a symbolic link whose target leaves
 * the plugin directory (followed through the other links in the zip), and an entry written through
 * a link, are refused whole (an archive has no marketplace to dereference into, and
 * "Outside the marketplace: the symlink is skipped for security" cannot skip an entry the host is
 * about to extract). A link is found by its name as a file system that folds names would compare
 * it, and a link that shares its name with another entry is refused: on such a file system `a/x`
 * is written through a link stored as `A`.
 */

const SEPARATORS = /[\\/]/;
const parts = (path: string): readonly string[] =>
  path.split(SEPARATORS).filter((part) => part !== '');

/** The totals of a scan: derived, never reported by the host, so the limits cannot be argued with. */
export function archiveStats(scan: ArchiveScan, zipBytes: number): ArchiveStats {
  const sizes = scan.entries.map((entry) => entry.size);
  const topLevel = scan.entries
    .map((entry) => parts(entry.path)[0])
    .filter((name): name is string => name !== undefined);
  return {
    entries: scan.entries.length,
    largestFileBytes: sizes.reduce((largest, size) => Math.max(largest, size), 0),
    uncompressedBytes: sizes.reduce((total, size) => total + size, 0),
    compressedBytes: zipBytes,
    topLevel: [...new Set(topLevel)],
  };
}

const leaves = (path: string): boolean => path.includes('\0') || escapesAsWritten(path, 'windows');

/** The most links one path may pass through before it is taken as a loop (Linux's `MAXSYMLINKS`). */
const MAX_LINK_HOPS = 40;

/**
 * A name as the least discriminating file system a host may extract onto compares it: without
 * regard to letter case or Unicode normalization (APFS, NTFS), nor to trailing dots and spaces
 * (Windows). Two names a file system does tell apart may fold alike; that only refuses more.
 */
const foldName = (name: string): string =>
  name
    .normalize('NFD')
    .toUpperCase()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[. ]+$/u, '');

/** The key two paths share when some file system takes them for one file. */
const keyOf = (folders: readonly string[]): string => folders.map(foldName).join('/');

interface Link {
  /** The link's path as the archive stores it, for a message. */
  readonly path: string;
  readonly target: string;
}

/** Every link entry by its key, and every entry's path under its key. */
interface Names {
  readonly links: ReadonlyMap<string, Link>;
  readonly paths: ReadonlyMap<string, readonly string[]>;
}

function namesOf(scan: ArchiveScan): Names {
  const links = new Map<string, Link>();
  const paths = new Map<string, string[]>();
  for (const entry of scan.entries) {
    const key = keyOf(parts(entry.path));
    paths.set(key, [...(paths.get(key) ?? []), entry.path]);
    if (entry.isSymlink && entry.linkTarget !== undefined && entry.linkTarget !== '') {
      links.set(key, { path: entry.path, target: entry.linkTarget });
    }
  }
  return { links, paths };
}

interface Walk {
  readonly folders: string[];
  readonly pending: string[];
  hops: number;
}

/** One step of a walk: `false` when it climbs above the top, loops or meets an absolute link. */
function step(walk: Walk, part: string, names: Names): boolean {
  if (part === '.') return true;
  if (part === '..') return walk.folders.pop() !== undefined;
  walk.folders.push(part);
  const target = names.links.get(keyOf(walk.folders))?.target;
  if (target === undefined) return true;
  walk.hops += 1;
  if (walk.hops > MAX_LINK_HOPS || isAbsolutePath(target)) return false;
  // A link is replaced by its target, which is read from the folder the link is in.
  walk.folders.pop();
  walk.pending.unshift(...parts(target));
  return true;
}

/**
 * Where a link at `from` ends up, as the folders below the zip's top: `undefined` when it climbs
 * above the top. Only the entry list is read: a link the path passes through is replaced by its
 * own target, as the file system would, so a chain of links each inside cannot climb out.
 */
function resolveLink(from: string, target: string, names: Names): readonly string[] | undefined {
  const walk: Walk = {
    folders: [...parts(from)].slice(0, -1),
    pending: [...parts(target)],
    hops: 0,
  };
  for (let part = walk.pending.shift(); part !== undefined; part = walk.pending.shift()) {
    if (!step(walk, part, names)) return undefined;
  }
  return walk.folders;
}

const startsWith = (path: readonly string[], prefix: readonly string[]): boolean =>
  prefix.every((part, index) => path[index] === part);

function linkIssue(
  entry: ArchiveEntry,
  root: readonly string[],
  names: Names,
): PluginIssue | undefined {
  const target = entry.linkTarget;
  const named = `The archive entry "${entry.path}" is a symbolic link`;
  if (target === undefined || target === '') return error('source', `${named} with no target`);
  const landed = isAbsolutePath(target) ? undefined : resolveLink(entry.path, target, names);
  if (landed !== undefined && startsWith(landed, root)) return undefined;
  return error('source', `${named} to "${target}", which leaves the plugin directory`);
}

/** The link an entry would be written through: a folder above it that is a link entry. */
function linkAbove(entry: ArchiveEntry, names: Names): string | undefined {
  const folders = parts(entry.path);
  for (let depth = 1; depth < folders.length; depth += 1) {
    const above = names.links.get(keyOf(folders.slice(0, depth)));
    if (above !== undefined) return above.path;
  }
  return undefined;
}

/** The other entry an entry shares its file with, when one of the two is a link. */
function sameFile(entry: ArchiveEntry, names: Names): string | undefined {
  const key = keyOf(parts(entry.path));
  const sharing = names.paths.get(key) ?? [];
  if (sharing.length < 2 || !names.links.has(key)) return undefined;
  // The first of the others: the entry's own path is listed once for each entry that stores it.
  return sharing[sharing.indexOf(entry.path) === 0 ? 1 : 0];
}

/**
 * What is wrong with one entry, in the order judged: its path, a link above it, a link it shares
 * its name with, its own link.
 */
function entryIssue(
  entry: ArchiveEntry,
  root: readonly string[],
  names: Names,
): PluginIssue | undefined {
  if (leaves(entry.path)) {
    return error(
      'source',
      `The archive entry "${entry.path}" would be extracted outside the plugin directory`,
    );
  }
  const through = linkAbove(entry, names);
  if (through !== undefined) {
    return error(
      'source',
      `The archive entry "${entry.path}" is written through the symbolic link "${through}"`,
    );
  }
  const other = sameFile(entry, names);
  if (other !== undefined) {
    return error(
      'source',
      `The archive entry "${entry.path}" names the same file as "${other}", and one of them is a symbolic link`,
    );
  }
  return entry.isSymlink ? linkIssue(entry, root, names) : undefined;
}

/**
 * The first entry that would be written outside the plugin directory, is written through a link,
 * shares its name with a link, or is a link that leaves it.
 */
export function unsafeEntryIssue(scan: ArchiveScan, root: string): PluginIssue | undefined {
  const rootParts = parts(withoutTrailingSlashes(root));
  const names = namesOf(scan);
  for (const entry of scan.entries) {
    const issue = entryIssue(entry, rootParts, names);
    if (issue !== undefined) return issue;
  }
  return undefined;
}
