/** Claude Code's plugin format: reading and validating what a plugin folder holds. */
export { SEVERITIES, type PluginIssue, type Severity } from './issues.ts';
export { readManifest, validateManifest, type ManifestResult } from './manifest.ts';
export type { ValidationIssue } from './validate/finding.ts';
export type {
  CommandEntry,
  PluginChannel,
  PluginDependency,
  PluginManifest,
  UserConfigOption,
} from './manifest-schema.ts';

export { parseFrontmatter, type Frontmatter, type FrontmatterState } from './frontmatter.ts';
export {
  readMemoryRule,
  type MemoryRule,
  type MemoryRuleRead,
  type MemoryRuleScope,
} from './memory-rule.ts';
export { editFrontmatter, writeFrontmatter, type FrontmatterEdit } from './frontmatter-write.ts';
export {
  renderAgentFile,
  renderCommandFile,
  renderSkillFile,
  type AgentDraft,
  type CommandDraft,
  type InvocableDraft,
  type SkillDraft,
} from './frontmatter-render.ts';
export { readText, type FieldProblem, type FieldRead } from './frontmatter-values.ts';
export { readHooksFile, readHooksSettings, type HooksRead } from './hooks-settings.ts';
export {
  isHooksModuleName,
  isModTestFile,
  readHooksJsonModules,
  resolveTypesPath,
  type HooksModules,
} from './mod-files.ts';
export { readAgent } from './agent.ts';
export { readFlagAgents, type FlagAgentsRead } from './agent-flag.ts';
export { hookAgentType, scopedAgentName, validAgentName } from './agent-name.ts';
export type { FolderSource, PluginSource } from './component-source.ts';
export {
  AGENT_SOURCES,
  type AgentExtras,
  type AgentOrigin,
  type AgentReadResult,
  type AgentRecord,
  type AgentSource,
  type UnrecognizedField,
} from './agent-record.ts';
export {
  AGENT_COLORS,
  AGENT_FIELDS,
  AGENT_FIELD_NAMES,
  AGENT_ISOLATIONS,
  AGENT_MEMORY_SCOPES,
  PLUGIN_IGNORED_FIELDS,
  type AgentColor,
  type AgentFieldName,
  type AgentFieldSpec,
  type AgentFieldValue,
  type AgentIsolation,
  type AgentMemoryScope,
} from './agent-fields.ts';
export {
  AUTO_COMPACT_RANGE,
  type AgentCoercer,
  type AgentFieldRead,
  type CacheTtl,
} from './agent-scalars.ts';
export * from './host-errors.ts';
export {
  BUILTIN_OUTPUT_STYLES,
  DEFAULT_OUTPUT_STYLE_ID,
  findOutputStyle,
  includeCodingInstructions,
  listOutputStyles,
  resolveOutputStyle,
  type OutputStyleChoice,
  type OutputStyleRequest,
  type PromptKind,
  type StyleSelection,
} from './output-style-select.ts';
export { outputStyleSystem } from './output-style-system.ts';
export {
  MCP_TRANSPORTS,
  readMcpConfig,
  readMcpServer,
  type HttpMcpServer,
  type McpConfigRead,
  type McpServerRead,
  type McpTransport,
  type McpBundleConfig,
  type PluginMcpServer,
  type RemoteMcpServer,
  type SseMcpServer,
  type WsMcpServer,
} from './mcp-config.ts';
export {
  classifyMcpSource,
  collectMcpServers,
  MCP_SOURCE_KINDS,
  type CollectedMcpServers,
  type CollectOptions,
  type McpSource,
  type McpSourceKind,
} from './mcp-sources.ts';
export type { McpLoadContext } from './mcp-bundles.ts';
export {
  CREDENTIAL_ENV_NAMES,
  FIXED_CREDENTIAL_NAMES,
  credentialDebugLine,
  hasUrlPassword,
  readsAsEmptyTowardRemote,
  scrubAction,
  withoutUserinfo,
  type ScrubAction,
} from './credential-env.ts';
export {
  MCP_DISPLAY_SCOPES,
  displayHeaders,
  displayReference,
  expandEnvText,
  expandMcpServer,
  type DisplayedHeader,
  type EnvExpansion,
  type EnvLookup,
  type McpDisplayScope,
  type McpExpansion,
  type McpExpansionOptions,
} from './mcp-env.ts';
export { mcpEndpointKey } from './mcp-endpoint.ts';
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
} from './lsp-config.ts';
export {
  parseMonitorTrigger,
  readMonitor,
  readMonitors,
  type Monitor,
  type MonitorRead,
  type MonitorsRead,
  type MonitorTrigger,
} from './monitors.ts';
export {
  readOutputStyle,
  type OutputStyle,
  type OutputStyleContext,
  type OutputStyleRead,
} from './output-style.ts';
export { readSkill, type SkillRead } from './skill.ts';
export { type BundledSkillHead } from './bundled-skill.ts';
export { resolveSkillName, type SkillName } from './skill-name.ts';
export {
  readCommand,
  readCommandEntry,
  type CommandEntryContext,
  type CommandLayout,
  type CommandRead,
} from './command.ts';
export {
  FIELD_READERS,
  SKILL_FIELDS,
  escapeAngleBrackets,
  type SkillField,
} from './skill-fields.ts';
export type { FieldOutcome, FieldReader, SkillFieldValues } from './skill-field-readers.ts';
export {
  SKILL_SHELLS,
  type BodyReader,
  type Command,
  type CommandHead,
  type InvocableFrontmatter,
  type InvocableHead,
  type Skill,
  type SkillHead,
  type SkillLayout,
  type SkillOrigin,
  type SkillShell,
} from './skill-types.ts';

export {
  hasAppliedSettings,
  readPluginSettings,
  type PluginSettings,
  type PluginSettingsRead,
} from './plugin-settings.ts';
export * from './mcp-contract.ts';
export type { LinkRoots } from './path-escape.ts';
