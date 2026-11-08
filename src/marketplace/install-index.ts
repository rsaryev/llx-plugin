/** The install and cache lifecycle: modes, copy plans, the install plan, failures, archive scans, session plugins. */
export type { ArchiveEntry, ArchiveScan } from '../ports/marketplace.ts';
export type {
  CommitFailure,
  FetchedPlugin,
  PreviousCopy,
  StagedCommit,
  StagedDirectory,
  StagedRemoveFailure,
} from './ports.ts';
export { archiveStats, unsafeEntryIssue } from './archive-scan.ts';
export {
  decideInstallMode,
  linkedPluginLoads,
  sessionDirectoryIssue,
  type InstallDecision,
  type InstallMode,
  type InstallOrigin,
  type ModeInput,
  type PrintedDirectory,
} from './install-mode.ts';
export { isWithin, linkReach, relativeFrom, type LinkReach } from '../format/link-rule.ts';
export {
  planTreeCopy,
  pluginRootIssue,
  type Dereference,
  type Relink,
  type SkipReason,
  type TreeEntry,
  type TreePlan,
  type TreeRoots,
} from './copy-plan.ts';
export { escapedPathIssue, type DeclaredPath } from '../format/path-escape.ts';
export {
  planInstallFinish,
  planInstallStart,
  type CacheLink,
  type InstallFinish,
  type InstallFinished,
  type InstallStart,
  type InstallStartInput,
} from './install-plan.ts';
export {
  NOT_A_LINK,
  UNSUPPORTED_SOURCE_TYPE,
  archiveIntegrityMessage,
  failedToInstallPlugin,
  manifestFailureMessage,
  moveFailureMessage,
  npmRefusalMessage,
  settingsIgnoredWarning,
  type IgnoredSettings,
  type ManifestProblem,
} from './install-failures.ts';
export { commitStagedPlugin } from './staged-commit.ts';
export {
  selectUninstall,
  type UninstallSelection,
  type UninstallSelector,
} from './uninstall-records.ts';
export {
  MAX_POINTER_BYTES,
  lfsPointerIssue,
  lfsPointerIssues,
  readLfsPointer,
  type LfsPointer,
} from './lfs-pointer.ts';
export {
  fetchSessionArchives,
  folderChanges,
  pluginDirArgument,
  pluginUrls,
  readPluginDirectory,
  type FolderChange,
  type PluginDirectoryReading,
  type SessionArchives,
} from './session-plugins.ts';
export {
  copyThatLoads,
  inlinePluginId,
  sessionOnlyRow,
  skillsDirPluginId,
  stopLoadingSkillsDirPlugin,
  type NameClash,
  type SessionOnlyRow,
} from './session-origins.ts';
export {
  installSummary,
  planInstallCommand,
  shellInstallLines,
  shellInstallPrelude,
  type InstallCommand,
  type InstallCommandPlan,
  type InstallSummary,
  type SummaryFacts,
} from './install-commands.ts';
export {
  OFFICIAL_MARKETPLACE_ADD,
  installWith,
  loadsInstalledPlugins,
  marketplacesAddedAtStart,
  planPluginApply,
  planPluginCommand,
  scopeChoices,
  type ApplyMoment,
  type ApplyOrigin,
  type InstallHost,
  type InstallWith,
  type MarketplaceAdd,
  type PluginCommandPlan,
} from './install-hosts.ts';
/** The Node.js package dependencies of a plugin: the plan, the registry-only rule and what the user sees. */
export { nodeDepsRun, planNodeDepsInstall } from './node-deps.ts';
export {
  DEPS_ORIGIN_OF_MODE,
  INSTALL_TIMEOUT_MS,
  type DepsOrigin,
  type NodeDepsInput,
  type NodeDepsInstall,
  type NodeDepsPlan,
  type NodeDepsResult,
  type NodeDepsSkip,
  type PackageManager,
  type SkipReason as NodeDepsSkipReason,
  type StagedFile,
  type UnsupportedLockfile,
} from './node-deps-types.ts';
export {
  installOutcome,
  nodeDepsNote,
  updateRetriesInstall,
  type CachedCopy,
  type FailureCause,
  type InstallOutcome,
  type NodeDepsNote,
  type NoteKind,
} from './node-deps-failure.ts';
export {
  readLockfile,
  type LockedOrigin,
  type LockfileFacts,
  type LockfileName,
  type RootDependencies,
} from './node-deps-lockfile.ts';
export {
  classifySpecifier,
  dependencyRefusal,
  downloadLinkRefusal,
  readPackageJson,
  specifierRefusals,
  type DependencyMap,
  type DependencySection,
  type PackageJson,
  type SpecifierKind,
  type SpecifierRefusal,
} from './node-deps-spec.ts';
