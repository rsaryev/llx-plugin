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
  type ScopedCommand as CliScopedCommand,
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
  type EnabledEntry,
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
export { SKIP_MODES, skippedBy, type SkipMode } from './flags/customizations.ts';
export { MCP_READ_SOURCES, mcpSourcesRead, type McpReadSource } from './flags/mcp.ts';
export { managedPolicyUnderSafeMode } from './flags/modes.ts';
export { pluginFoldersOf } from './flags/plugins.ts';

export { SIDELOAD_FLAGS } from './flags/sideload.ts';
export {
  CUSTOMIZATIONS,
  FLAG_NAMES,
  type Customization,
  type FileFact,
  type FlagArguments,
  type FlagFacts,
  type FlagName,
  type GivenFlags,
  type McpConfigSource,
  type SessionChannel,
  type SessionPlan,
  type SessionPluginRequest,
} from './flags/types.ts';

export {
  SAVED_KEPT_UNREADABLE,
  uninstallRetention,
  type DataKeptBecause,
  type Retention,
  type RetentionFacts,
} from './uninstall-data.ts';
export {
  concludeUninstall,
  dataPreservedMark,
  startUninstall,
  type AfterRemoval,
  type Cleanup,
  type PruneStep,
  type UninstallArguments,
  type UninstallConclusion,
  type UninstallFacts,
  type UninstallStart,
} from './uninstall-plan.ts';
export {
  answerPrune,
  planPruneCommand,
  type PruneArguments,
  type PruneFacts,
  type PrunePlan,
  type PruneQuestion,
} from './prune-plan.ts';
export type { ToggleArguments, ToggleFacts } from './toggle-target.ts';
export { planEnable, type EnabledWrite, type TogglePlan } from './enable-plan.ts';
export { planDisable, type DisableArguments } from './disable-plan.ts';
export {
  planConfigure,
  type ConfigureArguments,
  type ConfigureFacts,
  type ConfigurePlan,
  type ConfigurablePlugin,
  type SavedValues,
} from './configure-plan.ts';
export {
  checkGiven,
  unsetKeys,
  type CheckedInput,
  type ConfigProblem,
  type DeclaredOptions,
} from './user-config-input.ts';
export {
  decideAcceptance,
  digestOf,
  exclusiveAcceptFlags,
  type CommandAcceptance,
  type AcceptanceFlags,
  type AcceptanceRequest,
  type CommandOrigin,
  type DisplayedCommand,
  type ShownCommand,
} from './command-acceptance.ts';
export {
  applyConfig,
  notYetSetLine,
  type ConfigOutcome,
  type InstallOptions,
} from './install-config.ts';
export {
  startInstall,
  type InstallArguments,
  type InstallContext,
  type InstallStart as CliInstallStart,
  type PendingInstall,
} from './install-start.ts';
export {
  planInstall,
  type InstallEffects,
  type InstallFound,
  type InstallRun,
} from './install-plan.ts';
export {
  concludeRetry,
  planPluginUpdate,
  type RetryRequest,
  type UpdateEffects,
  type UpdateRun,
} from './update-plan.ts';
export type {
  DependencyInstallState,
  UpdatableInstall,
  PluginUpdateArguments,
  PluginUpdateFacts,
} from './update-facts.ts';
export {
  planPluginTag,
  finishPluginTag,
  type TagFacts,
  type TagOptions,
  type TagPlan,
  type TagCommand,
} from './tag-plan.ts';
export {
  configurationDialog,
  type ConfigurationDialog,
  type ConfigurationEvent,
} from './configure-dialog.ts';
export {
  unexpectedValidationError,
  manifestFileKind,
  validationJson,
  type ValidationAdvice,
  type ValidationFileResult,
  type ValidationJson,
} from './validate-run.ts';
export {
  adviceNeedsSource,
  readmeAdvice,
  renderAdvice,
  sourceFromOrigin,
} from './validate-advice.ts';
export {
  planPluginList,
  type AvailablePlugin,
  type DataSize,
  type ListedPlugin,
} from './plugin-list.ts';
export { planPluginDetails, type ComponentCost, type PluginDetails } from './plugin-details.ts';
export {
  afterCleanRun,
  cleanLaunch,
  cleanLaunchCommands,
  type CleanLaunch,
  type CleanOutcome,
  type CleanShell,
} from './clean-configuration.ts';
