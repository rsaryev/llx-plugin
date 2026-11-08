/**
 * Claude Code's own types, as Anthropic publishes them in `@anthropic-ai/claude-agent-sdk`. The kit
 * never copies a shape Claude Code defines: it imports it from here, so an SDK update that changes
 * one fails the typecheck wherever the kit relies on it (docs/SPEC.md, "Official types").
 *
 * Type-only imports: the SDK's runtime starts the Claude Code program and is never loaded.
 */
export type {
  AgentDefinition,
  AgentMcpServerSpec,
  AsyncHookJSONOutput,
  BaseHookInput,
  ExitReason,
  HookEvent,
  HookInput,
  HookJSONOutput,
  McpHttpServerConfig,
  McpServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
  PermissionBehavior,
  PermissionMode,
  PermissionUpdate,
  SdkPluginConfig,
  SettingSource,
  Settings,
  SyncHookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
export type { ToolInputSchemas, ToolOutputSchemas } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
