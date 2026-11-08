/** The install and cache lifecycle: modes, copy plans, the install plan, failures, archive scans, session plugins. */
export type { ArchiveEntry, ArchiveScan } from '../ports/marketplace.ts';
export type {
  CommitFailure,
  FetchedPlugin,
  PreviousCopy,
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
export { isWithin, linkReach, relativeFrom, type LinkReach } from './link-rule.ts';
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
export { escapedPathIssue, type DeclaredPath } from './path-escape.ts';
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
  notInstalledInScope,
  selectUninstall,
  type UninstallSelection,
  type UninstallSelector,
} from './uninstall-records.ts';
export {
  MAX_POINTER_BYTES,
  lfsPointerIssue,
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
  INSTALL_HOSTS,
  SHELL_INSTALL_LOADS,
  installSummary,
  loadsInstalledPlugins,
  planInstallCommand,
  pluginCommandReply,
  shellInstallLines,
  shellInstallPrelude,
  type InstallHostFacts,
  type InstallCommand,
  type InstallCommandPlan,
  type InstallSummary,
  type InstallHost,
  type SummaryFacts,
} from './install-commands.ts';
