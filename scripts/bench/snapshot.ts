/**
 * A plugin folder read into memory once, so `loadPlugin` over `memoryFiles` times the kit alone.
 * Symlinks stay links (relative targets), as the disk adapter sees them. A root that is not there
 * (a marketplace may list a local path it does not have) is an empty folder, as the disk adapter
 * reads it.
 */
import { existsSync } from 'node:fs';
import { lstat, readdir, readFile, readlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { MemoryEntry } from '../../src/testing/index.ts';

const SKIPPED = new Set(['.git', 'node_modules']);

export async function snapshotOf(root: string): Promise<Record<string, MemoryEntry>> {
  const files: Record<string, MemoryEntry> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue;
      const path = join(dir, entry.name);
      const key = relative(root, path).split('\\').join('/');
      const info = await lstat(path);
      if (info.isSymbolicLink()) files[key] = { symlink: await readlink(path) };
      else if (info.isDirectory()) await walk(path);
      else if (info.isFile()) files[key] = new Uint8Array(await readFile(path));
    }
  };
  if (existsSync(root)) await walk(root);
  return files;
}
