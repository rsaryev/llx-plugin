import { createHash } from 'node:crypto';
import type { PluginFiles } from '../../src/ports/index.ts';
import type {
  ArchiveFailure,
  ArchiveReader,
  ArchiveScan,
  Sha256,
} from '../../src/ports/marketplace.ts';
import type {
  CommitFailure,
  PluginDirectories,
  StagedDirectory,
} from '../../src/marketplace/ports.ts';

/**
 * Fakes of the ports only marketplaces use, for the engines' tests: `PluginDirectories` over a
 * record of absolute path to folder (a path that is not a key is not a directory), and a folder
 * whose files report the sizes a test names without holding their bytes.
 */
export function directoriesAt(
  folders: Readonly<Record<string, PluginFiles>>,
): PluginDirectories & { readonly opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    open: (path) => {
      opened.push(path);
      return Promise.resolve(Object.hasOwn(folders, path) ? folders[path] : undefined);
    },
  };
}

/** `files` with `stat(path).size` replaced for the paths in `sizes`; everything else is `files` itself. */
export function withSizes(
  files: PluginFiles,
  sizes: Readonly<Record<string, number>>,
): PluginFiles {
  return {
    readText: (path, signal) => files.readText(path, signal),
    readBytes: (path, signal) => files.readBytes(path, signal),
    list: (path, signal) => files.list(path, signal),
    exists: (path, signal) => files.exists(path, signal),
    stat: async (path, signal) => {
      const found = await files.stat(path, signal);
      if (found === undefined || !Object.hasOwn(sizes, path)) return found;
      return { ...found, size: sizes[path] ?? found.size };
    },
  };
}

/** A `Sha256` that returns `hex` for any bytes and records what it was asked to hash. */
export function fakeSha256(hex: string): Sha256 & { readonly hashed: Uint8Array[] } {
  const hashed: Uint8Array[] = [];
  return {
    hashed,
    hex: (bytes) => {
      hashed.push(bytes);
      return Promise.resolve(hex);
    },
  };
}

/** A `Sha256` that hashes the bytes for real, so a digest depends on its input. */
export const realSha256: Sha256 = {
  hex: (bytes) => Promise.resolve(createHash('sha256').update(bytes).digest('hex')),
};

/** An `ArchiveReader` that reports `answer` for any bytes (a scan or a failure) and counts its calls. */
export function fakeArchive(
  answer: ArchiveScan | ArchiveFailure,
): ArchiveReader & { calls: number } {
  const reader = {
    calls: 0,
    scan: () => {
      reader.calls += 1;
      return Promise.resolve(answer);
    },
  };
  return reader;
}

/** A `StagedDirectory` whose `commit` answers `failure` (or succeeds) and that records every call. */
export function fakeStaged(
  failure?: CommitFailure,
): StagedDirectory & { readonly commits: { stagedPath: string; destination: string }[] } {
  const commits: { stagedPath: string; destination: string }[] = [];
  return {
    commits,
    open: () => Promise.resolve(undefined),
    commit: (stagedPath, destination) => {
      commits.push({ stagedPath, destination });
      return Promise.resolve(failure);
    },
    remove: () => Promise.resolve(undefined),
  };
}
