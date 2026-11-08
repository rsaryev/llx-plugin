import { error, type PluginIssue } from '../format/issues.ts';
import type { ArchiveEntry, ArchiveScan, ArchiveStats } from '../ports/marketplace.ts';

/**
 * What the kit reads out of a zip's entry list without unzipping anything (plugins/host-
 * marketplace.md, "Stay within the download limits for hosted files"; plugins/marketplace-
 * reference.md, "archive plugin source"): the totals the extraction limits judge, and the names
 * and links that must not leave the plugin directory. Pure over `ArchiveReader.scan`.
 *
 * Judgments (spec/judgments.md): the docs name no zip-slip or link rule for an archive, so an entry
 * whose path would leave the folder it is extracted into, and a symbolic link whose target leaves
 * the plugin directory, are refused whole (an archive has no marketplace to dereference into, and
 * "Outside the marketplace: the symlink is skipped for security" cannot skip an entry the host is
 * about to extract).
 */

const SEPARATORS = /[\\/]/;
const bare = (path: string): string => path.replace(/\/+$/, '');
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

const leaves = (path: string): boolean =>
  path.includes('\0') || /^(?:[\\/]|[A-Za-z]:)/.test(path) || parts(path).includes('..');

/**
 * Where a link at `from` ends up, as the folders below the zip's top: `undefined` when it climbs
 * above the top. Only the text is read; nothing is looked up in the zip.
 */
function resolveLink(from: string, target: string): readonly string[] | undefined {
  const folders = [...parts(from)].slice(0, -1);
  for (const part of parts(target)) {
    if (part === '.') continue;
    if (part !== '..') {
      folders.push(part);
      continue;
    }
    if (folders.pop() === undefined) return undefined;
  }
  return folders;
}

const startsWith = (path: readonly string[], prefix: readonly string[]): boolean =>
  prefix.every((part, index) => path[index] === part);

function linkIssue(entry: ArchiveEntry, root: readonly string[]): PluginIssue | undefined {
  const target = entry.linkTarget;
  const named = `The archive entry "${entry.path}" is a symbolic link`;
  if (target === undefined || target === '') return error('source', `${named} with no target`);
  const landed = /^(?:[\\/]|[A-Za-z]:)/.test(target) ? undefined : resolveLink(entry.path, target);
  if (landed !== undefined && startsWith(landed, root)) return undefined;
  return error('source', `${named} to "${target}", which leaves the plugin directory`);
}

/** The first entry that would be written outside the plugin directory, or is a link that leaves it. */
export function unsafeEntryIssue(scan: ArchiveScan, root: string): PluginIssue | undefined {
  const rootParts = parts(bare(root));
  for (const entry of scan.entries) {
    if (leaves(entry.path)) {
      return error(
        'source',
        `The archive entry "${entry.path}" would be extracted outside the plugin directory`,
      );
    }
    const refused = entry.isSymlink ? linkIssue(entry, rootParts) : undefined;
    if (refused !== undefined) return refused;
  }
  return undefined;
}
