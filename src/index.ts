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
export * from './agents/index.ts';
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
export * from './hooks/index.ts';
export * from './foundation/index.ts';
export * from './mods/index.ts';
// The mods test kit and its fakes; the host's `claude-code/testing` module is bound to `createTestKit()`.
export * as modsTesting from './testing/mods/index.ts';
export {
  AGENT_STATUSES,
  MODS_API,
  type AgentStatus,
  type ModsMethod,
  type ModsNamespace,
} from './protocol/mods-api-names.ts';
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
export {
  BORDER_STYLES,
  ELEMENT_NAMES,
  ELEMENT_SURFACES,
  RENDER_SITES,
  RENDER_SITE_NAMES,
  SPACING_STEPS,
  SURFACES,
  VSCODE_IGNORED,
  type BorderStyle,
  type ElementName,
  type RenderSite,
  type RenderSiteDef,
  type SpacingStep,
  type Surface,
} from './protocol/mods-ui-names.ts';
export * from './format/marketplace/index.ts';
export * from './marketplace/index.ts';
export {
  MARKETPLACE_KEY_ALIASES,
  MARKETPLACE_SOURCE_KINDS,
  PLUGIN_ONLY_SURFACES,
  POLICY_KEYS,
  SKILL_OVERRIDE_STATES,
  WORKFLOW_SIZES,
  type PluginOnlySurface,
  type PolicyKey,
} from './protocol/settings-keys.ts';
export * from './settings/index.ts';
export * from './settings/plugins/index.ts';
export * from './settings/marketplaces/index.ts';
export * from './settings/hooks/index.ts';
export * from './settings/skills/index.ts';
export * from './settings/workflows/index.ts';
export * from './settings/channels/index.ts';
export * from './settings/customization/index.ts';
export {
  readOutputStyle,
  type OutputStyle,
  type OutputStyleContext,
  type OutputStyleRead,
} from './format/output-style.ts';
export {
  BUILTIN_OUTPUT_STYLES,
  DEFAULT_OUTPUT_STYLE_ID,
  includeCodingInstructions,
  listOutputStyles,
  resolveOutputStyle,
  type OutputStyleChoice,
  type OutputStyleRequest,
  type PromptKind,
  type StyleSelection,
} from './skills/output-style-select.ts';
export { readSkill, type SkillRead } from './format/skill.ts';
export { resolveSkillName, type SkillName } from './format/skill-name.ts';
export {
  readCommand,
  readCommandEntry,
  type CommandEntryContext,
  type CommandLayout,
  type CommandRead,
} from './format/command.ts';
export {
  FIELD_READERS,
  SKILL_FIELDS,
  escapeAngleBrackets,
  firstContentLine,
  readInvocable,
  readSkillFields,
  type InvocableRead,
  type SkillField,
} from './format/skill-fields.ts';
export type { FieldOutcome, FieldReader, SkillFieldValues } from './format/skill-field-readers.ts';
export {
  ORIGIN_TRAITS,
  SKILL_SHELLS,
  type Command,
  type InvocableFrontmatter,
  type OriginTraits,
  type Skill,
  type SkillLayout,
  type SkillOrigin,
  type SkillOriginKind,
  type SkillShell,
} from './format/skill-types.ts';
export {
  INVOKERS,
  OVERRIDE_STATES,
  checkInvocation,
  invocationPolicy,
  overrideState,
  type DenialReason,
  type InvocationPolicy,
  type InvocationVerdict,
  type Invocable,
  type Invoker,
  type ModelListing,
  type OverrideState,
  type SkillOverrides,
} from './skills/invocation.ts';
export { loadCommandEntries, type CommandEntriesLoaded } from './skills/command-entries.ts';
export { readSkillMentions, type SkillMention } from './skills/mention.ts';
export {
  listingLine,
  menuEntries,
  modelListing,
  type ListingBudget,
  type ListingEntry,
  type ListingOptions,
  type MenuOptions,
  type ModelListingResult,
} from './skills/listing.ts';
export { skillActivatesFor, type PathGateOptions } from './skills/path-gate.ts';
export {
  readExecutionEnvironment,
  resolveExecution,
  resolveShell,
  resolveTurnOverrides,
  type EffortChoice,
  type Execution,
  type ExecutionContext,
  type ExecutionEnvironment,
  type ModelAvailability,
  type ModelKept,
  type ShellAvailability,
  type ShellResolution,
  type Trigger,
  type TurnOverrides,
  type TurnSession,
  type WaitReason,
} from './skills/execution.ts';
export { parseArguments } from './skills/arguments.ts';
export {
  substitute,
  substituteArguments,
  type ArgumentInput,
  type Substitution,
  type SubstitutionInput,
} from './skills/substitute.ts';
export {
  buildVariables,
  substituteAllowedTools,
  substituteVariables,
  type AllowedToolsSubstituted,
  type SkillSession,
  type SkillVariablePorts,
  type SkillVariables,
  type VariableSource,
  type VariablesSubstituted,
} from './skills/variables.ts';
export {
  expandSkill,
  type ExpandPolicy,
  type ExpandPorts,
  type ExpandRequest,
  type ExpandSession,
  type PluginSource,
  type Expansion,
  type SessionLimits,
  type ShellCall,
  type ShellPermission,
} from './skills/expand.ts';
export {
  admitSkillHooks,
  countSkillHooks,
  hookSourceOf,
  NO_HOOKS_YET,
  SKILL_HOOK_LIMITS,
  type HooksAdmission,
  type HookUsage,
} from './skills/hook-limits.ts';
