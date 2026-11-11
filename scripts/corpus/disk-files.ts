/**
 * The `PluginFiles` port over a folder on disk, as a local host implements it: paths are relative
 * to the plugin root and `/`-separated; a path that escapes the root, by `..` or by a symlink, reads
 * as absent, while `stat` still reports the link and where it leads (`FileStat.realPath`).
 */
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { DirectoryEntry, FileStat, PluginFiles } from '../../src/index.ts';

const inside = (root: string, path: string): boolean =>
  path === root || path.startsWith(root + sep);

export function diskFiles(rootDir: string): PluginFiles {
  const root = resolve(rootDir);
  const real = async (path: string): Promise<string | undefined> => {
    try {
      const target = await realpath(resolve(root, path));
      return inside(await realpath(root), target) ? target : undefined;
    } catch {
      return undefined;
    }
  };
  const readBytes = async (path: string): Promise<Uint8Array | undefined> => {
    const target = await real(path);
    if (target === undefined) return undefined;
    try {
      return new Uint8Array(await readFile(target));
    } catch {
      return undefined;
    }
  };
  const list = async (path: string): Promise<readonly DirectoryEntry[] | undefined> => {
    const target = await real(path);
    if (target === undefined) return undefined;
    try {
      const entries = await readdir(target, { withFileTypes: true });
      const listed = await Promise.all(entries.map(async (entry) => entryOf(target, entry.name)));
      return listed.toSorted((a, b) => a.name.localeCompare(b.name));
    } catch {
      return undefined;
    }
  };
  /** Where a link really points: relative to the root inside it, the host path outside it. */
  const linkTarget = async (path: string): Promise<string | undefined> => {
    try {
      const rootReal = await realpath(root);
      const target = await realpath(resolve(root, path));
      return inside(rootReal, target) ? relative(rootReal, target).split(sep).join('/') : target;
    } catch {
      return undefined;
    }
  };
  const fileStat = async (path: string): Promise<FileStat | undefined> => {
    try {
      const own = await lstat(resolve(root, path));
      const target = await real(path);
      const followed = target === undefined ? undefined : await stat(target);
      const realPath = own.isSymbolicLink() ? await linkTarget(path) : undefined;
      return {
        isFile: followed?.isFile() ?? false,
        isDirectory: followed?.isDirectory() ?? false,
        isSymlink: own.isSymbolicLink(),
        size: followed?.size ?? own.size,
        ...(realPath !== undefined && { realPath }),
      };
    } catch {
      return undefined;
    }
  };
  return {
    readText: async (path) => {
      const bytes = await readBytes(path);
      return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
    },
    readBytes,
    list,
    stat: fileStat,
    exists: async (path) => (await real(path)) !== undefined,
  };
}

async function entryOf(dir: string, name: string): Promise<DirectoryEntry> {
  try {
    const found = await stat(resolve(dir, name));
    return { name, isFile: found.isFile(), isDirectory: found.isDirectory() };
  } catch {
    return { name, isFile: false, isDirectory: false };
  }
}
