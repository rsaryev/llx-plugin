import type { PluginIssue } from '../format/issues.ts';
import type { PluginFiles } from '../ports/files.ts';
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

export interface SourceFetcher {
  fetchPlugin(
    plan: HostFetchPlan,
    signal: AbortSignal,
  ): Promise<{ readonly files: PluginFiles } | PluginIssue>;
}

/**
 * Opens a directory the host names by absolute path (the directory a `command` source printed) as
 * read-only plugin files rooted there, so the kit can judge what is inside without reading outside
 * it. `undefined` when the path is not an existing directory.
 */
export interface PluginDirectories {
  open(path: string, signal: AbortSignal): Promise<PluginFiles | undefined>;
}
