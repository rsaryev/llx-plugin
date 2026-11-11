/**
 * @rsaryev/llx-plugin — add Claude Code plugin support to any agent (docs/API.md).
 *
 * The root holds what a host needs to run plugins: loading a plugin, the host and its sessions, the
 * permission check of a tool call, the ports the host implements and Claude Code's own types. Each
 * domain has its whole surface at a subpath (docs/API.md, "Entry points"): `./loading`, `./format`,
 * `./skills`, `./hooks`, `./rules`, `./settings`, `./marketplace`, `./agents`, `./mods`, `./cli`.
 */
export type * from './protocol/official.ts';
export type * from './protocol/official-tools.ts';
export type * from './ports/index.ts';
export * from './host/index.ts';
export { EFFORT_LEVELS, SAVED_EFFORT_LEVELS, type SavedEffortLevel } from './protocol/effort.ts';
export {
  DOCUMENTED_TOOLS,
  REMOVED_TOOLS,
  SDK_ONLY_TOOLS,
  type DocumentedTool,
  type RemovedTool,
  type SdkOnlyTool,
} from './protocol/tool-names.ts';
export {
  HOOK_EVENTS,
  type EventWithSpecificOutput,
  type HookInputOf,
  type HookSpecificOutputOf,
} from './protocol/hook-events.ts';
export {
  HOOK_HANDLER_TYPES,
  type HookHandler,
  type HookHandlerType,
  type HookMatcherGroup,
  type HooksSettings,
} from './protocol/hook-config.ts';
export {
  permissionRequestDecision,
  preToolUseHookOutcome,
  type EventFactsOf,
  type HookOutcome,
} from './hooks/index.ts';
export {
  PERMISSION_BEHAVIORS,
  PERMISSION_MODES,
  normalizePermissionMode,
} from './protocol/permission-modes.ts';
export { decide, type DecideContext, type Decision, type PreparedCall } from './rules/index.ts';
export {
  createPermissionsPolicy,
  createPolicyView,
  policyContext,
  readSettingsLayer,
  type PermissionsPolicy,
  type PolicyContext,
  type PolicyLayer,
  type PolicyScope,
  type PolicyView,
} from './settings/index.ts';
export {
  classifyPluginFolder,
  loadPlugin,
  readPluginDirectory,
  validatePlugin,
  type LoadedPlugin,
  type LoadPluginInput,
  type Plugin,
  type PluginDirectoryReading,
  type PluginFolderKind,
  type PluginTextFile,
  type ValidatePluginInput,
  type ValidationReport,
} from './loading/index.ts';
export {
  type FolderSource,
  type InvocableHead,
  type PluginIssue,
  type PluginManifest,
  type PluginSource,
  type Severity,
} from './format/index.ts';
export { listingLine } from './skills/index.ts';
/**
 * The types the host API names in its signatures (`PluginHostOptions`, `SessionOptions`,
 * `PluginSession`, `LoadPluginInput`), so a host types its loop from the root alone. Each is also
 * at its domain's subpath.
 */
export type {
  Expansion,
  FileReference,
  InvocationPolicy,
  ModelListing,
  ModelListingResult,
  OverrideState,
  ScanScope,
  SessionLimits,
  ShellPermission,
  SkillMention,
} from './skills/index.ts';
export type { PermissionRule } from './rules/index.ts';
export type {
  EnvFileStore,
  HookObserver,
  HookPorts,
  HookSourceKind,
  ModelCatalog,
  RegisteredHandler,
  SettledDeliveries,
  SubprocessKind,
} from './hooks/index.ts';
export type { ResolvedLspServer, ResolvedMcpServer, ResolvedUserConfig } from './loading/index.ts';
export type { AgentRecord, LinkRoots, Monitor, OutputStyle } from './entry/format.ts';
export type { OptionValues, ParentSettingsContext, WorkflowsContext } from './entry/settings.ts';
