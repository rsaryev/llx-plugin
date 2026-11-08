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
