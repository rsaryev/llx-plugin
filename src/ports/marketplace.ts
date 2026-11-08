/**
 * Ports only the marketplace stream needs (docs/API.md, "Marketplace"), type-only like the rest of
 * `src/ports/`. They name layer-0 and layer-1 types only; the port that names a plugin issue and a
 * fetch plan (`SourceFetcher`) lives in `src/marketplace/ports.ts`. The module barrel exports all
 * of them, so `src/ports/index.ts` stays the foundation's.
 *
 * Planning a fetch is pure; a port is needed only where the kit must hash, count or list something
 * it cannot compute without an effect.
 */

/** A SHA-256 digest of bytes as 64 lower-case hex digits (a port keeps `crypto` out of `src/`, L3). */
export interface Sha256 {
  hex(bytes: Uint8Array): Promise<string>;
}

/**
 * What a host reports about an archive it can unzip, so the kit judges the documented extraction
 * limits (host-marketplace.md, "Stay within the download limits for hosted files") and finds the
 * plugin root without unzipping anything itself.
 */
export interface ArchiveStats {
  readonly entries: number;
  readonly largestFileBytes: number;
  readonly uncompressedBytes: number;
  readonly compressedBytes: number;
  /** The names at the top level of the archive, directories and files alike. */
  readonly topLevel: readonly string[];
}

export interface ArchiveReader {
  stats(bytes: Uint8Array, signal?: AbortSignal): Promise<ArchiveStats>;
}

/** The repository a tag listing is about: a GitHub `owner/repo` shorthand or a git URL. */
export type GitRepository = { readonly shorthand: string } | { readonly url: string };

/** Lists the tags of a plugin's repository, so dependency tag resolution runs without git. */
export interface GitTags {
  list(repository: GitRepository, signal: AbortSignal): Promise<readonly string[]>;
}
