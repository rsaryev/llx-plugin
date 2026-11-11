/**
 * Ports only the marketplace stream needs (docs/API.md, "Marketplace"), type-only like the rest of
 * `src/ports/`. They name layer-0 and layer-1 types only; the port that names a plugin issue and a
 * fetch plan (`SourceFetcher`) lives in `src/marketplace/ports.ts`. The module barrel exports all
 * of them, so `src/ports/index.ts` stays the foundation's.
 *
 * Planning a fetch is pure; a port is needed only where the kit must hash, count or list something
 * it cannot compute without an effect. An effect that did not happen (a corrupt zip, an
 * unreachable git host) is a `PortFailure` in the result, never a throw (docs/ARCHITECTURE.md, "Ports").
 */
import type { PortFailure } from './failure.ts';

/** A SHA-256 digest of bytes as 64 lower-case hex digits (a port keeps `crypto` out of `src/`, L3). */
export interface Sha256 {
  hex(bytes: Uint8Array): Promise<string>;
}

/**
 * What the kit judges about an archive: the documented extraction limits (host-marketplace.md, "Stay
 * within the download limits for hosted files") and the plugin root. It is derived from the entries
 * a host scans (`archiveStats`, `marketplace/archive-scan.ts`), never reported by the host.
 */
export interface ArchiveStats {
  readonly entries: number;
  readonly largestFileBytes: number;
  readonly uncompressedBytes: number;
  readonly compressedBytes: number;
  /** The names at the top level of the archive, directories and files alike. */
  readonly topLevel: readonly string[];
}

/**
 * One entry of a zip as its central directory lists it: the path as stored (`/`-separated; a
 * directory ends with `/`), the uncompressed size, and for a symbolic link where it points, as
 * stored. The kit checks the paths and the links, so no entry is written before it is judged.
 */
export interface ArchiveEntry {
  readonly path: string;
  readonly size: number;
  readonly isSymlink: boolean;
  readonly linkTarget?: string;
}

/** What a scan of a zip returns: every entry, in archive order. */
export interface ArchiveScan {
  readonly entries: readonly ArchiveEntry[];
}

/** `corrupt`: the bytes are not a readable zip, so the download is refused; `aborted`: the signal fired. */
export type ArchiveFailure = PortFailure<'corrupt' | 'aborted'>;

export interface ArchiveReader {
  /**
   * Lists the entries of a zip without extracting anything, so the extraction limits, the zip-slip
   * paths and the links are judged by the kit before a host unzips. Unzipping is work a host may
   * need to cancel, so the signal is required, as for any request that does I/O. A link's target
   * is a path: read it with a bound, never inflate it whole. The kit judges names only, so a host
   * that unzips checks the real path of the folder it writes into (docs/SECURITY.md, "Risks the
   * host owns").
   */
  scan(bytes: Uint8Array, signal: AbortSignal): Promise<ArchiveScan | ArchiveFailure>;
}

/** The repository a tag listing is about: a GitHub `owner/repo` shorthand or a git URL. */
export type GitRepository = { readonly shorthand: string } | { readonly url: string };

export type GitTagsFailure = PortFailure<'connection' | 'timeout' | 'aborted'>;

/** Lists the tags of a plugin's repository, so dependency tag resolution runs without git. */
export interface GitTags {
  list(repository: GitRepository, signal: AbortSignal): Promise<readonly string[] | GitTagsFailure>;
}

/** `write`: the file could not be written; `remove`: it could not be removed; `aborted`: the signal fired. */
export type StateStoreFailure = PortFailure<'write' | 'remove' | 'aborted'>;

/**
 * The files Claude Code keeps directly under the plugins root (`installed_plugins.json`,
 * `known_marketplaces.json` and the dated copies; plugins/loading.md, "Find plugins on disk"), read,
 * written and removed by name. The kit decides what the text is and when to write it
 * (`installed-plugins.ts`, `known-marketplaces.ts`) and which copies have aged out
 * (`copy-sweep.ts`); the host owns the folder and the atomic write.
 *
 * The kit takes no lock: `loadInstalledPlugins` reads, keeps a copy and rewrites, and two callers
 * that overlap can each rewrite the file. A host that runs more than one session over one plugins
 * root serialises those calls itself (a lock file, a database transaction or one queue), as it does
 * every other write under the root; the port has no compare-and-swap to offer.
 */
export interface PluginStateStore {
  /** The file's text, or `undefined` when there is none. */
  read(name: string, signal: AbortSignal): Promise<string | undefined>;
  /**
   * Writes the whole file atomically (a temporary file renamed over it), so a reader sees the old
   * text or the new, never a mix. Resolves to `undefined` on success.
   */
  write(name: string, text: string, signal: AbortSignal): Promise<undefined | StateStoreFailure>;
  /** The names of the files and folders directly under the plugins root. */
  names(signal: AbortSignal): Promise<readonly string[]>;
  /** When the file was last written, in Unix milliseconds; `undefined` when there is none. */
  modifiedAt(name: string, signal: AbortSignal): Promise<number | undefined>;
  /** Removes the file; a file that is already gone is removed. Resolves to `undefined` on success. */
  remove(name: string, signal: AbortSignal): Promise<undefined | StateStoreFailure>;
}
