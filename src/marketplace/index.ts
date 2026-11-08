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
  INSTALL_SCOPES,
  SCOPE_PRECEDENCE,
  collaboratorInstallCommand,
  defaultScope,
  isWritableScope,
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
  normalizeDependency,
  type DependencyCopies,
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
  selectTag,
  type AutoUpdateDecision,
  type AutoUpdateInput,
  type DependencyResolution,
  type ReleaseTag,
  type ResolvedVersion,
} from './dependency-tags.ts';
export {
  crossMarketplaceDecision,
  type CrossMarketplaceDecision,
  type CrossMarketplaceQuestion,
  type DeclaredIn,
  type RefusalEffect,
} from './cross-marketplace.ts';
export {
  STORE_NAMES,
  classifyStoreEntry,
  createStoreLayout,
  resolvePluginsRoot,
  type PathJoin,
  type StoreEntry,
  type StoreLayout,
} from './store-layout.ts';
export {
  INSTALLED_PLUGINS_VERSION,
  parseInstalledPlugins,
  serializeInstalledPlugins,
  type InstallRecord,
  type InstalledPluginsRead,
  type InstalledRecords,
} from './installed-plugins.ts';
export {
  loadInstalledPlugins,
  type InstalledPluginsPorts,
  type LoadedInstalledPlugins,
} from './installed-plugins-store.ts';
export {
  installLocationFor,
  parseKnownMarketplaces,
  sameMarketplaceSource,
  serializeKnownMarketplaces,
  type KnownMarketplace,
  type KnownMarketplaces,
  type KnownMarketplacesRead,
  type RegistryFailureCode,
} from './known-marketplaces.ts';
export {
  ignoredLine,
  ignoredReason,
  untrustedSource,
  untrustedSourceMessage,
  type IgnoreChecks,
  type IgnoredReason,
  type IgnoredSurface,
} from './ignored-marketplace.ts';
export {
  RECORDS_UNREADABLE_CODE,
  listNote,
  rebuiltNote,
  recoveryNotes,
  refuseForUnreadableRecords,
  refusalResultLine,
  setAsideNote,
  unknownFormatMessage,
  unreadableRecordsMessage,
  type ErrorsTabEntry,
  type RecordsRefusal,
  type RefusingCommand,
} from './install-messages.ts';
export {
  ADD_OFFICIAL,
  PLUGINS_CHANGED,
  PLUGIN_ACTIVE,
  RELOAD_TO_APPLY,
  alreadyAddedFromDifferentSource,
  alreadyInstalledAtScope,
  alreadyInstalledGlobally,
  describeSource,
  enabledNotInstalled,
  failedToInstall,
  failureOnce,
  installActivation,
  isInstalledGlobally,
  marketplaceDirectoryNotFound,
  nameTheMarketplace,
  noMarketplaces,
  notCached,
  pluginDirectoryMissingAtRun,
  pluginDirectoryNotFound,
  pluginNotFound,
  pluginNotFoundAnywhere,
  reinstallCommand,
  type EmptyView,
  type InstallActivationFacts,
  type InstallFailure,
  type InstallSurface,
  type PluginNotFound,
} from './install-errors.ts';
export {
  decideEnabledFetch,
  overriddenUserDisable,
  type EnableSource,
  type EnabledFacts,
  type EnabledFetchDecision,
  type TrueIn,
  type UserDisableOverridden,
} from './enablement-notes.ts';
export {
  planMarketplaceStartup,
  stageReport,
  unresolvedAfterStart,
  type Layer,
  type Stage,
  type StageFacts,
  type StageReport,
  type StartupAction,
} from './stage-report.ts';
export {
  closePanel,
  marketplaceCommand,
  marketplaceTabUpdate,
  planMarketplaceRemoval,
  planMarketplaceUpdate,
  pluginActions,
  uninstallChoice,
  type CommandSurface,
  type MarketplaceAction,
  type MarketplaceRemovalFacts,
  type MarketplaceRemovalPlan,
  type MarketplaceTabPlugin,
  type MarketplaceUpdatePlan,
  type PanelClose,
  type PluginActionFacts,
  type UninstallOption,
} from './install-plans.ts';
export {
  planDisable,
  planInstall,
  planPrune,
  planUninstall,
  type DisablePlan,
  type InstallPlan,
  type UninstallPlan,
} from './dependency-plans.ts';
export { planEnable, type EnableOverride, type EnablePlan } from './dependency-enable.ts';
export { type PluginNode } from './dependency-graph.ts';
export {
  parseReloadArguments,
  reloadAllowed,
  reloadGate,
  reloadSummary,
  skillCount,
  type ReloadChange,
  type ReloadCounts,
  type ReloadGate,
} from './reload-summary.ts';
export {
  ORPHANED_MARKER,
  ORPHAN_GRACE_MS,
  dirsToOrphan,
  orphanMarkerPath,
  orphanSweep,
  type Orphan,
} from './orphan-cleanup.ts';
export {
  DEFAULT_CLEANUP_PERIOD_DAYS,
  agedCopies,
  sweepAgedCopies,
  type AgedName,
  type CopySweep,
} from './copy-sweep.ts';
export * from './version-index.ts';
export * from './install-index.ts';
