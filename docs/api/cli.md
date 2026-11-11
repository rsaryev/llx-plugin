# `@rsaryev/llx-plugin/cli`

The `claude plugin` command line: parsing, planning and the result of each command.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `AcceptanceFlags` | type | The `flags` field of `AcceptanceRequest`; The `flags` argument of `exclusiveAcceptFlags` |
| `AcceptanceRequest` | type | The `request` argument of `decideAcceptance` |
| `ADD_DIR_CONFIGURATION` | constant | The configuration types loaded from an `--add-dir` directory |
| `AddArguments` | type | `claude plugin marketplace add <source>` as two decisions around the host's fetch |
| `AddConclusion` | type | What `concludeMarketplaceAdd` returns |
| `AddDirConfiguration` | type | One of `ADD_DIR_CONFIGURATION` |
| `addDirLoads` | function | What an `--add-dir` directory loads, given the facts of the session |
| `AddFetched` | type | What the host's fetch found |
| `AddStart` | type | What `startMarketplaceAdd` returns |
| `adviceNeedsSource` | function | Whether an advice line still holds the placeholder, so pasting it does not clear the advice |
| `afterCleanRun` | function | The cause is in your user or project configuration, so copy `~/.claude.json` and the files in `~/.claude` into the clean directory one at a time |
| `AfterRemoval` | type | What the host found after switching the plugin off and removing its record |
| `answerPrune` | function | The plan once the user has answered `Remove? [y/N]`; a plan that asked nothing is returned as it is |
| `applyConfig` | function | What the `--config` values do to an install |
| `AvailablePlugin` | type | A plugin a marketplace offers that is not installed |
| `CheckedInput` | type | What `checkGiven` returns |
| `checkGiven` | function | Each given `key` → text against the declared options; undeclared keys and failing values are problems |
| `chooseScope` | function | The scope `command` works on: the flag's value, or what the command does without it |
| `ClaudeAiListing` | type | A marketplace claude.ai lists for the account that is not added yet |
| `ClaudeAiSource` | type | A marketplace hosted on claude.ai has no local clone |
| `cleanLaunch` | function | The launch for a home directory: `~/claude-clean/empty` and `~/claude-clean/config` |
| `CleanLaunch` | type | The recipe of debug-your-config.md, "Test against a clean configuration" |
| `cleanLaunchCommands` | function | The commands that create an empty folder and launch Claude Code with a clean configuration, per shell |
| `CleanOutcome` | type | What reproducing the problem in the clean session means |
| `CleanShell` | type | The documented commands, per shell |
| `Cleanup` | type | State the host deletes for one uninstalled plugin: only what the retention rules let go |
| `CliInstallStart` | type | What `planInstallStart` returns; What `startInstall` returns |
| `CliScopedCommand` | type | One of `SCOPED_COMMANDS` |
| `COMMAND_HANDLINGS` | constant | How the kit handles a `claude plugin` command: planned here, or delegated to the host |
| `COMMAND_OUTCOMES` | constant | What a `claude plugin` command reports: the human line, the exit code and, with `--json`, one object on the last line of stdout |
| `COMMAND_TABLE` | constant | Every command with its aliases; a name added to a union above fails the typecheck until it has a row |
| `CommandAcceptance` | type | What `decideAcceptance` returns |
| `commandFailed` | function | The output of a command that failed, with its message and extra fields |
| `CommandHandling` | type | One of `COMMAND_HANDLINGS` |
| `CommandName` | type | The `command` field of `ResolvedCommand` |
| `CommandOrigin` | type | What the entry asks Claude Code to run |
| `CommandOutcome` | type | One of `COMMAND_OUTCOMES` |
| `CommandOutput` | type | What a command ends with |
| `CommandRow` | type | One row of the command table: aliases, handling and how unknown words are read |
| `CommandScope` | type | `update` also takes `managed`, the one scope that can be updated but not installed to |
| `commandSucceeded` | function | The output of a command that succeeded, with its message and extra fields |
| `ComponentCost` | type | One component row of `claude plugin details`: its kind, name and projected token cost |
| `concludeMarketplaceAdd` | function | What the add ends with once the marketplace is fetched |
| `concludeRetry` | function | The result once the host has retried the dependency install: the failure fails the command, the success leaves the latest-version line |
| `concludeUninstall` | function | What the command prints and which state goes, once the host has switched the plugin off and removed its record |
| `CONFIG_SCOPES` | constant | The values `--scope` takes on every command that takes it |
| `ConfigOutcome` | type | What `applyConfig` returns; The `servers` field of `InstallEffects` |
| `ConfigProblem` | type | The `problems` field of `CheckedInput`; The `refused` field of `ConfigOutcome` |
| `ConfigScope` | type | One of `CONFIG_SCOPES` |
| `ConfigurablePlugin` | type | A plugin that loaded, with its declared options and what is saved for them |
| `configurationDialog` | function | Whether the configuration dialog of a plugin's `userConfig` appears, and which fields it asks |
| `ConfigurationDialog` | type | What `configurationDialog` returns |
| `ConfigurationEvent` | type | A key of `SELECTIONS` |
| `ConfigureArguments` | type | `claude plugin configure <plugin>` as a plan: the plugin's `userConfig` options and which are set, or the values piped in on stdin validated and saved |
| `ConfiguredMarketplace` | type | The `marketplaces` field of `ListRequest` |
| `ConfigureFacts` | type | The `facts` argument of `planConfigure` |
| `ConfigurePlan` | type | What `planConfigure` returns |
| `Customization` | type | One of `CUSTOMIZATIONS` |
| `CUSTOMIZATIONS` | constant | The customizations a mode can leave out (`flags/customizations.ts`) |
| `DataKeptBecause` | type | Why the data directory stayed |
| `dataPreservedMark` | function | What `/plugin` shows beside a plugin whose data directory stayed (`keptData`) |
| `DataSize` | type | What measuring a saved data directory found; absent for a missing or empty one |
| `decideAcceptance` | function | Whether the displayed command runs |
| `DeclaredOptions` | type | `userConfig` values that arrive as text from a shell: each is converted to the option's declared type and checked against it (`validateUserConfigValues` |
| `DefaultedCommand` | type | The commands that write to one scope, `user` when `--scope` is omitted |
| `DependencyInstallState` | type | The state of a cached copy's dependency install (`node_modules`): done, unfinished, or one that cannot run |
| `detectScope` | function | The scope an omitted `--scope` resolves to: "the most specific scope it's installed at... checking local, project, user, then managed" (`update`) |
| `digestOf` | function | The digest `--accept-command` names: SHA-256 of the command, the plugin and the catalog it came from (judgment: the docs do not say how it is built) |
| `DisableArguments` | type | `claude plugin disable [plugin]` as a plan |
| `DisplayedCommand` | type | The `shown` field of `AcceptanceRequest`; The `shown` argument of `digestOf` |
| `EnabledEntry` | type | One `enabledPlugins` key in one settings file |
| `EnabledWrite` | type | One `enabledPlugins` entry the host writes |
| `exclusiveAcceptFlags` | function | A flag problem, nothing is printed but the reason |
| `ExitCode` | type | `0` success, `1` failure, `2` an unexpected error (`validate` only) |
| `FileFact` | type | A file the host read for a flag: whether it is a regular file, its size and its text |
| `finishPluginTag` | function | A failed push does not undo the tag already created locally |
| `FLAG_NAMES` | constant | The shapes of the session flags: what the host parsed from the command line (`FlagArguments`) |
| `FlagArguments` | type | What each flag was given: a repeatable flag its values in order, a switch `true`, the rest the text |
| `FlagFacts` | type | The `facts` argument of `planSessionFlags` |
| `FlagName` | type | One of `FLAG_NAMES` |
| `GivenFlags` | type | The `given` argument of `planSessionFlags` |
| `InstallArguments` | type | The first half of `claude plugin install <plugin>`: what the arguments mean and what the host does before it looks the plugin up |
| `InstallContext` | type | The `context` argument of `startInstall` |
| `InstalledFromMarketplace` | type | A plugin installed from the marketplace and the scopes it is installed at |
| `InstallEffects` | type | What the host carries out for a successful install |
| `InstallFound` | type | What the host found after its `--marketplace` add and refresh |
| `InstallOptions` | type | The `userConfig` of the plugin and of each bundled MCP server (by server name) |
| `InstallRun` | type | What `planInstall` returns |
| `ListedJson` | type | Every field is a string |
| `ListedPlugin` | type | One installation, as the list shows it |
| `ListedSource` | type | The sources the docs' `source` field names: `github`, `git`, `url`, `directory`, `file` and `claudeai` |
| `ListPlan` | type | What `planMarketplaceList` returns |
| `ListRequest` | type | The `request` argument of `planMarketplaceList`; The `request` argument of `planPluginList` |
| `managedPolicyUnderSafeMode` | function | Whether a safe-mode session still applies the managed policy of a kind it skips; `undefined` where the docs say nothing |
| `manifestFileKind` | function | What a manifest file is validated as: `plugin.json` and `marketplace.json` by name; any other file in a `.claude-plugin` directory is a plugin manifest |
| `MARKETPLACE_COMMANDS` | constant | The `command` values of the marketplace commands ("`marketplace-add`, `marketplace-remove`, or `marketplace-update`") |
| `MARKETPLACE_SUBCOMMANDS` | constant | `claude plugin marketplace <subcommand>` |
| `MarketplaceCommand` | type | One of `MARKETPLACE_COMMANDS` |
| `marketplaceFailure` | function | The output of a failed marketplace command, with its failure code |
| `MarketplaceSubcommand` | type | One of `MARKETPLACE_SUBCOMMANDS` |
| `marketplaceSuccess` | function | The output of a marketplace command that succeeded |
| `MarketplaceUpdatePlan` | type | What `planMarketplaceUpdate` returns |
| `MCP_READ_SOURCES` | constant | The places MCP servers are read from |
| `MCP_SUBCOMMANDS` | constant | `claude mcp login` and `claude mcp logout` are listed beside `claude mcp` |
| `McpConfigSource` | type | Where a `--mcp-config` value comes from: a JSON string typed on the command line or a file |
| `McpReadSource` | type | One of `MCP_READ_SOURCES` |
| `mcpSourcesRead` | function | The sources a session reads servers from: `--strict-mcp-config` and `--bare` leave the command line's alone ("only servers supplied on the command line connect") |
| `McpSubcommand` | type | One of `MCP_SUBCOMMANDS` |
| `noResultLine` | function | The output of a command that prints no result line, with the reason |
| `notYetSetLine` | function | `N userConfig options not yet set (M required) — run /plugin configure <id> in Claude Code, or pass --config KEY=VALUE.` |
| `PendingAdd` | type | The starts that wait for the host's fetch |
| `PendingInstall` | type | What the host does before the lookup |
| `planConfigure` | function | What `claude plugin configure` prints and saves |
| `planDisable` | function | What `claude plugin disable` writes and prints |
| `planEnable` | function | What `claude plugin enable` writes and prints |
| `planInstall` | function | What `claude plugin install` prints and does, once the host added the marketplace and refreshed |
| `planMarketplaceList` | function | The listing: `--json` covers "configured marketplaces only and leaves the section out" |
| `planMarketplaceRemove` | function | What `plugin marketplace remove` does and prints |
| `planMarketplaceUpdate` | function | What `plugin marketplace update` refreshes and prints |
| `planPluginDetails` | function | What the command prints: the details of a loaded plugin, or the message for one that is not loaded |
| `planPluginList` | function | What `claude plugin list` prints |
| `planPluginTag` | function | Plans `claude plugin tag`: the tag to create from the plugin's version, or why it fails |
| `planPluginUpdate` | function | What `claude plugin update` prints and does |
| `planPruneCommand` | function | What `claude plugin prune` shows and removes, before any answer |
| `planSessionFlags` | function | What the flags a run was given add up to, in the order of `FLAG_NAMES` |
| `PLUGIN_SUBCOMMANDS` | constant | `claude plugin <subcommand>`; `claude plugin eval init` is a command of `eval` |
| `PluginCommandResult` | type | The JSON result of a `claude plugin` command: the subcommand, its outcome and message |
| `PluginDetails` | type | The `found` argument of `planPluginDetails` |
| `pluginFoldersOf` | function | The folders to load for one request, given what `readPluginDirectory` read in the directory: an archive or a URL is one plugin |
| `PluginRemoval` | type | One plugin uninstalled because its marketplace is gone: "Also deletes their saved options and secrets and data where it can" |
| `PluginSubcommand` | type | One of `PLUGIN_SUBCOMMANDS` |
| `PluginUpdateArguments` | type | The arguments and facts of `claude plugin update` |
| `PluginUpdateFacts` | type | The `facts` argument of `planPluginUpdate` |
| `PruneArguments` | type | `claude plugin prune` as a plan: the orphaned auto-installed dependencies at one scope (`user` by default), listed, asked about, or removed by the flags and the terminal |
| `PruneFacts` | type | The `facts` argument of `planPruneCommand` |
| `PrunePlan` | type | The `plan` argument of `answerPrune`; What `answerPrune` returns |
| `PruneQuestion` | type | The question the host asks, with what it removes if the answer is yes |
| `PruneStep` | type | What `--prune` removes with the plugin, and whether the user is asked first |
| `readmeAdvice` | function | The advice for a README that lacks the line, or none |
| `RefreshTarget` | type | The `refresh` field of `MarketplaceUpdatePlan` |
| `RegisteredForUpdate` | type | The `registered` field of `UpdateFacts` |
| `RemoveArguments` | type | `claude plugin marketplace remove <name>` as a plan |
| `RemoveFacts` | type | The `facts` argument of `planMarketplaceRemove` |
| `RemovePlan` | type | What `planMarketplaceRemove` returns |
| `renderAdvice` | function | The `Advice` block as the page prints it, or nothing when there is none |
| `renderCommand` | function | What a host prints and exits with for `output` |
| `Rendered` | type | What `ListPlan.print` returns; What `planPluginDetails` returns |
| `RenderOptions` | type | The `options` argument of `renderCommand` |
| `resolveCommand` | function | The command the words name, by name or alias, at each level |
| `ResolvedCommand` | type | What `resolveCommand` returns |
| `ResultFields` | type | Fields beyond the three that are always present: `marketplace`, `pluginId`, `scope`… |
| `Retention` | type | What `uninstallRetention` returns |
| `RetentionFacts` | type | The `facts` argument of `uninstallRetention` |
| `RetryRequest` | type | A retry of the dependency install in the cached copy: the host runs it and reports with `concludeRetry` |
| `SAVED_KEPT_UNREADABLE` | constant | "With `--json` the result carries `savedKept: \"install_records_unreadable\"`" |
| `SavedValues` | type | What the host stores, split by where it goes |
| `ScopeChoice` | type | What a command does when `--scope` is omitted |
| `SCOPED_COMMANDS` | constant | The commands that take `--scope` |
| `scopeFlagSpelling` | function | How the help spells the flag: `-s, --scope <scope>`, or `--scope <scope>` for a marketplace command |
| `ScopeWrite` | type | What `writeScope` returns |
| `sessionAgent` | function | The flag wins when both name one |
| `SessionChannel` | type | The `channels` field of `SessionPlan` |
| `SessionPlan` | type | The `plan` argument of `mcpSourcesRead`; What `planSessionFlags` returns |
| `SessionPluginRequest` | type | A plugin for this session only: `--plugin-dir` and `--plugin-url` load plugins of the `inline` origin |
| `ShownCommand` | type | The object a `--json` run's `failed` result carries when it displays a command and does not run it |
| `SIDELOAD_FLAGS` | constant | What managed `disableSideloadFlags` rejects |
| `SKIP_MODES` | constant | The customizations a mode leaves out |
| `SkipMode` | type | One of `SKIP_MODES` |
| `skippedBy` | function | The customizations `mode` skips, in the order of `CUSTOMIZATIONS` |
| `sourceFromOrigin` | function | The marketplace source Claude Code fills in from "the `origin` remote of the `.git` directory at the top of" the validated directory |
| `startInstall` | function | Reads the arguments and says what to do before the lookup, or what the command ends with |
| `startMarketplaceAdd` | function | What to fetch, or what the command ends with before any fetch |
| `startUninstall` | function | What to remove, or what the command ends with before anything is touched |
| `startupRefusal` | function | What the run ends with when the plan refuses it: exit `1`, the reasons on stderr, no result line |
| `TagCommand` | type | The `commands` field of `TagPlan`; The `push` field of `TagPlan` |
| `TagFacts` | type | Host observations, after walking upward for the marketplace that lists this directory |
| `TagOptions` | type | The `options` argument of `planPluginTag` |
| `TagPlan` | type | The `plan` argument of `finishPluginTag`; What `planPluginTag` returns |
| `ToggleArguments` | type | The `args` argument of `planEnable` |
| `ToggleFacts` | type | The `facts` argument of `planDisable`; The `facts` argument of `planEnable` |
| `TogglePlan` | type | What `planDisable` returns; What `planEnable` returns |
| `unexpectedError` | function | The output of a command that failed unexpectedly, with the reason |
| `unexpectedValidationError` | function | Exit `2`: "the validator itself failed, such as on an unreadable path"; the message goes to stderr, stdout stays empty |
| `UninstallArguments` | type | `claude plugin uninstall <plugin>` as two decisions around the host's writes |
| `UninstallConclusion` | type | What `concludeUninstall` returns |
| `UninstallFacts` | type | The `facts` argument of `startUninstall` |
| `uninstallRetention` | function | What the uninstall of `facts.id` from `facts.scope` deletes and keeps |
| `UninstallStart` | type | The `start` argument of `concludeUninstall`; What `startUninstall` returns |
| `unsetKeys` | function | The options with no value: neither saved nor a declared `default` (judgment: "set" is the value `${user_config.KEY}` stands for, as `userConfigValue` reads it) |
| `UpdatableInstall` | type | A plugin installed at one scope, with what an update needs to know about it |
| `UpdateArguments` | type | `claude plugin marketplace update [name]` as a plan: which marketplaces' listings are refreshed, from what, and what is printed |
| `UpdateEffects` | type | What the host carries out for an update that found a newer version |
| `UpdateFacts` | type | The `facts` argument of `planMarketplaceUpdate` |
| `UpdateRun` | type | What `concludeRetry` returns; What `planPluginUpdate` returns |
| `usageError` | function | The output of a command line used wrongly, with the reason |
| `UsageError` | type | What `chooseScope` returns; What `exclusiveAcceptFlags` returns |
| `ValidationAdvice` | type | One entry of `advice`: the README, the message and the line to paste |
| `ValidationFileResult` | type | The `manifest` field of `ValidationJson`; The `contents` field of `ValidationJson` |
| `validationJson` | function | The `--json` report: `success` is the verdict the exit code gives, `strict` whether warnings failed the run, `target` the resolved path validated |
| `ValidationJson` | type | What `validationJson` returns |
| `writeScope` | function | `--scope` given to `enable` or `disable` for a plugin: where the plugin is declared the scope is written |
