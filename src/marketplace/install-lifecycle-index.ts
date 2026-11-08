/** Install records, recovery and installed-state graph plans. */
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
  planPrune as planInstalledPrune,
  planUninstall as planInstalledUninstall,
  type DisablePlan,
  type InstallPlan as InstalledGraphInstallPlan,
  type UninstallPlan as InstalledGraphUninstallPlan,
} from './dependency-plans.ts';
export {
  planEnable,
  type EnableOverride,
  type EnablePlan as InstalledGraphEnablePlan,
} from './install-dependency-enable.ts';
export { type PluginNode } from './install-dependency-graph.ts';
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
