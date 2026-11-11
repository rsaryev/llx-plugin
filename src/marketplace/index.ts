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
  ResolvedHeaders,
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
  PluginStateStore,
  Sha256,
  StateStoreFailure,
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
export { fetchMarketplaceFile, type HttpFilePlan } from './marketplace-download.ts';
export {
  MARKETPLACE_FILE,
  readMarketplaceDirectory,
  readMarketplaceText,
} from './marketplace-catalog.ts';
export {
  selectSubmodules,
  submodulePaths,
  submoduleRuleFor,
  type SubmoduleEvidence,
} from './submodules.ts';
export {
  archiveDownloadHeaders,
  entryLayer,
  resolveHeaders,
  urlSourceLayer,
  type DownloadHeaderPorts,
  type DownloadHeaderRequest,
  type EntryDeclaration,
  type EntryHeaders,
  type UrlSourceHeaders,
} from './download-headers.ts';
export {
  runHeadersHelper,
  helperCache,
  type HelperCache,
  type HeadersHelperPorts,
} from './header-helper.ts';
export { mergeHeaders, normalizeHeaders, withoutRoutingHeaders } from './header-map.ts';
export {
  HEADER_ORIGINS,
  HEADER_PLACES,
  HELPER_REASONS,
  PLUGIN_OPERATIONS,
  helperAllowed,
  type HeaderLayer,
  type HeaderOrigin,
  type HeaderPlace,
  type HeadersSetting,
  type HelperEffect,
  type HelperReason,
  type HelperVerdict,
  type PluginOperation,
} from './header-policy.ts';
export { isCredentialVariable, withoutCredentials } from './credential-variables.ts';
export { planMarketplaceFetch } from './marketplace-fetch-plan.ts';
export { parseMarketplaceInput, type MarketplaceInputOptions } from './marketplace-input.ts';
export {
  SCOPES_BY_PRECEDENCE,
  collaboratorInstallCommand,
  defaultScope,
  mostSpecificScope,
  scopeReach,
  type ChosenScope,
  type InstallScope,
  type ScopeReach,
  type ScopedCommand,
} from './install-scopes.ts';
export {
  migrateSettingsKeys,
  migrateSettingsScopes,
  renameNotice,
  resolveRename,
  type MigratedKeys,
  type MigratedScopes,
  type ScopedSettings,
} from './renames.ts';
export {
  REMOVED_STATUS,
  removedPlugins,
  type InstalledPlugin,
  type RemovedPlugin,
} from './removal.ts';
export {
  checkDependency,
  checkInstalledDependency,
  dependencyId,
  namesMarketplace,
  normalizeDependency,
  type DependencyCopies,
  type DependencyCause,
  type DependencyErrorType,
  type DependencyIssue,
  type InstalledDependency,
} from './dependencies.ts';
export {
  autoUpdateDecision,
  combineRanges,
  parseReleaseTag,
  releaseTag,
  resolveDependencyVersion,
  resolvedVersionLabel,
  selectTag,
  type AutoUpdateDecision,
  type AutoUpdateInput,
  type DependencyResolution,
  type ReleaseTag,
  type ResolvedVersion,
} from './dependency-tags.ts';
export { rangesOverlap } from './semver.ts';
export {
  checkDeclaredDependency,
  constraintsOn,
  dependentsOf,
  disableDecision,
  effectiveEnabled,
  findDependencyCopy,
  isEnabled,
  winningScope,
  type CatalogPlugin,
  type Constraint,
  type CopyLookup,
  type DeclaredDependency,
  type DisableDecision,
  type EnabledPlugins,
  type GraphFacts,
  type InstalledRecord,
  type LocalCopy,
} from './dependency-graph.ts';
export {
  DEPENDENCY_INSTALL_OPERATIONS,
  installClosure,
  type DependencyInstallOperation,
  type InstallPlan,
  type InstallRequest,
  type InstallStep,
  type StepAction,
} from './dependency-install-plan.ts';
export type { LeftOut, LeftOutReason } from './dependency-install-walk.ts';
export { catalogDependencies } from './dependency-catalog.ts';
export {
  enablePlan,
  type EnableBlock,
  type EnableIssue,
  type EnablePlan,
} from './dependency-enable.ts';
export {
  orphanedAutoInstalled,
  planPrune,
  planUninstall,
  type PruneOutcome,
  type PruneRun,
  type UninstallPlan,
} from './dependency-prune.ts';
export {
  pluginDirDependencyIssues,
  type PluginDirPlugin,
  type UnloadedPlugin,
} from './plugin-dir-dependencies.ts';
export {
  crossMarketplaceDecision,
  type CrossMarketplaceDecision,
  type CrossMarketplaceQuestion,
  type DeclaredIn,
  type RefusalEffect,
} from './cross-marketplace.ts';
export * from './install-lifecycle-index.ts';

export {
  checkForUpdate,
  isUpdate,
  loadsInPlace,
  precheckUpdate,
  upToDateMessage,
  type PrecheckOutcome,
  type UpdateCheck,
  type UpdatePrecheck,
  type UpdateOutcome,
  type UpdateSubject,
  type UpdateVerdict,
} from './update-detection.ts';
export {
  checkReleaseChannels,
  type ChannelManifestVersions,
  type ChannelManifests,
} from './release-channels.ts';
export { applySeeds, type RegistryEntry, type Seed, type SeededEntry } from './seed-registry.ts';
export * from './install-guidance.ts';
export * from './telemetry-names.ts';
