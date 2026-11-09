import type { PluginFiles } from '../ports/files.ts';
import type { Sha256 } from '../ports/marketplace.ts';
import { listSorted } from '../format/listing.ts';

/**
 * What a plugin version is hashed from (plugins/loading.md, "How Claude Code computes the version";
 * plugins/marketplace-reference.md, "Copy mode and link mode"): the files a `command` source copied,
 * the real path and top-level entries of a linked directory, and the subdirectory path of a
 * `git-subdir` source. The docs say what the hash covers, not how its input is laid out, so the
 * layouts below are judgments (spec/judgments.md). Every listing is sorted here by code unit, never
 * trusted from the port, so a digest never depends on the order a folder lists its entries in.
 */

const encoder = new TextEncoder();

/** "The commit SHA of the source, shortened to 12 characters": a hex digest cut to 12, lower case. */
export const shortHash12 = (hex: string): string => hex.toLowerCase().slice(0, 12);

const SUBDIRECTORY_HASH_LENGTH = 8;

const digestOf = (text: string, sha256: Sha256): Promise<string> =>
  sha256.hex(encoder.encode(text));

/** The names directly under `directory`, sorted by code unit. */
async function namesIn(
  files: PluginFiles,
  directory: string,
  signal: AbortSignal | undefined,
): Promise<readonly string[]> {
  const entries = (await listSorted(files, directory, signal)) ?? [];
  return entries.map((entry) => entry.name);
}

const childPath = (directory: string, name: string): string =>
  directory === '.' ? name : `${directory}/${name}`;

/**
 * The lines one entry contributes: a link by where it points (it is never followed, so a link out
 * of the folder cannot pull foreign bytes in), a directory by what is below it, a file by the digest
 * of its bytes. An empty directory contributes nothing.
 */
async function entryLines(
  files: PluginFiles,
  path: string,
  sha256: Sha256,
  signal: AbortSignal | undefined,
): Promise<readonly string[]> {
  const stat = await files.stat(path, signal);
  if (stat === undefined) return [];
  if (stat.isSymlink) return [`${path}\0->${stat.realPath ?? ''}`];
  if (stat.isDirectory) return treeLines(files, path, sha256, signal);
  const bytes = await files.readBytes(path, signal);
  return bytes === undefined ? [] : [`${path}\0${await sha256.hex(bytes)}`];
}

async function treeLines(
  files: PluginFiles,
  directory: string,
  sha256: Sha256,
  signal: AbortSignal | undefined,
): Promise<readonly string[]> {
  const lines: string[] = [];
  for (const name of await namesIn(files, directory, signal)) {
    lines.push(...(await entryLines(files, childPath(directory, name), sha256, signal)));
  }
  return lines;
}

/**
 * The version of a `copy`-mode `command` source: "a hash of the copied files", 12 characters. The
 * input is one line per file or link in path order (`<path> NUL <digest of its bytes>`, or `<path>
 * NUL -> <link target>`), so the same files give the same hash ("a re-run that produces identical
 * files counts as up to date") and moving content between paths changes it.
 */
export async function copyModeHash(
  files: PluginFiles,
  sha256: Sha256,
  signal?: AbortSignal,
): Promise<string> {
  const lines = await treeLines(files, '.', sha256, signal);
  return shortHash12(await digestOf(lines.join('\n'), sha256));
}

/**
 * The version of a `link`-mode `command` source: "the printed directory's real path and its
 * top-level entries, not ... the files inside them". The input is the real path and the top-level
 * names in order; nothing is opened, so a link-mode plugin of any size has a version.
 */
export async function linkModeHash(
  realPath: string,
  files: PluginFiles,
  sha256: Sha256,
  signal?: AbortSignal,
): Promise<string> {
  const names = await namesIn(files, '.', signal);
  return shortHash12(await digestOf([realPath, ...names].join('\0'), sha256));
}

/**
 * The hash a `git-subdir` version carries ("a hash of the subdirectory path"): the first 8 hex
 * digits of the SHA-256 of the path, written without a leading `./` or a trailing `/` so the two
 * spellings of one directory give one version.
 */
export async function subdirectoryPathHash(path: string, sha256: Sha256): Promise<string> {
  const normalized = path.replace(/^(\.\/)+/u, '').replace(/\/+$/u, '');
  return (await digestOf(normalized, sha256)).slice(0, SUBDIRECTORY_HASH_LENGTH);
}
