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
export {
  isRemoteMcpServer,
  MCP_TRANSPORTS,
  readMcpConfig,
  readMcpServer,
  type HttpMcpServer,
  type McpConfigRead,
  type McpServerRead,
  type McpTransport,
  type PluginMcpServer,
  type RemoteMcpServer,
  type SseMcpServer,
  type WsMcpServer,
} from './format/mcp-config.ts';
export {
  classifyMcpSource,
  collectMcpServers,
  MCP_SOURCE_KINDS,
  MCPB_CACHE_DIR,
  type CollectedMcpServers,
  type CollectOptions,
  type McpSource,
  type McpSourceKind,
} from './format/mcp-sources.ts';
export type { McpLoadContext } from './format/mcp-bundles.ts';
export {
  LSP_FIELDS,
  LSP_TRANSPORTS,
  mergeLspSources,
  readLspConfig,
  readLspServer,
  type LspConfigRead,
  type LspServer,
  type LspServerRead,
  type LspTransport,
} from './format/lsp-config.ts';
export {
  parseMonitorTrigger,
  readMonitor,
  readMonitors,
  type Monitor,
  type MonitorRead,
  type MonitorsRead,
  type MonitorTrigger,
} from './format/monitors.ts';
export * from './rules/index.ts';
export * from './agents/index.ts';
export * from './skills/index.ts';
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
export * from './host/index.ts';
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
  COMBINE_MODES,
  COMPONENT_KINDS,
  STANDARD_LAYOUT,
  declaredKey,
  type CombineMode,
  type ComponentKind,
  type LayoutEntry,
  type ManifestKey,
} from './format/layout.ts';
export { defaultFolderIgnored, pathEscapes, pathNotFound } from './format/messages.ts';
export {
  hasAppliedSettings,
  readPluginSettings,
  type PluginSettings,
  type PluginSettingsRead,
} from './format/plugin-settings.ts';
export * from './format/theme.ts';
export * from './format/theme-color.ts';
export * from './format/theme-tokens.ts';
export * from './format/theme-write.ts';
export * from './format/workflow-meta.ts';
export * from './format/workflow-meta-rewrite.ts';
export * from './format/workflow-script.ts';
export * from './agents/workflow/index.ts';
export * from './agents/catalog/index.ts';
