/**
 * The plugin and marketplace commands, and the session flags, as plans over ports (docs/API.md,
 * "CLI"). The kit has no CLI of its own: a command is a decision whose observable outcome (the
 * line, the exit code, the JSON object, what to write and delete) a host carries out.
 */
export {
  COMMAND_OUTCOMES,
  MARKETPLACE_COMMANDS,
  commandFailed,
  commandSucceeded,
  marketplaceFailure,
  marketplaceSuccess,
  noResultLine,
  renderCommand,
  unexpectedError,
  usageError,
  type CommandOutcome,
  type CommandOutput,
  type PluginCommandResult,
  type ExitCode,
  type MarketplaceCommand,
  type RenderOptions,
  type Rendered,
  type ResultFields,
  type UsageError,
} from './result.ts';
export {
  CONFIG_SCOPES,
  SCOPED_COMMANDS,
  chooseScope,
  detectScope,
  scopeFlagSpelling,
  writeScope,
  type CommandScope,
  type ConfigScope,
  type DefaultedCommand,
  type ScopeChoice,
  type ScopeWrite,
  type ScopedCommand,
} from './scope.ts';
export {
  COMMAND_HANDLINGS,
  COMMAND_TABLE,
  MARKETPLACE_SUBCOMMANDS,
  MCP_SUBCOMMANDS,
  PLUGIN_SUBCOMMANDS,
  resolveCommand,
  type CommandHandling,
  type CommandName,
  type CommandRow,
  type MarketplaceSubcommand,
  type McpSubcommand,
  type PluginSubcommand,
  type ResolvedCommand,
} from './command-table.ts';
export {
  RESERVED_QUIET_NAME,
  concludeMarketplaceAdd,
  startMarketplaceAdd,
  type AddArguments,
  type AddConclusion,
  type AddFetched,
  type AddStart,
  type PendingAdd,
} from './marketplace-add.ts';
export {
  planMarketplaceList,
  type ClaudeAiListing,
  type ClaudeAiSource,
  type ConfiguredMarketplace,
  type ListPlan,
  type ListRequest,
  type ListedJson,
  type ListedSource,
} from './marketplace-list.ts';
export {
  planMarketplaceRemove,
  type InstalledFromMarketplace,
  type PluginRemoval,
  type RemoveArguments,
  type RemoveFacts,
  type RemovePlan,
} from './marketplace-remove.ts';
export {
  planMarketplaceUpdate,
  type MarketplaceUpdatePlan,
  type RefreshTarget,
  type RegisteredForUpdate,
  type UpdateArguments,
  type UpdateFacts,
} from './marketplace-update.ts';
export { planSessionFlags, startupRefusal } from './session-flags.ts';
export { ADD_DIR_CONFIGURATION, addDirLoads, type AddDirConfiguration } from './flags/add-dir.ts';
export { sessionAgent } from './flags/agents.ts';
export {
  SKIP_MODES,
  skippedBy,
  MANAGED_UNDER_SAFE_MODE,
  type SkipMode,
} from './flags/customizations.ts';
export {
  DEFAULT_MCP_TIMEOUT_MS,
  MCP_READ_SOURCES,
  mcpSourcesRead,
  type McpReadSource,
} from './flags/mcp.ts';
export { managedPolicyUnderSafeMode } from './flags/modes.ts';
export { pluginFoldersOf } from './flags/plugins.ts';
export { SETTINGS_FILE_LIMIT } from './flags/settings.ts';
export { SIDELOAD_FLAGS, sideloadMessage } from './flags/sideload.ts';
export {
  CUSTOMIZATIONS,
  FLAG_NAMES,
  type Contribution,
  type Customization,
  type FileFact,
  type FlagArguments,
  type FlagContext,
  type FlagFacts,
  type FlagName,
  type GivenFlags,
  type McpConfigSource,
  type SessionChannel,
  type SessionPlan,
  type SessionPluginRequest,
} from './flags/types.ts';
