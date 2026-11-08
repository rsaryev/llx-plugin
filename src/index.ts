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
