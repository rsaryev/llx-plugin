/** Marketplaces: where plugins come from and how they are fetched, renamed and resolved (docs/API.md, "Marketplace"). */
export type {
  ArchiveFetchPlan,
  ArchiveLimits,
  CommandFetchPlan,
  FetchPlan,
  FetchPlanContext,
  FetchPlanKind,
  GitFetchPlan,
  HeaderMap,
  MarketplaceFetchPlan,
  NormalizedDependency,
  NpmFetchPlan,
  RenameStatus,
  SubmoduleRule,
} from './types.ts';
export type { HostFetchPlan, PluginDirectories, SourceFetcher } from './ports.ts';
export type {
  ArchiveFailure,
  ArchiveReader,
  ArchiveStats,
  GitRepository,
  GitTags,
  GitTagsFailure,
  Sha256,
} from '../ports/marketplace.ts';
export { ARCHIVE_LIMITS, planPluginFetch, type Planned } from './fetch-plan.ts';
export { isBlockedHost } from './blocked-hosts.ts';
export {
  runCommandSource,
  type CommandSourcePorts,
  type CommandSourceSetting,
  type FetchedCommandPlugin,
} from './command-source.ts';
export { fetchArchive, type ArchivePorts, type FetchedArchive } from './archive-source.ts';
export {
  selectSubmodules,
  submodulePaths,
  submoduleRuleFor,
  type SubmoduleEvidence,
} from './submodules.ts';
