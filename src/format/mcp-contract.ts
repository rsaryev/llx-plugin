/**
 * The MCP contracts the kit states as pure data (docs/API.md, "MCP contracts"): OAuth settings, `claude mcp add`
 * and `add-json`, tool names, hints and schemas, result limits, prompts, the environment knobs,
 * reloads and the redaction of a plugin server. One barrel so `src/index.ts` stays within its budget.
 */
export {
  mcpAuthRejection,
  mcpOAuthDiscovery,
  mcpOAuthRedirectUri,
  planMcpOAuth,
  readMcpOAuth,
  requestedOAuthScopes,
  storedTokenRecovery,
  type McpAuthRejectionInput,
  type McpAuthState,
  type McpOAuthConfig,
  type McpOAuthDiscovery,
  type McpOAuthMetadata,
  type McpOAuthPlan,
  type McpOAuthRead,
  type StoredTokenRecovery,
} from './mcp-oauth.ts';
export {
  MCP_ADD_SCOPES,
  mcpAddKey,
  mcpServerExistsMessage,
  readMcpAddJson,
  type McpAddOptions,
  type McpAddRead,
  type McpAddScope,
  type McpSecretRequest,
} from './mcp-add-json.ts';
export { readMcpAdd } from './mcp-add.ts';
export {
  MCP_RESULT_SIZE_CEILING,
  MCP_TOOL_NAME_LIMIT,
  mcpPromptToolAnswer,
  modelVisibleMcpTool,
  mcpToolSendCheck,
  permissionPromptToolNotFound,
  readMcpToolHints,
  requiringInteraction,
  type McpPromptToolAnswer,
  type McpSendCheck,
  type McpToolHints,
} from './mcp-tool.ts';
export {
  excludedToolsNotice,
  prepareMcpTool,
  refusedSchemaFallback,
  type McpListedTool,
  type McpToolDeclaration,
  type McpToolPolicy,
  type McpToolPreparation,
} from './mcp-tool-schema.ts';
export {
  boundedMcpErrorText,
  imageResultNote,
  limitMcpResult,
  mcpImageFiles,
  mcpOutputLimits,
  oversizedMcpMessage,
  persistedResultMessage,
  type McpImageFile,
  type McpOutputLimits,
  type McpOversize,
  type McpResultVerdict,
} from './mcp-output.ts';
export {
  listablePrompts,
  mcpPromptCommand,
  mcpPromptListing,
  readMcpPromptInvocation,
  type McpPromptDefinition,
  type McpPromptInvocation,
  type McpPromptRead,
} from './mcp-prompts.ts';
export {
  claudeAiConnectorsFetched,
  cutMcpDescription,
  MCP_ENV_BASELINE,
  mcpConnectTimeoutMs,
  mcpDescriptionLimits,
  mcpStdioEnvironment,
  mcpTimeouts,
  type McpDescriptionLimits,
  type McpStdioEnvironmentInput,
  type McpTimeoutServer,
  type McpTimeouts,
} from './mcp-knobs.ts';
export {
  MCP_FAILURE_SKIP_MS,
  planMcpReload,
  skipsStdioConnection,
  SKIPPING_CONNECTION,
  type McpConnectionFailure,
  type McpReloadPlan,
} from './mcp-reload.ts';
export { redactPluginServer, type RedactedPluginServer } from './mcp-plugin-display.ts';
export { droppedServerLogLine } from './mcp-config.ts';
export { configFlagApplies, readConfigFlag, type ConfigFlag } from './mcp-bundles.ts';
export {
  mcpBackgrounding,
  mcpCacheDiscardedAfterFailures,
  mcpCacheEntryUse,
  mcpClientSettings,
  mcpConnectionBatches,
  mcpDiscoveryCache,
  mcpFirstTurnWaitMs,
  mcpStartupWaitsFor,
  type McpBackgrounding,
  type McpCacheUse,
  type McpClientRuntime,
  type McpClientSettings,
  type McpConnectionBatches,
  type McpDiscoveryCache,
  type McpFirstTurnServer,
  type McpProtocolNegotiation,
  type McpStartupRun,
  type McpStartupServer,
} from './mcp-startup.ts';
export {
  bundleServerOf,
  bundleSettingKey,
  missingBundleSettings,
  readMcpbManifest,
  readMcpbOptions,
  requiredBundleSettings,
  type McpbManifest,
  type McpbRead,
  type McpbVariables,
} from './mcpb-manifest.ts';
