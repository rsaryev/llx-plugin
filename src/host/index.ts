/** The host and its sessions (layer 5, docs/API.md, "Host and sessions"). */
export { createPluginHost, type PluginHost, type UpdateResult } from './host.ts';
export type { BackgroundListener } from './background-queue.ts';
export type { PluginSession, TurnPart } from './session.ts';
export type { ToolCheck, ToolCheckPart } from './session-tool-check.ts';
export type { SessionOptions } from './session-types.ts';
export type { TurnOptions } from './turn.ts';
export type {
  AddHooksOptions,
  HookHandle,
  HookLifetime,
  HookScope,
  ScopedHookSource,
} from './session-hook-scope.ts';
export type {
  MentionExpansion,
  MentionPart,
  MessageExpansion,
  MessageOptions,
} from './session-mentions.ts';
export {
  permissionRulesOf,
  type PermissionRuleFacts,
  type PermissionRulesOf,
} from './permission-rules.ts';
export type { HookEnvironment } from './session-hooks.ts';
export type {
  ExpandOptions,
  SkillInvoker,
  SkillsListing,
  SkillsOptions,
} from './session-skills.ts';
export type { FolderSkillSource, FolderSkillSources, SkillsReload } from './session-folders.ts';
export type { AgentsOptions, ResolveOptions, SessionAgent } from './session-components.ts';
export type { AgentOverrides, AgentsReload } from './session-agents.ts';
export type {
  HostedPlugin,
  HostPlugin,
  HostPorts,
  HostUpdate,
  PluginHostOptions,
  Resolved,
} from './types.ts';
export {
  startPermissions,
  type CommandLineRules,
  type PermissionSession,
  type PermissionSessionInput,
  type StartedPermissions,
} from './permission-session.ts';
export { savedApproval, type SavedApproval } from './saved-approval.ts';
