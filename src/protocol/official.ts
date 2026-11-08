/**
 * Claude Code's own types, as Anthropic publishes them in `@anthropic-ai/claude-agent-sdk`. The kit
 * never copies a shape Claude Code defines: it imports it from here, so an SDK update that changes
 * one fails the typecheck wherever the kit relies on it (docs/SPEC.md, "Official types").
 *
 * Type-only imports: the SDK's runtime starts the Claude Code program and is never loaded.
 */
import type { Settings } from '@anthropic-ai/claude-agent-sdk';

export type {
  AgentDefinition,
  AgentMcpServerSpec,
  AsyncHookJSONOutput,
  BaseHookInput,
  EffortLevel,
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
  ResolvedSettingSource,
  SdkPluginConfig,
  SettingSource,
  Settings,
  SlashCommand,
  SyncHookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
export type { ToolInputSchemas, ToolOutputSchemas } from '@anthropic-ai/claude-agent-sdk/sdk-tools';

/** The members of a union that name their fields, not an open `{ [key: string]: unknown }`. */
type Declared<T> = T extends unknown ? (string extends keyof T ? never : T) : never;

/**
 * One saved `userConfig` option value, as the SDK types `Settings.pluginConfigs[id].options[key]`
 * (a string, number, boolean or list of strings).
 */
export type UserConfigValue = NonNullable<
  Declared<NonNullable<Settings['pluginConfigs']>[string]>['options']
>[string];

/**
 * One marketplace source object, as the SDK types the entries of `strictKnownMarketplaces`
 * (`github`, `git`, `url`, `hostPattern`, `skills-dir`…); `blockedMarketplaces` and
 * `extraKnownMarketplaces` use the same forms.
 */
export type MarketplaceSource = NonNullable<Settings['strictKnownMarketplaces']>[number];

/** The provenance an Agent SDK application stamps on a user message (`{ kind: 'human' }` for keyboard input). */
export type { SDKMessageOrigin } from '@anthropic-ai/claude-agent-sdk';
