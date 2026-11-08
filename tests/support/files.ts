import type { DirectoryEntry, FileStat, PluginFiles } from '../../src/ports/index.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesOf = (data: string | Uint8Array): Uint8Array =>
  typeof data === 'string' ? encoder.encode(data) : data;

const clean = (path: string): string =>
  path
    .replace(/^(\.\/)+/, '')
    .replace(/\/+$/, '')
    .replace(/^\.$/, '');

/**
 * An in-memory plugin folder: keys are `/`-separated paths relative to the folder, values the
 * file's text or bytes. Directories exist as the prefixes of the keys. `reads` records every path
 * read, in order, for tests that assert what was (not) touched.
 */
export function memoryFiles(
  files: Readonly<Record<string, string | Uint8Array>> = {},
): PluginFiles & { readonly reads: string[] } {
  const entries = new Map(Object.entries(files).map(([path, data]) => [clean(path), data]));
  const reads: string[] = [];
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
  const stat = (path: string): FileStat | undefined => {
    const key = clean(path);
    const data = entries.get(key);
    if (data !== undefined) {
      return { isFile: true, isDirectory: false, isSymlink: false, size: bytesOf(data).length };
    }
    const isDirectory = key === '' || children(key).size > 0;
    return isDirectory ? { isFile: false, isDirectory, isSymlink: false, size: 0 } : undefined;
  };
  return {
    reads,
    readText: (path) => {
      reads.push(path);
      const data = entries.get(clean(path));
      return Promise.resolve(data === undefined ? undefined : decoder.decode(bytesOf(data)));
    },
    readBytes: (path) => {
      reads.push(path);
      const data = entries.get(clean(path));
      return Promise.resolve(data === undefined ? undefined : bytesOf(data));
    },
    list: (path): Promise<readonly DirectoryEntry[] | undefined> => {
      const key = clean(path);
      if (entries.has(key) || stat(key) === undefined) return Promise.resolve(undefined);
      const sorted = [...children(key)].toSorted(([a], [b]) => a.localeCompare(b));
      return Promise.resolve(
        sorted.map(([name, isDirectory]) => ({ name, isFile: !isDirectory, isDirectory })),
      );
    },
    stat: (path) => Promise.resolve(stat(path)),
    exists: (path) => Promise.resolve(stat(path) !== undefined),
  };
}
