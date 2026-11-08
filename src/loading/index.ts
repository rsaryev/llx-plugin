/** Loading a plugin folder and resolving its components (docs/API.md, "Loading"). */
export * from './resolve/index.ts';
export type {
  McpBundle,
  McpBundleReader,
  McpBundleServer,
  McpBundleSetting,
  McpBundleSource,
} from '../ports/mcp-bundle.ts';
export { binPathEntries, distribution, DISTRIBUTION_TARGETS, pathWithPluginBins } from './bin.ts';
export type { Distribution, DistributionTarget } from './bin.ts';
export { COMBINE } from './combine.ts';
export { COMPONENT_READERS } from './component-readers.ts';
export { discoverComponents } from './discover.ts';
export type { ConfigInput, Discovered, DiscoveredFile } from './discovered.ts';
export { loadPlugin, type LoadPluginInput } from './load-plugin.ts';
export { mergeHooks } from './merge-hooks.ts';
export { classifyPluginFolder, type PluginFolderKind } from './plugin-folder.ts';
export type { LoadedPlugin, Plugin, PluginPath, PluginTextFile } from './plugin-model.ts';
export type {
  ComponentRead,
  ComponentReader,
  ComponentValues,
  ReadKind,
  ReaderContext,
} from './reader-types.ts';
export * from './validate/index.ts';
export type { WorkspaceTrust } from './ports.ts';
export {
  REPOSITORY_ORIGINS,
  REPOSITORY_REASONS,
  decideRepositoryPlugin,
  isRepositorySupplied,
  repositoryCauses,
} from './repository-trust.ts';
export type {
  RepositoryDecision,
  RepositoryOrigin,
  RepositoryPluginFacts,
  RepositoryReason,
  RepositorySource,
} from './repository-trust.ts';
export type { SkillsDirBlock } from './repository-types.ts';
export {
  COMPONENT_LIMITS,
  limitRepositoryPlugin,
  loadRepositoryPlugin,
  repositoryLoadInput,
} from './repository-limits.ts';
export type { ComponentLimit, Limited } from './repository-limits.ts';
export {
  BUNDLES_NOT_LOADED,
  MONITORS_NOT_LOADED,
  WORKTREE_NOTE,
  explainRepositoryPlugin,
} from './repository-messages.ts';
export type { RepositoryExplanation } from './repository-messages.ts';
export {
  CONTENT_GATES,
  PROJECT_PERMISSION_ENTRIES,
  REPOSITORY_CONTENT,
  TRUST_SITUATIONS,
  contentGate,
  projectEntryApplies,
  trustDialogListing,
  trustSituation,
} from './trust-gates.ts';
export type {
  Consent,
  ContentGate,
  ProjectPermissionEntry,
  RepositoryContent,
  TrustSituation,
  TrustSituationFacts,
} from './trust-gates.ts';
export {
  manualTrustEntry,
  settingsHooksMayRun,
  workspaceTrustKey,
  workspaceTrustState,
} from './workspace-trust.ts';
export type { TrustFacts, TrustKey, WorkspaceTrustState } from './workspace-trust.ts';
export { LOCAL_TRUST, localSettingsVerdict } from './local-settings-trust.ts';
export type {
  LocalSettingsFacts,
  LocalSettingsVerdict,
  LocalTrust,
} from './local-settings-trust.ts';
export {
  FOLDER_ORIGINS,
  probeFolder,
  skillsDirCommands,
  skillsDirPluginEnabled,
} from './folder-plugin.ts';
export type { FolderOrigin, FolderPlugin, FolderProbe, SkillsDirFolder } from './folder-plugin.ts';
export { SCAFFOLD_SCOPES, planPluginScaffold } from './plugin-scaffold.ts';
export type {
  ScaffoldFile,
  ScaffoldInput,
  ScaffoldPlan,
  ScaffoldScope,
} from './plugin-scaffold.ts';
export { COMPONENT_CHECKS, pluginDebugSteps } from './plugin-debug.ts';
export type { DebugFacts, DebugPlace, DebugStep } from './plugin-debug.ts';
