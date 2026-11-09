/** `@rsaryev/claude-plugin-kit/format`: The readers of every plugin file: manifest, skills, commands, agents, output styles, themes, MCP and LSP configs, monitors, the layout (docs/API.md, "Format"). */
export * from '../format/index.ts';
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
} from '../format/mcp-config.ts';
export {
  classifyMcpSource,
  collectMcpServers,
  MCP_SOURCE_KINDS,
  MCPB_CACHE_DIR,
  type CollectedMcpServers,
  type CollectOptions,
  type McpSource,
  type McpSourceKind,
} from '../format/mcp-sources.ts';
export type { McpLoadContext } from '../format/mcp-bundles.ts';
export {
  CREDENTIAL_ENV_NAMES,
  FIXED_CREDENTIAL_NAMES,
  NOT_EXPANDED_TOWARD_REMOTE,
  credentialDebugLine,
  hasUrlPassword,
  readsAsEmptyTowardRemote,
  scrubAction,
  withoutUserinfo,
  type ScrubAction,
} from '../format/credential-env.ts';
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
} from '../format/mcp-env.ts';
export { mcpEndpointKey } from '../format/mcp-endpoint.ts';
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
} from '../format/lsp-config.ts';
export {
  parseMonitorTrigger,
  readMonitor,
  readMonitors,
  type Monitor,
  type MonitorRead,
  type MonitorsRead,
  type MonitorTrigger,
} from '../format/monitors.ts';
export {
  readOutputStyle,
  type OutputStyle,
  type OutputStyleContext,
  type OutputStyleRead,
} from '../format/output-style.ts';
export { readSkill, type SkillRead } from '../format/skill.ts';
export { resolveSkillName, type SkillName } from '../format/skill-name.ts';
export {
  readCommand,
  readCommandEntry,
  type CommandEntryContext,
  type CommandLayout,
  type CommandRead,
} from '../format/command.ts';
export {
  FIELD_READERS,
  SKILL_FIELDS,
  escapeAngleBrackets,
  firstContentLine,
  readInvocable,
  readSkillFields,
  type InvocableRead,
  type SkillField,
} from '../format/skill-fields.ts';
export type { FieldOutcome, FieldReader, SkillFieldValues } from '../format/skill-field-readers.ts';
export {
  ORIGIN_TRAITS,
  SKILL_SHELLS,
  type BodyReader,
  type Command,
  type CommandHead,
  type InvocableFrontmatter,
  type InvocableHead,
  type OriginTraits,
  type Skill,
  type SkillHead,
  type SkillLayout,
  type SkillOrigin,
  type SkillOriginKind,
  type SkillShell,
} from '../format/skill-types.ts';
export {
  COMBINE_MODES,
  COMPONENT_KINDS,
  STANDARD_LAYOUT,
  declaredKey,
  type CombineMode,
  type ComponentKind,
  type LayoutEntry,
  type ManifestKey,
} from '../format/layout.ts';
export { defaultFolderIgnored, pathEscapes, pathNotFound } from '../format/messages.ts';
export {
  hasAppliedSettings,
  readPluginSettings,
  type PluginSettings,
  type PluginSettingsRead,
} from '../format/plugin-settings.ts';
export * from '../format/mcp-contract.ts';
// Keep the existing file reader unambiguous; settings exposes its reader in general/.
export { readAgent } from '../format/agent.ts';
export * from '../format/theme.ts';
export * from '../format/theme-color.ts';
export * from '../format/theme-tokens.ts';
export * from '../format/theme-write.ts';
export { readTheme } from '../format/theme.ts';
