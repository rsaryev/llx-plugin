# `@rsaryev/llx-plugin/settings`

Settings layers, their merge and the policy of every key, managed settings included.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `AddedDirectory` | type | A directory `permissions.additionalDirectories` adds, with the file's scope |
| `addPluginsRefusal` | function | The Agent SDK's `addPlugins` option under `disableSideloadFlags` |
| `AdminDocument` | type | One source after reading: what it delivers and whether it counts |
| `admits` | function | Whether `key` read from `scope` with `value` is taken into account |
| `AgentsOrigin` | type | The `agents` field of `OriginOf`; The `origin` argument of `AgentScanContext.allows` |
| `AgentViewDecision` | type | What `agentViewDisabled` returns |
| `agentViewDisabled` | function | Whether background agents and agent view are off: "whichever of the two turns it off, the other can't turn it back on" |
| `API_PROVIDERS` | constant | The services `allowedProviders` names |
| `Applies` | type | The `applies` field of `EditEffect`; What `reachesRunningSession` returns |
| `applyParentRules` | function | The view every area reads: the parent layers under the same rule, over the managed layers of the view |
| `applySettingsEnv` | function | The environment after the settings' variables are written into it |
| `applyToggles` | function | The candidates with `enabled` set from the project's lists; a disabled one stays, marked |
| `ApprovalItem` | type | What `approvalItems` returns |
| `approvalItems` | function | The items of delivered settings that need approval, in a stable order |
| `ApprovalKind` | type | Which delivered settings need the user's approval before they apply |
| `ApprovalSession` | type | Whether the session can show the approval prompt (`canPromptForProjectServers`) |
| `ApprovalVia` | type | What decided a server's status; absent while it is pending |
| `Arrival` | type | How the change arrived: a settings file Claude Code watches, or a managed source delivered on a schedule |
| `AUTO_MODE_LISTS` | constant | The prose rule lists of the block, in the docs' order |
| `AutoModeList` | type | One of `AUTO_MODE_LISTS` |
| `AutoModeSettings` | type | The auto mode settings in force |
| `BackgroundEditFacts` | type | The `facts` argument of `backgroundEditsBlocked` |
| `backgroundEditsBlocked` | function | Whether `Edit` and `Write` are refused in the main checkout of a background session |
| `backgroundPluginRefreshEnabled` | function | `CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH=1` refreshes plugin state at turn boundaries "in non-interactive mode"; off by default |
| `BaseRefFacts` | type | The `facts` argument of `baseRefTarget` |
| `baseRefTarget` | function | What a `baseRef` resolves to: `"head"` is the current local `HEAD`, and "inside a linked worktree, `"head"` resolves to that worktree's `HEAD`, not the main checkout's" |
| `BaseRefTarget` | type | Where a new worktree starts from |
| `BlockedServer` | type | The `blocked` field of `McpLoadPlan` |
| `BundledOffBy` | type | What turned the bundled skills off |
| `bundledSkills` | function | `disableBundledSkills` and `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` |
| `BundledSkillsDecision` | type | What `bundledSkills` returns; What `SkillSettingsPolicy.bundled` returns |
| `cacheAfterFetch` | function | The local cache of server-managed settings |
| `canPromptForProjectServers` | function | Whether the session shows the approval prompt |
| `capEffort` | function | The level a session runs at: `level`, or the cap when `level` is higher ("Any higher level runs at the cap instead") |
| `CHANNEL_ACCOUNTS` | constant | The account kinds the `channelsEnabled` default depends on |
| `CHANNEL_ORIGINS` | constant | The two flags that carry a channel into a session |
| `CHANNEL_REASONS` | constant | Why a channel plugin may or may not register |
| `ChannelAccount` | type | One of `CHANNEL_ACCOUNTS` |
| `ChannelAllowlist` | type | What `ChannelSettingsPolicy.allowlist` returns; The `allowlist` argument of `channelVerdict` |
| `ChannelAllowlistContext` | type | What the host tells the allowlist besides the layers |
| `channelCapabilities` | function | Reads the `capabilities` object of the server's initialize result |
| `ChannelCapabilities` | type | What a server's capabilities declare |
| `ChannelEntry` | type | One entry a user passed for the session, with the flag it came from. "The bypass is per-entry" |
| `channelGate` | function | The master switch: whether channels may deliver messages on this account |
| `ChannelGate` | type | What `channelGate` returns; What `ChannelSettingsPolicy.gate` returns |
| `ChannelGateBy` | type | What opened the gate |
| `channelInstructions` | function | `instructions` "Claude Code delivers... to Claude as context when the server connects": the text to add to the context, or `undefined` when the server gave none |
| `ChannelNotification` | type | The `notifications/claude/channel` params |
| `ChannelOrigin` | type | One of `CHANNEL_ORIGINS` |
| `ChannelPolicyContext` | type | What the host tells the channel keys besides the layers |
| `ChannelReason` | type | One of `CHANNEL_REASONS` |
| `ChannelsContext` | type | What the host tells the channel gate besides the layers: plain data, the kit reads no environment |
| `ChannelSettingsPolicy` | type | The channel keys of the settings as one object over a view |
| `channelTag` | function | The event as Claude sees it: `<channel source="..." key="value">content</channel>` |
| `channelVerdict` | function | The gate first (it blocks the development flag too), then the entry's own flag rule |
| `ChannelVerdict` | type | What `ChannelSettingsPolicy.allowed` returns; What `channelVerdict` returns |
| `claudeAiAppliesMarketplaceLists` | function | Whether claude.ai applies the marketplace lists at a place |
| `ClaudeJsonFacts` | type | What the host must do with the text of `~/.claude.json`, the file Claude Code writes for itself |
| `ClaudeJsonOutcome` | type | What `readClaudeJson` returns |
| `claudeJsonProject` | function | The `~/.claude.json` entry of one project (`projects["<path>"]`), as it was written |
| `claudeJsonServers` | function | The user and local servers of Claude Code's state file `~/.claude.json`, already parsed by the host |
| `claudeTempDirectory` | function | `CLAUDE_CODE_TMPDIR`: "Claude Code appends `/claude-{uid}/` to this path on Unix, or `/claude/` on Windows" |
| `COMMAND_LINE_KEYS` | constant | Commands follow hook policy |
| `CommandBlocker` | type | The key that blocks a command: the explicit one, or the one that decides while it is unset |
| `CommandGates` | type | The commands that follow the hooks: the status line, the file suggestion command, the subagent status line, plugin monitors and `/goal` |
| `CommandSessionFacts` | type | The facts about the session the host knows and the settings do not |
| `commandSourceDisabledMessage` | function | The refusal of an install or update of a plugin with a `command` source while command sources are disabled |
| `CommandSourcePolicy` | type | What `createCommandSourcePolicy` returns; The `commandSources` field of `MarketplaceSettingsPolicy` |
| `CommandVerdict` | type | The `pluginSource` field of `CommandSourcePolicy`; What `CommandSourcePolicy.headersHelper` returns |
| `composeManaged` | function | Composes the managed settings documents by rank |
| `composeManagedReads` | function | The managed tier of the sources the host found |
| `ComposeOptions` | type | The `options` argument of `composeManaged`; The `options` argument of `composeManagedReads` |
| `configDirOf` | function | The folder holding the home-directory files |
| `configDirectoryOf` | function | The configuration directory from the home and `CLAUDE_CONFIG_DIR` as given: the variable when set and not empty, else `<home>/.claude` |
| `ConfiguredCandidate` | type | A server some scope other than the organization's defines; the plan builds the managed ones itself |
| `ConfiguredServer` | type | One server of a `--mcp-config` |
| `connectorDisplayName` | function | How a connector is written in the lists: "under its display name, for example `claude.ai Slack`" (`/mcp` lists the connector Anthropic provides as `claude.ai Claude Docs`) |
| `createChannelSettingsPolicy` | function | The channel settings policy of a settings view |
| `createCommandSourcePolicy` | function | Whether marketplace commands may run, from a settings view |
| `createCustomizationPolicy` | function | The key passes the parent filter, but a parent is still ignored where an administrator deploys managed settings and does not let an embedding host add policy |
| `createGeneralView` | function | The view of the general settings over settings layers |
| `createHookPolicy` | function | The hook settings policy of a settings view |
| `createMarketplaceGate` | function | The gate of allowed and blocked marketplaces of a settings view |
| `createMarketplaceRegistry` | function | The marketplaces a settings view declares |
| `createMcpServerPolicy` | function | The allowlist and the denylist over one server, in the order the page gives |
| `createMcpSettingsPolicy` | function | The MCP settings policy of a settings view |
| `createPermissionRelay` | function | `random` returns a number in [0, 1), the host's source of randomness (L3) |
| `createPermissionsPolicy` | function | The permissions policy of a settings view |
| `createPluginSettingsPolicy` | function | The plugin settings policy of a settings view |
| `createPolicyView` | function | The view of settings layers that reads each key by its merge |
| `createSkillSettingsPolicy` | function | `disableSkillShellExecution: true` in the SDK's `managedSettings` takes effect, but parent settings are ignored where an administrator deploys managed settings |
| `createWorkflowSettingsPolicy` | function | The workflow settings policy of a settings view |
| `CROSS_SESSION_MODES` | constant | The values of `crossSessionInbound` from the least to the most strict |
| `CustomizationPolicy` | type | `strictPluginOnlyCustomization` as one object over a view: a host's discovery of skills, agents, hooks and MCP servers asks `loads(surface, origin)` per candidate |
| `DecidedBy` | type | Where an `enabledPlugins` decision came from: a file, or the plugin's own `defaultEnabled` |
| `deliveredPayloadOutcome` | function | Every setting fails validation, none falls back to a stricter value, and the payload holds a key other than the two retention keys |
| `deliversChannelEvents` | function | Whether a channel server's event reaches the session; a refused one is dropped silently |
| `describeManagedServer` | function | What `claude mcp get` and `/mcp` show of a provided server |
| `DesktopManaged` | type | Sessions of the Claude Desktop app where Claude Code does not read the key |
| `DropInDirectory` | type | The `managed-settings.d/` folder: absent, present and unreadable, or its files |
| `DropInFile` | type | A file-based policy split across teams: `managed-settings.json` first, then every `*.json` of `managed-settings.d/` in alphabetical order |
| `dropInOrder` | function | The drop-in names in the order they merge: alphabetical, so numeric prefixes (`10-telemetry.json`, `20-security.json`) control it |
| `EDIT_OUTCOMES` | constant | How long a developer's edit of a managed source stays |
| `editEffect` | function | What an edit is owed: the arrival's effect, unless the key waits for a restart |
| `EditEffect` | type | What `editEffect` returns |
| `editOfManagedSource` | function | What editing a managed source does, by mechanism and local admin |
| `EditOutcome` | type | One of `EDIT_OUTCOMES` |
| `effectiveCap` | function | The cap that applies to a model: "When several scopes set a cap, the lowest applies, so a cap set in one scope can't be raised from another" |
| `effectiveChannelAllowlist` | function | The allowlist in force |
| `effortLevelFor` | function | The level the files give a model, or `undefined` when none does |
| `EnabledDecision` | type | What `enabledPlugin` returns; What `PluginSettingsPolicy.enabled` returns |
| `enabledPlugin` | function | Whether a plugin is on |
| `envAfterCd` | function | The session after `/cd`: "the new directory's project and local `env` values, on top of the previous directory's" |
| `envChange` | function | What a saved change to the `env` of the files does to a running session |
| `EnvChange` | type | When Claude Code applies `env` values again |
| `EnvInput` | type | The `input` argument of `resolveEnv` |
| `EnvResolution` | type | The `previous` argument of `envAfterCd`; The `entered` argument of `envAfterCd` |
| `EnvTrust` | type | What the `env` blocks of the settings files come to for a session |
| `fetchesRemoteSettings` | function | Whether remote settings, the top-ranked managed source, are fetched at all |
| `FetchFacts` | type | The `facts` argument of `fetchesRemoteSettings` |
| `FILE_ORIGINS` | constant | `managed-settings.json` and the other managed sources have no one path |
| `FILE_SCOPES` | constant | Whose sessions a settings file reaches |
| `FILE_USES` | constant | How much of the managed settings file a place applies |
| `FileFacts` | type | The host's facts for the files it joins paths for |
| `FileMaker` | type | Who makes a file when it is absent: the docs' "create them yourself, or let Claude Code create them" |
| `FileOrigin` | type | Where a settings file is documented, who makes it and whether the person edits it |
| `FileScope` | type | One of `FILE_SCOPES` |
| `FileUse` | type | One of `FILE_USES` |
| `FirstWriteFacts` | type | The `facts` argument of `shouldAddGitExclude` |
| `forceEnabledByManaged` | function | Whether managed settings force-enable the plugin |
| `gatewaySignInRefused` | function | `/login` refuses every new cloud gateway sign-in on the machine while the highest managed source on it carries `gatewayInternalNetworks` with a value that cannot be read |
| `GENERAL_KEYS` | constant | The keys beyond the policy keys the kit combines |
| `GeneralKey` | type | One of `GENERAL_KEYS` |
| `GeneralValues` | type | The value type of each general key, from the official `Settings`, never declared again (`undefined` as `Settings` has it: the key is optional) |
| `GeneralView` | type | The policy view, plus every setting of the files as one object |
| `GitExcludeFacts` | type | The `facts` argument of `globalGitExcludesFile` |
| `globalConfigFileOf` | function | The global config file: `.claude.json` in `CLAUDE_CONFIG_DIR` when set and not empty, else in the home |
| `globalGitExcludesFile` | function | The global git excludes file: `core.excludesFile`, else the XDG git `ignore` file |
| `groupChannelEvents` | function | Groups queued channel events in the order the session processes them |
| `GuardPlacement` | type | Where the built-in guard sits: at the position a managed list gives it, outermost by default, or not loaded |
| `HELPER_PHASES` | constant | One run of a policy helper and what it comes to |
| `HelperFileProbe` | type | The one effect the managed sources need beyond the shared ports: asking whether a regular file is at a path, within a time budget |
| `HelperHost` | type | What a host hands to run a helper |
| `HelperKey` | type | What `readPolicyHelper` returns |
| `helperPathFault` | function | Why `path` breaks the rules of `policyHelper.path`; a run with such a path fails |
| `HelperPhase` | type | One of `HELPER_PHASES` |
| `HelperPlan` | type | What the policy helper does on this machine |
| `HelperRunInput` | type | The `input` argument of `runPolicyHelper` |
| `helperRunsNow` | function | Whether the policy helper runs now: a new or changed one "takes effect at the next launch" |
| `HiddenMcpServer` | type | A candidate a higher one of the same identity displaced: `/mcp` lists a hidden connector so |
| `Hive` | type | One of `HIVES` |
| `HIVES` | constant | The registry hives managed settings are read from |
| `HOOK_BLOCK_REASONS` | constant | Why a hook does not run |
| `HookBlockReason` | type | One of `HOOK_BLOCK_REASONS` |
| `HookFrontmatterOwner` | type | What declares frontmatter hooks |
| `HookFrontmatterSource` | type | The sources a skill, command or agent can come from |
| `HookPolicy` | type | The keys that decide which hooks run, as one object over a view |
| `HookPolicyContext` | type | What the host tells the hook policy besides the layers |
| `HooksOrigin` | type | The hooks of every origin the hook policy knows: the same vocabulary, one decision about it |
| `HookVerdict` | type | What `HookPolicy.runs` returns |
| `HttpHookUrlPolicy` | type | The `httpHook` field of `HookPolicy` |
| `HttpHookVerdict` | type | The two allowlists of HTTP hooks |
| `ignoredBecause` | function | Why Claude Code drops the variable `name` set to `value` in a file of `scope`, or `undefined` when the variable stays |
| `IgnoreReason` | type | One of `IGNORE_REASONS` |
| `InboundMessage` | type | A message from a chat platform: who sent it and in which room |
| `InForceNote` | type | `/status` names a source whose lock or allowlist is not the one in force |
| `isDropInName` | function | "Claude Code ignores hidden files and files that don't end in `.json`." |
| `isFileScope` | function | Whether a scope a host holds as a string is one of the four file scopes |
| `isPluginId` | function | Whether a text is a plugin id (`name@marketplace`) |
| `isTwoWay` | function | A channel with tools can take replies |
| `isUnsetForProvider` | function | Whether a variable counts as unset; set to `""` it cancels a shell export |
| `KEY_SPECS` | constant | How each policy key is scoped, merged and repaired |
| `KeyHolder` | type | One layer's value of a key, with the layer it came from |
| `KeySpec` | type | How one policy key is scoped, merged and repaired |
| `KeywordMiss` | type | Why a prompt does not trigger a workflow, in the order the kit checks them |
| `keywordTrigger` | function | Whether typing `ultracode` in `prompt` starts a dynamic workflow |
| `KeywordVerdict` | type | What `keywordTrigger` returns; What `WorkflowSettingsPolicy.keyword` returns |
| `LAUNCH_SURFACES` | constant | Where the session runs: the terminal, the VS Code extension, or `claude -p` and the Agent SDK |
| `LauncherRead` | type | What `readProcessWrapper` returns |
| `LaunchSurface` | type | One of `LAUNCH_SURFACES` |
| `ListKind` | type | Which list an entry is read as |
| `LoadedSettings` | type | What loading every source came to |
| `LoadedSources` | type | What `sourcesLoadedBy` returns |
| `loadManagedMcpFile` | function | Reads the file of `platform` through the host's reader; a machine without it has no file |
| `loadSettingsLayers` | function | Reads every scope the host has, in precedence order, into layers |
| `loadsFileCreatedMidSession` | function | Whether a settings file created during a session loads |
| `LOCAL_FILE_IGNORE_ENTRY` | constant | The line Claude Code adds to the global git excludes |
| `LocalFileFacts` | type | What the host learned about the local settings file. permissions.md ("When your local settings file needs trust"): the file is normally your own, so |
| `LocalPlacementFacts` | type | The `facts` argument of `localSettingsFiles`; The `facts` argument of `localSettingsRoot` |
| `localSettingsFiles` | function | The local files to read, the one that applies first first |
| `localSettingsRoot` | function | The folder whose `.claude/settings.local.json` is the local file: the repository root |
| `MANAGED_BEHAVIORS` | constant | How managed sources compose: first wins, or merge |
| `MANAGED_DELIVERIES` | constant | How `managedMcpServers` reaches the machine |
| `MANAGED_MCP_GROUP` | constant | `/mcp` "lists provided servers under **Managed MCPs**" |
| `MANAGED_MCP_PLATFORMS` | constant | Where Claude Code looks for `managed-mcp.json`: "Linux and WSL" share a row, so the platform union names both and the registry gives them one path |
| `MANAGED_SOURCES` | constant | The managed sources and what a machine can hold in each |
| `ManagedActor` | type | Who acts, as far as the managed settings are concerned |
| `ManagedBehavior` | type | Which managed sources apply and the managed tier they make |
| `managedBinding` | function | An administrator can edit the managed source, so MDM redeploys it; "The server-managed cache": an edit "lasts only until the next successful fetch" |
| `ManagedBinding` | type | What `managedBinding` returns |
| `managedChangeAdvice` | function | Restart first; "If `/status` then names a different source than the one your administrator changed, a higher-priority source applies" |
| `ManagedChangeAdvice` | type | What to tell a person whose managed change has not reached them |
| `ManagedChangeFacts` | type | The `facts` argument of `managedChangeAdvice` |
| `ManagedComposition` | type | What `composeManaged` returns; What `composeManagedReads` returns |
| `ManagedDelivery` | type | One of `MANAGED_DELIVERIES` |
| `managedFilePaths` | function | Where the file-based mechanism keeps its files |
| `ManagedFilePaths` | type | What `managedFilePaths` returns |
| `ManagedFileRead` | type | The `read` argument of `readFileDocument` |
| `ManagedMcpFile` | type | The servers a deployed `managed-mcp.json` defines, already read like a project `.mcp.json` |
| `managedMcpFilePath` | function | The path of the managed MCP file on a platform |
| `ManagedMcpFileRead` | type | What `loadManagedMcpFile` returns; What `readManagedMcpFile` returns |
| `ManagedMcpPlatform` | type | One of `MANAGED_MCP_PLATFORMS` |
| `ManagedReads` | type | What a host found at each managed source of the machine: the kit reads no file, plist, registry value or fetch |
| `ManagedServerChanges` | type | What `reconcileManagedServers` returns |
| `ManagedServerDescription` | type | What `describeManagedServer` returns |
| `managedServerEntries` | function | The servers the organization provides: `managedMcpServers` of the managed layers only |
| `ManagedServerEntries` | type | What `managedServerEntries` returns |
| `ManagedServerOptions` | type | The `options` argument of `managedServerEntries`; The `desktopManaged` field of `McpPlanFacts` |
| `managedServerRemoval` | function | What `claude mcp remove` reports for a provided server |
| `ManagedSource` | type | One of `MANAGED_SOURCES` |
| `MARKETPLACE_KEY_ALIASES` | constant | Keys Claude Code accepts under another spelling: the alias on the left reads exactly as the canonical key on the right |
| `MARKETPLACE_SOURCE_KINDS` | constant | Every `source` kind of a marketplace source object |
| `MarketplaceGate` | type | What `createMarketplaceGate` returns; The `gate` field of `MarketplaceSettingsPolicy` |
| `MarketplaceRegistry` | type | What `createMarketplaceRegistry` returns; The `registry` field of `MarketplaceSettingsPolicy` |
| `MarketplaceSettingsPolicy` | type | The marketplace keys behind one object: the two lists, the registry plan and the command sources |
| `matchMarketplaceSource` | function | Whether a list entry matches the source of a marketplace |
| `matchUrlPattern` | function | Whether a URL matches an allowed HTTP hook URL pattern |
| `maxConcurrentSubagents` | function | The subagent concurrency from `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, or the default |
| `MCP_SCOPES` | constant | Where an MCP server comes from, highest precedence first |
| `MCP_SERVER_ORIGINS` | constant | Where a server comes from, as far as the lists are concerned |
| `McpBlockedBy` | type | The lists that blocked a server |
| `McpCandidate` | type | A server some source defines, already read and with its `${VAR}` references expanded |
| `McpCandidatesRead` | type | What `claudeJsonServers` returns; What `projectFileServers` returns |
| `McpLoadFacts` | type | The `facts` argument of `readMcpLoadSettings` |
| `McpLoadInput` | type | The `input` argument of `mcpLoadPlan`; The `candidates` field of `McpPlanFacts` |
| `mcpLoadPlan` | function | Which servers load, and what Claude Code says and does about the ones that do not |
| `McpLoadPlan` | type | What `mcpLoadPlan` returns; What `McpSettingsPolicy.loadPlan` returns |
| `McpLoadSettings` | type | The switches that decide what loads next to, or instead of, the MCP servers a user configured |
| `McpOrigin` | type | `userConfig` is the user-scope servers and `localConfig` the local-scope ones (the default of `claude mcp add`) |
| `McpPlanFacts` | type | The `facts` argument of `McpSettingsPolicy.loadPlan` |
| `McpPolicyEnv` | type | The `env` argument of `createMcpServerPolicy` |
| `McpPolicyExtras` | type | What a host adds to the view: facts no settings file holds |
| `McpPolicySubject` | type | The `subject` argument of `McpServerPolicy.check` |
| `McpRanking` | type | What `rankMcpServers` returns |
| `McpScope` | type | One of `MCP_SCOPES` |
| `McpServerOrigin` | type | One of `MCP_SERVER_ORIGINS` |
| `McpServerPolicy` | type | What `createMcpServerPolicy` returns; The `policy` field of `McpLoadInput` |
| `McpServerVerdict` | type | What `McpServerPolicy.check` returns |
| `McpSessionFacts` | type | The `session` field of `McpLoadInput` |
| `McpSettingsPolicy` | type | The MCP keys of the settings policy: the approval of a project's `.mcp.json` servers and the allow and deny lists |
| `McpTrust` | type | What the host knows about the folder |
| `McpUpdateFacts` | type | The facts of a mid-session MCP update |
| `McpUpdateVerdict` | type | What `midSessionMcpUpdates` returns |
| `MDM_SOURCE` | constant | The MDM mechanism a platform has: a configuration profile on macOS, the `HKLM` registry on Windows; Linux has neither |
| `Mechanism` | type | One of `MECHANISMS` |
| `MECHANISM_TRAITS` | constant | The traits of each managed settings mechanism |
| `MECHANISMS` | constant | The mechanisms that deliver managed settings |
| `MechanismTraits` | type | The traits of one managed settings mechanism: its sources, reading and polling |
| `MergeKind` | type | One of `MERGE_KINDS` |
| `midSessionMcpUpdates` | function | Server-delivered mid-session MCP updates, "the path behind cloud session configuration and SDK `setMcpServers()` calls that reach those sessions" |
| `minimumVersionEffect` | function | "`requiredMinimumVersion` blocks an outdated binary from starting and doesn't end a session that's already running." |
| `MinimumVersionFacts` | type | The `facts` argument of `minimumVersionEffect` |
| `MODEL_MATCH_MODES` | constant | The values of `availableModelsMatch` |
| `ModelEffort` | type | The effort level a settings file saves for one model |
| `ModelEffortFacts` | type | The `facts` argument of `effortLevelFor` |
| `modOrder` | function | The order the organization's and the user's own mods run in |
| `ModOrderContext` | type | The two machine facts the ordering keys depend on |
| `ModOrderResult` | type | What `modOrder` returns; What `PluginSettingsPolicy.modOrder` returns |
| `NamedMcpServer` | type | The `mcpConfig` field of `McpSessionFacts` |
| `NEAREST_CONTROLS` | constant | The nearest existing controls per request ("These requests... have no dedicated key") |
| `NotApplied` | type | Why a settings value did not reach the session |
| `NotAppliedVariable` | type | The `notApplied` field of `EnvResolution`; The `ignored` field of `SettingsEnv` |
| `officialMarketplaceAutoinstallEnabled` | function | `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1`: "skips the registration permanently" |
| `OptionValue` | type | What an option or a server value is: "a string, number, Boolean, or array of strings", as the SDK types it |
| `OptionValues` | type | The `userConfig` field of `PluginHostOptions`; The `userConfig` field of `SessionOptions` |
| `OriginOf` | type | The origins a host names, per surface |
| `OverriddenKey` | type | A key of `SESSION_OVERRIDES` |
| `OverrideSource` | type | One place a key's value can come from, as a reader of the session input |
| `ParentOutcome` | type | What `parentSettingsOf` returns |
| `ParentSettingsContext` | type | The parent settings an embedding host passes through the Agent SDK's `managedSettings` option |
| `parentSettingsOf` | function | What a host's parent settings come to beside the managed tier the kit composed |
| `PATH_FLAVORS` | constant | The OS families `policyHelper.path` is judged for |
| `PathFlavor` | type | One of `PATH_FLAVORS` |
| `PayloadEntry` | type | An entry of a delivered payload after validation |
| `PayloadOutcome` | type | What `deliveredPayloadOutcome` returns |
| `permissionPromptNotifyHooksEnabled` | function | Whether `Notification` hooks run for permission requests sent to the SDK's `canUseTool` |
| `PermissionRelay` | type | What `createPermissionRelay` returns |
| `PermissionRequestParams` | type | The `notifications/claude/channel/permission_request` params |
| `permissionRuleLists` | function | The permission rules every settings file adds up to |
| `PermissionRuleLists` | type | The rules of each behaviour, highest scope first, a rule written in two files once, and the added directories |
| `PermissionsPolicy` | type | The permission keys of the settings as one object over a view |
| `PermissionVerdictParams` | type | The `notifications/claude/channel/permission` params a channel sends back |
| `PHASE_OUTCOMES` | constant | What a failed policy helper does in each phase |
| `PhaseOutcome` | type | What a failed run costs in each phase |
| `Place` | type | One of `PLACES` |
| `PlaceFacts` | type | The `facts` argument of `reachOfPlace` |
| `PlaceReach` | type | What `reachOfPlace` returns |
| `PLACES` | constant | Where Claude Code runs, for managed settings |
| `PLAN_SOURCES` | constant | Where a planned server comes from; the two organization sources are told apart for the lists |
| `PlannedServer` | type | The `servers` field of `McpLoadPlan` |
| `PlanSource` | type | One of `PLAN_SOURCES` |
| `Platform` | type | One of `PLATFORMS` |
| `PLATFORMS` | constant | The delivery mechanisms as data: where each stores the policy, how often Claude Code reads it, and which source of the composition it is |
| `PLIST_DOMAIN` | constant | "The `com.anthropic.claudecode` managed preferences domain." |
| `PLUGIN_ONLY_SURFACES` | constant | The kinds of customization `strictPluginOnlyCustomization` can lock, in the order the docs list them ("`skills`, `agents`, `hooks`, and `mcp`") |
| `PluginBlock` | type | Why a plugin is refused: its own entry, its marketplace, or a dependency |
| `pluginBlockedMessage` | function | `Plugin "<name>" is blocked by your organization's policy...` in its three forms |
| `pluginConfig` | function | The answers stored for a plugin |
| `PluginConfig` | type | What `pluginConfig` returns; What `PluginSettingsPolicy.config` returns |
| `PluginDefaults` | type | Last plugin wins, below every settings source |
| `pluginGitTimeoutMs` | function | The plugin git timeout from `CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS`, or the default |
| `PluginHookSource` | type | A plugin that ships hooks, with the facts the locks look at |
| `PluginId` | type | A plugin id is `<name>@<origin>`: the origin is a marketplace name or one of the reserved ones or `builtin` for a plugin inside Claude Code |
| `PluginOnlySurface` | type | One of `PLUGIN_ONLY_SURFACES` |
| `pluginSeedDirectories` | function | `CLAUDE_CODE_PLUGIN_SEED_DIR`: "one or more read-only plugin seed directories, separated by `:` on Unix or `;` on Windows" |
| `PluginSettingsPolicy` | type | The plugin keys of the settings as one object over a view |
| `PluginWithDefaults` | type | A plugin as its defaults are merged: its name (for the debug line) and its applied settings |
| `POLICY_KEYS` | constant | The top-level settings keys the kit resolves as policy |
| `POLICY_SCOPES` | constant | Where a settings object comes from, highest precedence first |
| `POLICY_SURFACES` | constant | Where and when a deployed policy applies: which surfaces and places read which sources, what reaches a running session, and what waits for the developer |
| `POLICY_SYMPTOMS` | constant | The symptoms "Troubleshoot policy" lists |
| `PolicyAccount` | type | How the session signs in; the host knows it, the kit never does |
| `policyContext` | function | A `PolicyContext` from the facts a host knows |
| `PolicyContext` | type | What a host tells the policy besides the layers: plain data it copies in, so the kit reads no `process.env`, no file and no account |
| `PolicyHelper` | type | The `helper` field of `HelperPlan`; The `helper` field of `HelperRunInput` |
| `PolicyHelperOutput` | type | The `produce` argument of `attemptWithHeadersHelper`; What `readHelperOutput` returns |
| `PolicyHelperRun` | type | The `plan` argument of `runMcpHeadersHelper`; What `runPolicyHelper` returns |
| `PolicyHookSource` | type | The `origin` argument of `HookPolicy.runs` |
| `PolicyKey` | type | One of `POLICY_KEYS` |
| `PolicyLayer` | type | The `given` argument of `createPolicyView`; The `layers` field of `PolicyView` |
| `PolicyScope` | type | One of `POLICY_SCOPES` |
| `policySkillsEnabled` | function | `CLAUDE_CODE_DISABLE_POLICY_SKILLS=1`: skip "the system-wide managed skills directory" |
| `PolicySurface` | type | One of `POLICY_SURFACES` |
| `PolicySymptom` | type | One of `POLICY_SYMPTOMS` |
| `PolicyView` | type | Typed questions over the ordered layers, the one thing every area resolver asks |
| `PreapprovalSkill` | type | What the host knows about the skill that is about to run |
| `PreapprovalSource` | type | Where a skill comes from, as far as `allowed-tools` pre-approval is concerned |
| `preferHttps` | function | `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`: clone GitHub `owner/repo` shorthand over HTTPS, not SSH |
| `problemKind` | function | Which of the documented kinds a problem found in `scope` is |
| `ProblemKind` | type | What `/status` and the start-up dialog call a problem |
| `PROJECT_SERVER_STATUSES` | constant | Two of the statuses `claude mcp list` and `claude mcp get` print without connecting: `pending approval` shows in both commands, `rejected` only in `claude mcp get` |
| `projectFileServers` | function | The servers of a project's `.mcp.json`, already parsed: project scope |
| `projectServerApproval` | function | The status of each server of a project's `.mcp.json` (`servers` are its names, in the order to report) |
| `ProjectServerApproval` | type | What `McpSettingsPolicy.projectServerApproval` returns; What `projectServerApproval` returns |
| `ProjectServerStatus` | type | One of `PROJECT_SERVER_STATUSES` |
| `projectSettingsFile` | function | The shared project file, in the project folder (the session's primary working directory) |
| `ProjectToggles` | type | The per-project lists a toggle in `/mcp` writes to `~/.claude.json` |
| `PROMPT_SURFACES` | constant | How a prompt reaches the session: typed at the interactive prompt, in an IDE extension panel or in a Remote Control client; sent by an Agent SDK application |
| `PromptInput` | type | The `prompt` argument of `keywordTrigger`; The `prompt` argument of `WorkflowSettingsPolicy.keyword` |
| `PromptSession` | type | The `session` argument of `canPromptForProjectServers` |
| `PromptSurface` | type | One of `PROMPT_SURFACES` |
| `ProvidedServers` | type | What `McpSettingsPolicy.providedServers` returns; What `readManagedMcpServers` returns |
| `providedServersTiming` | function | When the provided servers connect in a session that starts |
| `ProvidedTiming` | type | What `providedServersTiming` returns |
| `ProvidedTimingInput` | type | The `input` argument of `providedServersTiming` |
| `rankMcpServers` | function | Loads each server once, from the highest-precedence source, using its whole entry |
| `RankOptions` | type | The `options` argument of `rankMcpServers` |
| `Reach` | type | What `reachOf` returns |
| `reachesRunningSession` | function | When a change to `key` reaches a running session: "most changes reach a running session on the schedule in the delivery mechanism table, without a restart" |
| `ReachFacts` | type | What a host tells about the file besides its scope |
| `reachOf` | function | Where a setting saved in a file of this scope applies |
| `reachOfPlace` | function | What managed settings reach at a place |
| `readAdminDocument` | function | What one source's read comes to |
| `readAgentSetting` | function | `agent` and `disableAgentView` |
| `readChannelNotification` | function | The `notifications/claude/channel` params a server sent, read as a `ChannelNotification` |
| `readClaudeJson` | function | Reads `~/.claude.json` and its backup into whether it is usable |
| `readCommandLine` | function | The selected command, never an execution: the host supplies the hook policy's session gates |
| `readFileDocument` | function | The file source as one document: the base then the drop-ins merged; a part that is not a JSON object fails the whole source (its issue names that part) |
| `readHelperOutput` | function | What the helper's output comes to |
| `readManagedMcpFile` | function | The file's text: "the same format as a project `.mcp.json` file" (a `mcpServers` wrapper; the reader of `.mcp.json` also takes the bare map) |
| `readManagedMcpServers` | function | The servers the organization provides through `managedMcpServers`: the managed layers' entries (`managedServerEntries` |
| `readMcpLoadSettings` | function | `allowAllClaudeAiMcps` is "read... only from admin-controlled policy tiers" and among the keys "read from every admin source" |
| `readOutputStyleSetting` | function | The output style named by the highest file; `undefined` selects the default style |
| `readPolicyHelper` | function | Reads the key's value |
| `readProcessWrapper` | function | The per-session launcher, ignored on Windows |
| `readProjectToggles` | function | The two lists of one project's entry in the state file `~/.claude.json`, already parsed |
| `readSettingsLayer` | function | An absent source (`undefined`) is an empty layer; a document that is no JSON object is skipped |
| `readsManagedSettingsAt` | function | Whether Claude Code reads `path` as the managed settings file of `platform` |
| `readSubagentStatusLine` | function | `subagentStatusLine` with the plugins' defaults below every settings source, under the same gates as `statusLine`. statusline.md, "Subagent status lines" |
| `readSubagentStatusRows` | function | The rows a `subagentStatusLine` command rewrote, by task id: each `{"id","content"}` line's body as printed (ANSI and OSC 8 kept), `''` hiding the row; a row it does not name keeps the default. statusline.md, "Subagent status lines" |
| `readSurfaceLocks` | function | What the value of `strictPluginOnlyCustomization` locks: `true` locks all four kinds, an array locks the kinds it names, and anything unset locks nothing |
| `readTeammateMode` | function | The teammate display mode: a file's value, else `legacy` from `~/.claude.json`, else `"in-process"` |
| `readThemeSetting` | function | The theme: the highest file that sets it, else `legacy` (a value "in `~/.claude.json` from an older version applies when no settings file sets it"), else `"dark"` |
| `readWorktree` | function | Reads the `worktree` settings with their defaults |
| `reconcileManagedServers` | function | What a running session does when the provided servers change: "Add a server: Claude Code connects it when the updated settings arrive, without a restart" |
| `RegisteredMarketplaces` | type | The marketplaces registered on the machine: name to the source each was registered from |
| `RegisteredVerdict` | type | What `MarketplaceGate.checkRegistered` returns; What `MarketplaceGate.checkMissing` returns |
| `Registration` | type | What `MarketplaceRegistry.registrations` returns |
| `RegistrationStatus` | type | - `register`: the host adds the marketplace from this entry. - `ignoredUntrusted` |
| `RegistryContext` | type | What the registry needs from the host, as plain data and one injected check |
| `registryPath` | function | The registry path of a hive's policy value, as `/status` and errors write it |
| `RelayOutcome` | type | What `PermissionRelay.verdict` returns |
| `RelayToolCall` | type | The `call` argument of `PermissionRelay.open` |
| `RepairKind` | type | One of `REPAIR_KINDS` |
| `RepositoryFacts` | type | What the host found about the git repository the session starts in |
| `rereadDue` | function | Whether Claude Code reads the mechanism again now: on its poll interval, or when its file changes |
| `RereadFacts` | type | The `facts` argument of `rereadDue` |
| `ResolvedPolicy` | type | What `resolvePolicy` returns |
| `resolveEnv` | function | The environment of a session: the shell's, with the `env` of the settings files written over it, "the highest-precedence one" for a variable more than one file sets |
| `ResolveInput` | type | The `input` argument of `resolvePolicy` |
| `resolvePolicy` | function | Every area of the settings policy over one set of layers, so a host builds the view once and each area reads its keys through it |
| `resolveSessionValue` | function | The value a session uses: the first source that has one |
| `resolveSettingsEnv` | function | The variables of the layers' `env` blocks that reach the environment |
| `retentionValueApplies` | function | At startup on the cache: an invalid retention value "stays in the cached copy and is never applied" |
| `RuleEntry` | type | A rule as written in a settings file, with the file's scope |
| `runPolicyHelper` | function | Runs the helper with no arguments and `CLAUDE_CODE_VERSION` set, within `timeoutMs` counted from the file check (the check and the run share one budget) |
| `runSubagentStatusLine` | function | Runs the selected `subagentStatusLine` once through the `CommandRunner` (`bash`, from `input.cwd`, the host's env, the input on stdin) and reads its rows; a run that does not exit 0 rewrites none |
| `ScopeRule` | type | One of `SCOPE_RULES` |
| `ScopeTrust` | type | Whether the user trusts the folder a file of this scope belongs to (the host asks the dialog's record) |
| `SDK_SETTING_SOURCES` | constant | The settings files an Agent SDK app chooses among with `settingSources` |
| `SdkSettingSource` | type | One of `SDK_SETTING_SOURCES` |
| `senderAllowed` | function | A message passes when its sender is on the list, whatever room it came from |
| `SERVER_CHANGE_TIMINGS` | constant | When a change of server-managed settings applies |
| `ServerChange` | type | The `change` argument of `serverChangeTiming` |
| `serverChangeTiming` | function | When a server-managed change applies |
| `ServerChangeTiming` | type | One of `SERVER_CHANGE_TIMINGS` |
| `serverEnabled` | function | Whether the project's lists leave the server on |
| `ServerFetch` | type | What one fetch of server-managed settings came to: the policy it delivered, or a failure |
| `SESSION_OVERRIDES` | constant | The keys with a per-session override, each with its sources highest first |
| `SessionInput` | type | The `input` argument of `OverrideSource.read`; The `input` argument of `OverrideSource.admit` |
| `SessionValue` | type | What `resolveSessionValue` returns |
| `SettingsDirectory` | type | A `permissions.additionalDirectories` entry and the file it came from |
| `SettingsEdit` | type | The `edit` argument of `editEffect` |
| `SettingsEnv` | type | The `settings` field of `HookEnvironment`; What `resolveSettingsEnv` returns |
| `SettingsEnvContext` | type | What `resolveSettingsEnv` asks the host about its machine |
| `SettingsFile` | type | One settings file, as the layers order them: two files of one scope have two positions |
| `SettingsHookScope` | type | Where `settings` hooks are read from: the `--settings` file and the SDK `settings` option count as the user's own |
| `SettingsKey` | type | A key the layers combine by name: a policy key or one of the general keys |
| `settingsLocations` | function | The paths of the settings files of a session |
| `SettingsLocations` | type | What `settingsLocations` returns |
| `SettingsLocationsInput` | type | Where Claude Code looks for the settings files and for output styles |
| `SettingsRule` | type | Which settings files contribute permission rules and directories: `allowManagedPermissionRulesOnly`, the policy an embedding host passes and workspace trust |
| `SettingsSources` | type | Where a host's settings come from |
| `SHELL_DISABLED_MARKER` | constant | The text that takes the place of an inline command |
| `SHELL_ORIGINS` | constant | Where a skill or custom command comes from, for the one question inline shell asks |
| `ShellOrigin` | type | One of `SHELL_ORIGINS` |
| `shellVerdict` | function | What the skills expansion does with the `` !`cmd` `` and ` ```! |
| `ShellVerdict` | type | What `shellVerdict` returns; What `SkillSettingsPolicy.shell` returns |
| `shouldAddGitExclude` | function | Whether Claude Code adds `LOCAL_FILE_IGNORE_ENTRY` now: "The first time Claude Code writes the file in a git repository that doesn't already ignore it" |
| `SideloadFacts` | type | What the command line and environment of a session carry |
| `sideloadVerdict` | function | What the session does with its flags and the plugin-folder variable under managed `disableSideloadFlags` |
| `SideloadVerdict` | type | What `sideloadVerdict` returns |
| `SKILL_OVERRIDE_STATES` | constant | The states a `skillOverrides` entry takes |
| `SkillPolicyContext` | type | What the host tells the skill policy besides the layers |
| `skillsDirCause` | function | Why the skills directory is blocked, as the notice names it |
| `SkillsDirCause` | type | Where the cause of a skipped skills-directory plugin lies |
| `skillsDirectoryBlockedMessage` | function | The refusal of `claude plugin init` or `enable` on a skills-directory plugin while policy blocks them |
| `SkillsDirVerdict` | type | Whether skills-directory plugins (`@skills-dir`) load, and the list that stops them |
| `SkillSettingsPolicy` | type | The skill keys of the settings as one object over a view |
| `SkillsOrigin` | type | Which origins each locked surface still loads |
| `SkillSubject` | type | What the host knows about the skill it asks for |
| `skillVisibility` | function | What `skillOverrides` does to one skill; a plugin skill and a skill with no entry are `on` |
| `SkillVisibility` | type | What a state does to one skill |
| `SkippedPolicyMod` | type | The `skipped` field of `ModOrderResult` |
| `SOURCE_TRAITS` | constant | The traits of each managed settings source: rank, form and label |
| `SourceRead` | type | What the host found at one source |
| `sourcesLoadedBy` | function | The managed sources a surface loads, given its setting sources |
| `SourceTraits` | type | The traits of one managed settings source |
| `SourceVerdict` | type | What `MarketplaceGate.check` returns |
| `SPECS` | constant | Every key the layers combine by name, with the row that says how |
| `StartingMode` | type | What `PermissionsPolicy.startingMode` returns |
| `StartInput` | type | What the host knows of the launch and the session |
| `StartSource` | type | Why the session starts in the mode it does |
| `StartupFetch` | type | What `startupFetchOf` returns |
| `StartupFetchFacts` | type | The `facts` argument of `startupFetchOf` |
| `startupFetchOf` | function | What startup does about the fetch: `true` blocks until a fresh fetch and exits on failure; unset does not block, though a sign-in startup waits up to five seconds |
| `SubagentLineRead` | type | The subagent status line that runs: a settings source's (with its scope) or a plugin's default |
| `subagentStatusLineInput` | function | The stdin object of one refresh tick: the base hook fields, `columns` and `tasks`, each row's `tokenSamples` cut to its last 16 readings |
| `SubagentStatusLineInput` | type | What `subagentStatusLineInput` returns: the SDK's `BaseHookInput` with `columns` and `tasks` |
| `SubagentStatusLineRun` | type | The `run` argument of `runSubagentStatusLine`: the input and the whole environment of the process |
| `SubagentStatusTask` | type | One entry of `tasks` (statusline.md, "Task fields"); the SDK has no type for it |
| `suggestionMarketplaces` | function | The names of `pluginSuggestionMarketplaces` that take effect, in the order the list gives them |
| `SurfaceLocks` | type | The kinds of customization the lock covers, and how many names in the list were no kind |
| `SymlinkFacts` | type | The `facts` argument of `symlinkVerdict` |
| `symlinkVerdict` | function | A managed file deployed as a symbolic link |
| `SymlinkVerdict` | type | What `symlinkVerdict` returns |
| `SYMPTOM_CHECKS` | constant | What to check first, per symptom |
| `syncDecision` | function | Whether Claude Code syncs and loads the plugins of the claude.ai account |
| `SyncDecision` | type | What `syncClaudeAiPlugins` asks the host to do; the host does the I/O |
| `SyncInstallWait` | type | The wait before the first query in a non-interactive run |
| `syncPluginInstall` | function | `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` in non-interactive mode waits for installation; `CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS` bounds the wait |
| `syncSkillsDecision` | function | Whether Claude Code syncs and loads the skills of the claude.ai account |
| `TEAMMATE_MODES` | constant | The values of `teammateMode` |
| `TeammateMode` | type | One of `TEAMMATE_MODES` |
| `telemetryOptedOut` | function | Whether telemetry is off |
| `THEME_PRESETS` | constant | The interface keys that pick one value from a closed set: `theme` and `teammateMode` (`teammateMode`), plus `outputStyle` |
| `ThemeChoice` | type | The theme a session shows: a preset, or a custom one of `~/.claude/themes/` or of a plugin |
| `ThemePreset` | type | One of `THEME_PRESETS` |
| `ToggleSubject` | type | What a toggle applies to: the six scopes, and the built-in servers, which the docs split by their default (`computer-use` "defaults to off") |
| `trustWarning` | function | The trust warning `/plugin` shows before a plugin installs |
| `UNENFORCEABLE_REQUESTS` | constant | The requests of security reviews that have no dedicated key |
| `UnenforceableRequest` | type | One of `UNENFORCEABLE_REQUESTS` |
| `UNREADABLE_CAUSES` | constant | Why a document exists and could not be read: "the operating system denied the read" or any other failure |
| `UnreadableCause` | type | One of `UNREADABLE_CAUSES` |
| `UnreadableRead` | type | A source that exists and could not be read: the cause and the underlying error's text |
| `userSettingsFile` | function | The user file, `~/.claude/settings.json` or the one under `CLAUDE_CONFIG_DIR` |
| `ValueOf` | type | What `get` returns for a key: the policy key's own `Settings` type or the general key's |
| `ValueSpec` | type | What the kit knows about each policy key, one row per key, from its entry in settings-reference.md |
| `Variables` | type | The `shell` field of `EnvInput`; The `launchEnvironment` field of `EnvInput` |
| `WholePluginFacts` | type | The `facts` argument of `wholePluginRoutes` |
| `wholePluginRoutes` | function | Through an allowed marketplace, or for one session with `--plugin-dir` "unless your administrator has also turned off that flag" |
| `withHelperSettings` | function | The managed tier after a policy helper emitted `managedSettings` |
| `WORKFLOW_SIZES` | constant | The values of `workflowSizeGuideline` |
| `WorkflowPolicyContext` | type | What the host tells the workflow keys besides the layers |
| `WORKFLOWS_OFF_BY` | constant | What can turn workflows off, in the order a decision lists them |
| `WorkflowsContext` | type | What the host tells the workflow keys besides the layers: plain data, the kit reads no `process.env` |
| `workflowsDecision` | function | Whether dynamic workflows are on: off by `disableWorkflows`, by `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, by the organization's policy or by `enableWorkflows: false` |
| `WorkflowsDecision` | type | What `workflowsDecision` returns; What `WorkflowSettingsPolicy.enablement` returns |
| `WorkflowSettingsPolicy` | type | The workflow keys of the settings as one object over a view |
| `workflowSize` | function | The size guideline in force: a value in a settings file, else the `/config` choice, else the default (`medium`, `small` on Pro) |
| `WorkflowSize` | type | The `workflowSizeChoice` field of `PolicyContext`; The `configChoice` field of `WorkflowSizeContext` |
| `WorkflowSizeContext` | type | What the host tells the size guideline besides the layers |
| `WorkflowSizeDecision` | type | What `WorkflowSettingsPolicy.size` returns; What `workflowSize` returns |
| `WorkflowSizeSource` | type | Where the size in force comes from |
| `WorkflowsOffBy` | type | One of `WORKFLOWS_OFF_BY` |
| `WorkflowsOnBy` | type | What turned workflows on, when nothing turned them off |
| `WorkflowSurfaces` | type | What workflows take with them when they are off |
| `WORKTREE_CONSUMERS` | constant | Who creates a worktree |
| `WorktreeConsumer` | type | One of `WORKTREE_CONSUMERS` |
| `worktreeFolder` | function | The folder worktrees go in instead of `<project-root>/.claude/worktrees/`, or `undefined` for the project's own |
| `WorktreeFolderFacts` | type | The `facts` argument of `worktreeFolder` |
| `WorktreeSettings` | type | The `worktree` block: the fields as the files combine them, with the documented default of each |
| `WRITE_TARGET` | constant | The settings file each write trigger writes to |
| `WRITE_TRIGGERS` | constant | What makes Claude Code write a settings file, and which one |
| `WriteTrigger` | type | One of `WRITE_TRIGGERS` |
| `wslChain` | function | The managed documents a WSL session composes, with the Windows ones when `wslInheritsWindowsSettings` allows |
| `WslChain` | type | What `wslChain` returns |
| `WslDocuments` | type | `wslInheritsWindowsSettings`: which documents a WSL session composes |
