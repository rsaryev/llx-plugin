/** The host and its sessions (layer 5, docs/API.md, "Host and sessions"). */
export { createPluginHost, type PluginHost, type UpdateResult } from './host.ts';
export { readCatalog, type PluginCatalog } from './catalog.ts';
export { pluginsWithDependencies } from './plugin-dependencies.ts';
export type { BackgroundListener, BackgroundSource } from './background-queue.ts';
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
  MentionOptions,
  MentionPart,
  MessageExpansion,
  MessageMentions,
  MessageOptions,
} from './session-mentions.ts';
export type { SessionSkill, SkillCatalog, SkillCatalogOptions } from './session-skill-catalog.ts';
export type { HostSource, SkillPlace, SkillSource } from './session-skill-entries.ts';
export {
  skillKeywords,
  skillPlugin,
  skillScope,
  type SkillPlugin,
  type SkillScope,
} from './session-skill-readers.ts';
export type { HostSkill } from './session-host-skills.ts';
export {
  permissionRulesOf,
  type PermissionRuleFacts,
  type PermissionRulesOf,
} from './permission-rules.ts';
export type { HookEnvironment } from './session-environment.ts';
export type { SessionDispatchOptions } from './session-hooks.ts';
export type { ExpandOptions, SkillInvoker } from './session-skill-expand.ts';
export type { PreloadedSkills, PreloadOptions } from './session-skill-preload.ts';
export type { SkillContent, SkillsListing, SkillsOptions, TouchedFile } from './session-skills.ts';
export type { WorkflowCommand } from './session-workflows.ts';
export type { MonitorPart, MonitorStart, MonitorStartOptions } from './session-monitors.ts';
export type { MonitorId, MonitorLedgerState } from './session-core.ts';
export type { FolderSkillSource, FolderSkillSources, SkillsReload } from './session-folders.ts';
export type { AgentsOptions, ResolveOptions, SessionAgent } from './session-components.ts';
export type {
  AgentOverrides,
  AgentsReload,
  DefaultsPlugin,
  SessionPluginDefaults,
} from './session-agents.ts';
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
