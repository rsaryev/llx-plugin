/**
 * @rsaryev/claude-plugin-kit — add Claude Code plugin support to any agent (docs/API.md).
 *
 * Claude Code's own shapes are re-exported from the official Agent SDK types; the kit adds the
 * runtime that reads and runs plugins through ports the host implements.
 */
export * from './format/index.ts';
export { EFFORT_LEVELS } from './protocol/effort.ts';
export { HOOK_EVENTS } from './protocol/hook-events.ts';
export type {
  EventWithSpecificOutput,
  HookInputOf,
  HookSpecificOutput,
  HookSpecificOutputOf,
} from './protocol/hook-events.ts';
export { HOOK_HANDLER_TYPES } from './protocol/hook-config.ts';
export type {
  HookHandler,
  HookHandlerOf,
  HookHandlerType,
  HookMatcherGroup,
  HooksSettings,
} from './protocol/hook-config.ts';
export type * from './protocol/official.ts';
export type * from './ports/index.ts';
export * from './loading/index.ts';
export * from './rules/index.ts';
export {
  PERMISSION_BEHAVIORS,
  PERMISSION_MODES,
  normalizePermissionMode,
} from './protocol/permission-modes.ts';
export {
  DOCUMENTED_TOOLS,
  REMOVED_TOOLS,
  SDK_ONLY_TOOLS,
  type DocumentedTool,
  type RemovedTool,
  type SdkOnlyTool,
} from './protocol/tool-names.ts';
export type * from './protocol/official-tools.ts';
export * from './foundation/index.ts';
export * from './mods/index.ts';
export { MODS_API, type ModsMethod, type ModsNamespace } from './protocol/mods-api-names.ts';
export {
  API_EVENT_NAMES,
  CLASSIC_EVENT_NAMES,
  ENGINE_ORIGIN,
  HOOK_FAILURE_KINDS,
  MOD_EVENT_GROUPS,
  MOD_EVENT_NAMES,
  MOD_TIERS,
  REENTRY_CAUSES,
  STREAM_EVENTS,
  TELEMETRY_EVENTS,
  TELEMETRY_FILTER,
  WILDCARDS,
  type AnyModEventName,
  type ApiEventName,
  type ClassicEventName,
  type HookFailure,
  type HookFailureKind,
  type HookOrigin,
  type MatcherValue,
  type ModEventGroup,
  type ModEventName,
  type ModMatcher,
  type ModTier,
  type ReentryCause,
  type StreamEventName,
  type Wildcard,
} from './protocol/mods-events.ts';
export { MOD_LIMITS, MOD_NAME_PATTERN } from './protocol/mods-limits.ts';
