/** `@rsaryev/claude-plugin-kit/mods`: Mods: the hook chain, the events, the API, the interface, loading and their test kit (docs/API.md, "Mods"). */
export * from '../foundation/index.ts';
export * from '../mods/index.ts';
export * as modsTesting from '../testing/mods/index.ts';
export {
  AGENT_STATUSES,
  MODS_API,
  type AgentStatus,
  type ModsMethod,
  type ModsNamespace,
} from '../protocol/mods-api-names.ts';
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
} from '../protocol/mods-events.ts';
export { MOD_LIMITS, MOD_NAME_PATTERN } from '../protocol/mods-limits.ts';
export {
  BORDER_STYLES,
  ELEMENT_NAMES,
  ELEMENT_SURFACES,
  RENDER_SITES,
  RENDER_SITE_NAMES,
  SPACING_STEPS,
  UI_SURFACES,
  VSCODE_IGNORED,
  type BorderStyle,
  type ElementName,
  type RenderSite,
  type RenderSiteDef,
  type SpacingStep,
  type UiSurface,
} from '../protocol/mods-ui-names.ts';
