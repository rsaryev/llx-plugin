import type { PluginIssue } from '../format/issues.ts';
import type { PluginFiles } from '../ports/files.ts';
import type { PortFailure } from '../ports/failure.ts';
import type { TreePlan } from './copy-plan.ts';
import type { ArchiveFetchPlan, CommandFetchPlan, FetchPlan } from './types.ts';

/**
 * What only the host can do: a git clone with sparse checkout, an `npm pack`. The kit never runs
 * git or npm; it plans the fetch (`planPluginFetch`) and hands the plan here. It lives in this
 * module, not in `src/ports/`, because it names a plugin issue and a fetch plan (docs/ARCHITECTURE.md,
 * "Ports"). A fetch that did not happen is a `PluginIssue` value, never a throw.
 */
export type HostFetchPlan = Exclude<
  FetchPlan,
  { kind: 'local' } | ArchiveFetchPlan | CommandFetchPlan
>;

/**
 * What a fetch leaves: the plugin's files to read, or a directory the host staged them in (a git
 * clone, an unpacked tarball) by absolute path, so a host that installs by copying a directory
 * never has to read every file through the kit first. `files` beside a staged path is the same
 * directory opened read-only, when the fetcher already has it. Open a staged directory with
 * `StagedDirectory.open` and install it with `StagedDirectory.commit`.
 */
export type FetchedPlugin =
  | { readonly files: PluginFiles; readonly stagedPath?: undefined }
  | { readonly stagedPath: string; readonly files?: PluginFiles };

export interface SourceFetcher {
  fetchPlugin(plan: HostFetchPlan, signal: AbortSignal): Promise<FetchedPlugin | PluginIssue>;
}

/**
 * What became of the copy that was installed before, when moving the new one in failed
 * (plugins/troubleshooting.md, "Could not move the new copy of this plugin version into <path>").
 * `none`: there was no earlier copy.
 */
export type PreviousCopy =
  | 'none'
  | 'moved-back'
  | 'removed-first'
  | 'not-moved-back'
  | 'could-not-be-moved-back';

/**
 * Why `StagedDirectory.commit` did not finish: `busy` (the new copy or the version folder stayed
 * busy, with the file-system `code` such as `ENOTEMPTY`), `held` (Windows: another program holds the
 * installed copy itself, so it was not replaced and the new copy was discarded), `permission` (the
 * cache folder cannot be written or the disk is full) or `aborted`.
 */
export interface CommitFailure extends PortFailure<'busy' | 'held' | 'permission' | 'aborted'> {
  /** The file-system code, such as `ENOTEMPTY`, `EBUSY`, `EACCES`. */
  readonly code?: string;
  readonly previous: PreviousCopy;
  /** Set-aside folders inside the cache the failed move left behind. */
  readonly leftOnDisk?: readonly string[];
}

export type StagedRemoveFailure = PortFailure<'remove' | 'aborted'>;

/** One install of a staged directory into the cache. */
export interface StagedCommit {
  readonly stagedPath: string;
  /** A version folder of the cache. */
  readonly destination: string;
  /**
   * What the copy does with each symbolic link (`planTreeCopy`): a link within the plugin is
   * relinked, one elsewhere in the marketplace is replaced by a copy of its target, one outside
   * the marketplace is left out. Absent when the staged tree holds no link: only then is moving
   * the directory whole the whole install.
   */
  readonly plan?: TreePlan;
}

/**
 * A directory a host staged a fetched plugin in, so it installs by moving that directory rather
 * than copying files the kit read. It is the host's folder: the kit reads it, asks for it to be
 * moved and removes it, and never writes into it.
 *
 * The host does the two other writes of an install itself, from what the kit plans: it creates a
 * link-mode entry from `InstallFinished.links` (and keeps `mustStayAt` where it is), and it writes
 * the `.orphaned_at` marker (`orphanMarkerPath`) into each directory of `InstallFinished.orphaned`
 * or `UninstallSelection.orphaned`.
 */
export interface StagedDirectory {
  /** The directory as read-only plugin files rooted there; `undefined` when it is not a directory. */
  open(stagedPath: string, signal: AbortSignal): Promise<PluginFiles | undefined>;
  /**
   * Installs the directory at `destination` so a reader sees the old copy or the new, never a mix;
   * an earlier copy at `destination` is moved aside first and moved back when the install fails.
   * With a `plan`, the tree is materialized as the plan says (relink, dereference, skip) before it
   * takes the place; without one it is moved whole. The plan decides only the links of the entries
   * it was given: a dereferenced directory is copied without following a link inside it (the host
   * lists it and plans it again with `planTreeCopy`, or leaves its links out), never with a copy
   * that follows links. Resolves to `undefined` on success.
   */
  commit(request: StagedCommit, signal: AbortSignal): Promise<undefined | CommitFailure>;
  /** Removes the directory; one that is already gone is removed. Resolves to `undefined` on success. */
  remove(stagedPath: string, signal: AbortSignal): Promise<undefined | StagedRemoveFailure>;
}

/**
 * Opens a directory the host names by absolute path (the directory a `command` source printed) as
 * read-only plugin files rooted there, so the kit can judge what is inside without reading outside
 * it. `undefined` when the path is not an existing directory.
 */
export interface PluginDirectories {
  open(path: string, signal: AbortSignal): Promise<PluginFiles | undefined>;
}
