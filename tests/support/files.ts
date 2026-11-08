import type { DirectoryEntry, FileStat, PluginFiles } from '../../src/ports/index.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A file's text or bytes, or a symbolic link to another path of the folder (or outside it). */
export type MemoryEntry = string | Uint8Array | { readonly symlink: string };

type Content = string | Uint8Array;
type Operation = 'readText' | 'readBytes' | 'list' | 'stat' | 'exists';

const bytesOf = (data: Content): Uint8Array =>
  typeof data === 'string' ? encoder.encode(data) : data;

const isLink = (entry: MemoryEntry | undefined): entry is { readonly symlink: string } =>
  typeof entry === 'object' && !(entry instanceof Uint8Array);

const clean = (path: string): string =>
  path
    .replace(/^(\.\/)+/, '')
    .replace(/\/+$/, '')
    .replace(/^\.$/, '');

const MAX_HOPS = 8;
const leavesFolder = (path: string): boolean => path.startsWith('/') || /^\.\.(\/|$)/.test(path);

/**
 * An in-memory plugin folder: keys are `/`-separated paths relative to the folder, values the
 * file's text or bytes, or `{ symlink: '<target>' }` for a symbolic link to a path of the folder
 * (`stat` then says `isSymlink` with the target as `realPath`; reads and `list` follow it) or
 * outside it (`../x`, `/x`: the link dangles for reads, `realPath` names the target). Directories
 * exist as the prefixes of the keys; paths below a symlinked directory are not followed.
 * `accesses` records every call in order, `reads` only the paths of `readText` and `readBytes`,
 * for tests that assert what was (not) touched.
 */
export function memoryFiles(files: Readonly<Record<string, MemoryEntry>> = {}): PluginFiles & {
  readonly reads: string[];
  readonly accesses: { readonly operation: Operation; readonly path: string }[];
} {
  const entries = new Map(Object.entries(files).map(([path, data]) => [clean(path), data]));
  const reads: string[] = [];
  const accesses: { readonly operation: Operation; readonly path: string }[] = [];
  const touch = (operation: Operation, path: string): void => {
    accesses.push({ operation, path });
  };
  const children = (directory: string): Map<string, boolean> => {
    const prefix = directory === '' ? '' : `${directory}/`;
    const found = new Map<string, boolean>();
    for (const path of entries.keys()) {
      if (!path.startsWith(prefix)) continue;
      const [name = '', ...rest] = path.slice(prefix.length).split('/');
      found.set(name, rest.length > 0 || found.get(name) === true);
    }
    return found;
  };
  /** The path a link chain ends at, or `undefined` when it leaves the folder or loops. */
  const follow = (key: string, hops = 0): string | undefined => {
    const entry = entries.get(key);
    if (!isLink(entry)) return key;
    const target = clean(entry.symlink);
    return leavesFolder(target) || hops >= MAX_HOPS ? undefined : follow(target, hops + 1);
  };
  const contentOf = (path: string): Content | undefined => {
    const final = follow(clean(path));
    const entry = final === undefined ? undefined : entries.get(final);
    return isLink(entry) ? undefined : entry;
  };
  const isDirectoryAt = (key: string): boolean => key === '' || children(key).size > 0;
  const stat = (path: string): FileStat | undefined => {
    const key = clean(path);
    const entry = entries.get(key);
    const final = follow(key);
    const data = contentOf(key);
    const isLinked = isLink(entry);
    const isDirectory = data === undefined && final !== undefined && isDirectoryAt(final);
    if (!isLinked && data === undefined && !isDirectory) return undefined;
    return {
      isFile: data !== undefined,
      isDirectory,
      isSymlink: isLinked,
      size: data === undefined ? 0 : bytesOf(data).length,
      ...(isLinked && { realPath: final ?? clean(entry.symlink) }),
    };
  };
  return {
    reads,
    accesses,
    readText: (path) => {
      reads.push(path);
      touch('readText', path);
      const data = contentOf(path);
      return Promise.resolve(data === undefined ? undefined : decoder.decode(bytesOf(data)));
    },
    readBytes: (path) => {
      reads.push(path);
      touch('readBytes', path);
      const data = contentOf(path);
      return Promise.resolve(data === undefined ? undefined : bytesOf(data));
    },
    list: (path): Promise<readonly DirectoryEntry[] | undefined> => {
      touch('list', path);
      const key = follow(clean(path));
      if (key === undefined || contentOf(key) !== undefined || !isDirectoryAt(key)) {
        return Promise.resolve(undefined);
      }
      const sorted = [...children(key)].toSorted(([a], [b]) => a.localeCompare(b));
      const named = sorted.map(([name, isDirectory]) => {
        const child = stat(key === '' ? name : `${key}/${name}`);
        return {
          name,
          isFile: child?.isFile === true,
          isDirectory: isDirectory || !!child?.isDirectory,
        };
      });
      return Promise.resolve(named);
    },
    stat: (path) => {
      touch('stat', path);
      return Promise.resolve(stat(path));
    },
    exists: (path) => {
      touch('exists', path);
      return Promise.resolve(stat(path) !== undefined);
    },
  };
}
