/** The host and its sessions (layer 5, docs/API.md, "Host and sessions"). */
export { createPluginHost, type HostedPlugin, type PluginHost } from './host.ts';
export type { BackgroundListener } from './background-queue.ts';
export type { PluginSession, TurnPart } from './session.ts';
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
  ExpandOptions,
  SkillInvoker,
  SkillsListing,
  SkillsOptions,
} from './session-skills.ts';
export type { ResolveOptions, SessionAgent } from './session-components.ts';
export type { HostPlugin, HostPorts, PluginHostOptions, Resolved } from './types.ts';
