/** The settings beyond the policy keys: merge, managed exceptions, files, edits and session overrides. */
export { readClaudeJson, type ClaudeJsonFacts, type ClaudeJsonOutcome } from './claude-json.ts';
export {
  editEffect,
  loadsFileCreatedMidSession,
  managedChangeAdvice,
  type Applies,
  type Arrival,
  type EditEffect,
  type ManagedChangeAdvice,
  type ManagedChangeFacts,
  type SettingsEdit,
} from './edit-effect.ts';
export {
  capEffort,
  effectiveCap,
  effortLevelFor,
  type ModelEffort,
  type ModelEffortFacts,
} from './effort.ts';
export {
  FILE_ORIGINS,
  LOCAL_FILE_IGNORE_ENTRY,
  WRITE_TARGET,
  WRITE_TRIGGERS,
  configDirOf,
  globalGitExcludesFile,
  localSettingsFiles,
  localSettingsRoot,
  projectSettingsFile,
  shouldAddGitExclude,
  userSettingsFile,
  type FileFacts,
  type FileMaker,
  type FileOrigin,
  type FirstWriteFacts,
  type GitExcludeFacts,
  type LocalPlacementFacts,
  type RepositoryFacts,
  type WriteTrigger,
} from './file-locations.ts';
export {
  GENERAL_KEYS,
  type GeneralKey,
  type GeneralValues,
  type SettingsKey,
  type ValueOf,
} from './keys.ts';
export {
  permissionRuleLists,
  type AddedDirectory,
  type LocalFileFacts,
  type PermissionRuleLists,
  type RuleEntry,
  type ScopeTrust,
} from './permission-rules.ts';
export { reachOf, type FileScope, type Reach, type ReachFacts } from './reach.ts';
export {
  SESSION_OVERRIDES,
  resolveSessionValue,
  type OverriddenKey,
  type OverrideSource,
  type SessionInput,
  type SessionValue,
} from './session-overrides.ts';
export { createGeneralView, type GeneralView } from './view.ts';

export {
  readAgent,
  agentViewDisabled,
  AGENT_VIEW_ENV,
  type AgentViewDecision,
} from './agent-keys.ts';
export {
  readTheme,
  readTeammateMode,
  readOutputStyle,
  parseTheme,
  THEME_PRESETS,
  TEAMMATE_MODES,
  type ThemeChoice,
  type ThemePreset,
  type TeammateMode,
} from './look-and-feel.ts';
export {
  readProcessWrapper,
  parseLauncher,
  PROCESS_WRAPPER_ENV,
  type LauncherRead,
} from './process-wrapper.ts';
export {
  readWorktree,
  baseRefTarget,
  backgroundEditsBlocked,
  worktreeFolder,
  WORKTREE_CONSUMERS,
  type WorktreeSettings,
  type BaseRefTarget,
  type BaseRefFacts,
  type BackgroundEditFacts,
  type WorktreeConsumer,
  type WorktreeFolderFacts,
} from './worktree-block.ts';
export { COMMAND_LINE_KEYS, readCommandLine } from './command-lines.ts';
export { pluginDefaultsOf, valueWithPluginDefaults } from './plugin-defaults.ts';
