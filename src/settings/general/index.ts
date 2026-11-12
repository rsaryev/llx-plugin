/** The settings beyond the policy keys: merge, managed exceptions, files, edits and session overrides. */
export { readClaudeJson, type ClaudeJsonFacts, type ClaudeJsonOutcome } from './claude-json.ts';
export { configDirectoryOf, globalConfigFileOf } from '../../format/config-directory.ts';
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
export {
  FILE_SCOPES,
  isFileScope,
  reachOf,
  type FileScope,
  type Reach,
  type ReachFacts,
} from './reach.ts';
export {
  SESSION_OVERRIDES,
  resolveSessionValue,
  type OverriddenKey,
  type OverrideSource,
  type SessionInput,
  type SessionValue,
} from './session-overrides.ts';
export { createGeneralView, type GeneralView } from './view.ts';

export { readAgentSetting, agentViewDisabled, type AgentViewDecision } from './agent-keys.ts';
export {
  readThemeSetting,
  readTeammateMode,
  readOutputStyleSetting,
  THEME_PRESETS,
  TEAMMATE_MODES,
  type ThemeChoice,
  type ThemePreset,
  type TeammateMode,
} from './look-and-feel.ts';
export { readProcessWrapper, type LauncherRead } from './process-wrapper.ts';
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
export {
  COMMAND_LINE_KEYS,
  readCommandLine,
  readSubagentStatusLine,
  type SubagentLineRead,
} from './command-lines.ts';
export {
  readSubagentStatusRows,
  runSubagentStatusLine,
  subagentStatusLineInput,
  type SubagentStatusLineInput,
  type SubagentStatusLineRun,
  type SubagentStatusTask,
} from './subagent-status-line.ts';
export { type PluginDefaults, type PluginWithDefaults } from './plugin-defaults.ts';
