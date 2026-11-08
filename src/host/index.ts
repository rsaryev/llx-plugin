/** The host and its sessions (layer 5, docs/API.md, "Host and sessions"). */
export { createPluginHost, type HostedPlugin, type PluginHost } from './host.ts';
export {
  permissionRulesOf,
  type PermissionRuleFacts,
  type PermissionRulesOf,
} from './permission-rules.ts';
export type { PluginSession } from './session.ts';
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
  HostPlugin,
  HostPorts,
  PluginHostOptions,
  Resolved,
  SessionOptions,
} from './types.ts';
