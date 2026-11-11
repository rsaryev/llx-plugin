# `@rsaryev/llx-plugin/loading`

Loading a plugin: its components, repository plugins and workspace trust, variable substitution, and its MCP servers, LSP servers and monitors.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `attemptWithHeadersHelper` | function | One call or one connection with a helper: `produce` runs the helper fresh and gives the headers it printed (`runMcpHeadersHelper`'s output |
| `binPathEntries` | function | The absolute `bin/` directory of a plugin, only when it has one ("while the plugin is enabled") |
| `ChannelResolution` | type | What `resolveChannel` returns |
| `classifyPluginFolder` | function | Judgment: the docs name the rule, not its edges |
| `COMBINE` | constant | How a manifest key combines with the default folder: replace, add or merge |
| `COMPONENT_CHECKS` | constant | The checks of the other components: `/mcp` for a server, the debug log for a hook |
| `COMPONENT_LIMITS` | constant | One limit per component kind, typed over the layout's kinds so a new kind must say what a repository may do with it |
| `COMPONENT_READERS` | constant | The integration seam of loading: one reader per component kind, typed over the kinds, so a kind added to the layout fails the typecheck until it has one |
| `ComponentLimit` | type | The limit of one component kind over a plugin; a kind the docs do not limit returns it as it is |
| `ComponentRead` | type | What reading one component gives: the value, the issues and whether it rejects the plugin |
| `ComponentReader` | type | Reads one component kind of a plugin |
| `ComponentValues` | type | What each component kind loads into |
| `ComponentVariables` | type | The fields of a component that are substituted and the variables exported to it |
| `configDirectory` | function | "Your configuration directory, `~/.claude` unless you set `CLAUDE_CONFIG_DIR`." |
| `ConfigInput` | type | A hooks, LSP or monitors source: a file to read or a value written in the manifest |
| `connectionHeaders` | function | Names compare without regard to case |
| `ConnectionHeaders` | type | What `connectionHeaders` returns |
| `Consent` | type | What a gate asks of the user before the content takes effect |
| `CONTENT_GATES` | constant | One row per kind of content |
| `contentGate` | function | Whether repository content of a kind loads in a trust situation |
| `ContentGate` | type | What `contentGate` returns |
| `DebugFacts` | type | The `facts` argument of `pluginDebugSteps` |
| `DebugPlace` | type | Where the command is typed: "In your shell" or "in the running session" |
| `DebugStep` | type | What `pluginDebugSteps` returns |
| `decideRepositoryPlugin` | function | Whether a repository plugin loads, why not, and which checkout it is read from |
| `DeepSubstituted` | type | What `substituteDeep` returns |
| `DidChangeConfiguration` | type | What `didChangeConfigurationOf` returns |
| `didChangeConfigurationOf` | function | The notification that carries `settings` ("Settings sent by `workspace/didChangeConfiguration`") |
| `DirectoryKind` | type | The kinds of working directory the "Where the helper runs" table names |
| `discoverComponents` | function | Finds every component of a plugin folder through `PluginFiles` alone |
| `Discovered` | type | The `bin` field of `ComponentValues`; What `discoverComponents` returns |
| `DiscoveredFile` | type | What discovery finds: paths and names only, no file is parsed (the readers do that), so what the layout puts where can be proven apart from what a skill |
| `distribution` | function | How a plugin's `bin` folder is distributed to a target |
| `Distribution` | type | What `distribution` returns |
| `DISTRIBUTION_TARGETS` | constant | Where a plugin can be installed: Claude Code and the two hosted surfaces the docs name |
| `DistributionTarget` | type | One of `DISTRIBUTION_TARGETS` |
| `EnvironmentExpansion` | type | The `environment` field of `FieldPolicy` |
| `explainRepositoryPlugin` | function | The decision of `decideRepositoryPlugin` and, when the plugin did not load, every cause in words |
| `exportedEnvironment` | function | The environment variables a component's process receives (the "Exported to the process" column): the host adds them to the process it starts |
| `ExportedVariable` | type | The `exported` field of `ComponentVariables` |
| `FieldPolicy` | type | What one field accepts: the differences the docs list per plugin component |
| `FOLDER_ORIGINS` | constant | Where a folder plugin comes from: a skills directory or a `--plugin-dir` directory |
| `FolderOrigin` | type | One of `FOLDER_ORIGINS` |
| `FolderPlugin` | type | The `plugin` field of `FolderProbe` |
| `FolderProbe` | type | What `probeFolder` returns |
| `HEADERS_HELPER_GUARD` | constant | An MCP `headersHelper`, which runs through a shell |
| `HEADERS_HELPER_ORIGINS` | constant | Where an MCP server was configured, as far as its `headersHelper` is concerned |
| `HeadersHelperOrigin` | type | One of `HEADERS_HELPER_ORIGINS` |
| `HeadersHelperPlan` | type | What `planHeadersHelper` returns |
| `HelperAttempt` | type | How an attempt ended |
| `HelperContext` | type | What the plan reads from the host: the environment it inherits and the directories it picks from |
| `HelperNotice` | type | The `notice` field of `HelperSkipped` |
| `HelperNotLoaded` | type | An agent file's server in a folder that is not trusted: not loaded, so nothing connects |
| `HelperOutput` | type | What one run of the helper gives: the headers to send, or why there are none |
| `HelperRun` | type | The `plan` argument of `runMcpHeadersHelper`; What `runPolicyHelper` returns |
| `HelperServer` | type | The server a helper belongs to: the name Claude Code shows, its URL as expanded, and the command |
| `HelperSkipped` | type | The server connects with its static `headers` alone; `notice` is the refusal a trust gate prints |
| `HelperTrust` | type | The `trust` argument of `planHeadersHelper` |
| `HOOK_GUARD` | constant | A shell-form hook `command`, which runs through a shell |
| `HookCommandHandler` | type | A `command` hook handler, as the official type has it |
| `HookCommandOptions` | type | The `options` argument of `resolveHookCommand` |
| `HookCommandResolution` | type | What `resolveHookCommand` returns |
| `initializeOptionsOf` | function | The part of the `initialize` request params this config decides: "Options sent in the initialize request" |
| `InvokedSkill` | type | A skill that ran, as the session knows it (`SessionSkill`): its plugin and every name that invokes it |
| `languageIdFor` | function | The server and language ID for a file: "each file extension gets one server" and "the first registered handles those files" |
| `LanguageRoute` | type | What `languageIdFor` returns |
| `Limited` | type | A plugin after the limits of its kind, what they said and the servers that wait for approval |
| `limitRepositoryPlugin` | function | Applies every component kind's limit to a loaded plugin |
| `LoadedPlugin` | type | The result of `loadPlugin`: a plugin that loads, and everything found wrong or worth a warning |
| `loadPlugin` | function | Loads a plugin folder into a typed `Plugin`: the optional manifest, every component in the standard layout and the manifest's paths, each reader's issues collected |
| `LoadPluginInput` | type | The `input` argument of `loadPlugin`; The `input` argument of `loadRepositoryPlugin` |
| `loadRepositoryPlugin` | function | `loadPlugin` for a plugin of that origin, limits applied |
| `LocalSettingsFacts` | type | The `facts` argument of `localSettingsVerdict` |
| `localSettingsVerdict` | function | Whether a folder's local settings load, given its trust |
| `LocalSettingsVerdict` | type | What `localSettingsVerdict` returns |
| `locationsWithoutPlugin` | function | Judgment: a handler of no plugin (a settings file's) has no plugin folder and no data folder |
| `lspExtensionConflicts` | function | The warning components.md quotes for a server that loses an extension to an earlier one: `LSP server "<name>" is not used for <ext> files` |
| `LspProcessPlan` | type | The `process` field of `LspStartupPlan` |
| `LspResolution` | type | What `resolveLspServer` returns |
| `lspRestartDecision` | function | Whether a crashed server is restarted |
| `LspStartupPlan` | type | What `planLspStartup` returns |
| `manualTrustEntry` | function | The entry that trusts a folder without the dialog: `projects["<path>"].hasTrustDialogAccepted` set to `true` in `~/.claude.json`, `<path>` being the key |
| `McpBundle` | type | What `McpBundleReader.open` returns |
| `McpBundleReader` | type | The host's MCP bundle opener |
| `McpBundleServer` | type | The server config the host read from a bundle, already mapped from the MCPB manifest |
| `McpBundleSource` | type | Where an MCP bundle comes from: a path inside the plugin (relative to the plugin root, `/`-separated, no `./`) or an `https://` URL |
| `McpResolution` | type | What `resolveMcpServer` returns |
| `mcpServerKey` | function | `plugin:<plugin>:<server>` |
| `mergeHooks` | function | Joins the hooks of `hooks/hooks.json` and of the `hooks` manifest key; both load |
| `MONITOR_GUARD` | constant | A monitor `command`, which runs through a shell |
| `MonitorEvent` | type | What can start a monitor: a session starting, plugins reloading, or a skill running |
| `MonitorMode` | type | Whether the host runs a person's session; plugin monitors start only in an interactive one |
| `MonitorResolution` | type | What `resolveMonitor` returns |
| `MonitorStopEvent` | type | What can stop the monitors a session started |
| `monitorsToStart` | function | The monitors an event starts |
| `monitorsToStop` | function | Already running monitors survive disabling a plugin; only session end stops them |
| `NO_PROGRAM` | constant | What the hook's error says: the docs' sentence first, then the fixes |
| `onlyQuotedStrings` | function | Whether a command is only quoted strings, which PowerShell does not run |
| `OPTION_VARIABLES` | constant | The name of the option variables, `CLAUDE_PLUGIN_OPTION_<KEY>`, as the table writes it |
| `optionEnvName` | function | The process variable a hook reads an option from: `api_token` is `CLAUDE_PLUGIN_OPTION_API_TOKEN` |
| `PathRendering` | type | How a path variable is written into the text |
| `pathWithPluginBins` | function | The `PATH` entries with plugin `bin/` directories added |
| `persistedTrust` | function | "Set `projects["<path>"].hasTrustDialogAccepted` to `true` in `~/.claude.json`": that folder's persisted trust, read from the parsed file |
| `planHeadersHelper` | function | What to do with a server's `headersHelper` each time the server connects: where to run it, with what environment, or that it does not run |
| `planLspStartup` | function | Process lookup is a host fact |
| `planPluginScaffold` | function | The plan, or why the name cannot be a plugin's |
| `Plugin` | type | A plugin as loading found it |
| `PLUGIN_VARIABLES` | constant | The three path variables Claude Code provides to plugin components |
| `pluginDataId` | function | The `<id>` of `~/.claude/plugins/data/<id>/`: the plugin identifier with every character other than a letter, digit, `_` or `-` replaced by `-` |
| `pluginDebugSteps` | function | The ordered checks; the last applies only to a plugin in a skills directory |
| `PluginDirectoryReading` | type | What `readPluginDirectory` returns; The `reading` argument of `pluginFoldersOf` |
| `PluginFolderKind` | type | What a folder passed as `--plugin-dir` is |
| `PluginTextFile` | type | A skill, command, agent or output style as loading finds it: its path, its name inside the plugin and its text |
| `PluginTheme` | type | A theme file of the plugin, read: it appears in `/theme` under the file's `name` (`theme.name`, else the slug), marked as from the plugin |
| `PluginVariable` | type | One of `PLUGIN_VARIABLES` |
| `PluginWorkflow` | type | A workflow script of the plugin, its `meta` block read without running it |
| `prepareContentSubstitution` | function | `substituteContent` for a host that reads a body synchronously (a lazily loaded skill) |
| `probeFolder` | function | Probes one folder |
| `PROJECT_PERMISSION_ENTRIES` | constant | The kinds of entry a project settings file's `permissions` holds, and whether each grants capability |
| `projectEntryApplies` | function | Whether a project settings entry that grants capability (`permissions.allow`, `additionalDirectories`) applies before the folder is trusted |
| `ProjectPermissionEntry` | type | One of `PROJECT_PERMISSION_ENTRIES` |
| `ReaderContext` | type | What a component reader is given: the folder, the manifest and what discovery found |
| `ReadKind` | type | A component kind a reader reads |
| `readPluginDirectory` | function | A folder passed as `--plugin-dir` and the plugins it loads |
| `referencesUserConfig` | function | True when a template references `${user_config.*}` |
| `rejectUserConfigInShell` | function | The error for a template that references `${user_config.*}`, or `undefined` when it does not |
| `REPOSITORY_CONTENT` | constant | What runs before a folder is trusted: one row of the docs' table per kind of repository content, with the two situations in which the folder itself is not trusted |
| `REPOSITORY_ORIGINS` | constant | The places a repository-supplied (or user-skills-folder) plugin comes from |
| `REPOSITORY_REASONS` | constant | Why repository content is trusted or not |
| `repositoryCauses` | function | The causes that apply to these facts, in the order of `CHECKS` |
| `RepositoryContent` | type | One of `REPOSITORY_CONTENT` |
| `RepositoryDecision` | type | What `decideRepositoryPlugin` returns; The `decision` field of `RepositoryExplanation` |
| `RepositoryExplanation` | type | What `explainRepositoryPlugin` returns |
| `repositoryLoadInput` | function | The input to load a plugin of that origin with: a repository plugin never gets the host's bundle reader, so a bundle is skipped and says why |
| `RepositoryOrigin` | type | One of `REPOSITORY_ORIGINS` |
| `RepositoryPluginFacts` | type | What the host knows about the session and the folder |
| `RepositoryReason` | type | One of `REPOSITORY_REASONS` |
| `RepositorySource` | type | Where the plugin's files are read from |
| `resolveChannel` | function | Resolves one channel against the plugin's servers. "Saved values substitute into `${user_config.KEY}` references in the server's `env`" |
| `ResolvedChannel` | type | A channel of a plugin as the dialog and the host need it |
| `ResolvedHookCommand` | type | A command hook ready for the host's `CommandRunner` |
| `ResolvedKind` | type | One kind of process: what starts, by name for servers, and why the others do not |
| `ResolvedLspServer` | type | An LSP server config resolved for this host |
| `ResolvedMcpServer` | type | A plugin's MCP server config resolved for this host |
| `ResolvedMonitor` | type | A monitor resolved for this host |
| `ResolvedProcesses` | type | The long-running processes a plugin declares, resolved for this host: MCP servers, language servers and monitors |
| `ResolvedUserConfig` | type | What the user (or the host) saved for a plugin's `userConfig` options |
| `resolveHookCommand` | function | Resolves one command hook |
| `resolveLspServer` | function | Resolves one server of a plugin: `command`, `args`, `env` and `workspaceFolder` are substituted |
| `resolveLspServers` | function | Resolves the variables of a plugin's LSP servers |
| `resolveMcpServer` | function | Resolves one server of a plugin. stdio: `command`, `args` and `env` are substituted and the process gets the three path variables. http, sse and ws |
| `resolveMcpServers` | function | The plugin's MCP servers |
| `resolveMonitor` | function | Resolves one monitor of a plugin |
| `resolveMonitors` | function | Resolves the variables of a plugin's monitors |
| `resolveProcesses` | function | Resolves the variables of a plugin's MCP servers, LSP servers and monitors |
| `RestartDecision` | type | The parts of an LSP server's runtime the kit decides as pure functions over data |
| `runMcpHeadersHelper` | function | Runs the planned command in a shell (`bash` |
| `SCAFFOLD_SCOPES` | constant | Where the plugin folder goes: the personal skills directory, or a project's |
| `ScaffoldFile` | type | The `files` field of `ScaffoldPlan` |
| `ScaffoldInput` | type | The `input` argument of `planPluginScaffold` |
| `ScaffoldPlan` | type | What `planPluginScaffold` returns |
| `ScaffoldScope` | type | One of `SCAFFOLD_SCOPES` |
| `scrubEnvironment` | function | The environment a subprocess gets: `snapshot` with the credentials the scrub removes taken out and the userinfo cut from registry URLs |
| `ScrubOptions` | type | The `options` argument of `scrubEnvironment` |
| `SENSITIVE_PLACEHOLDER` | function | What stands for a sensitive value in skill, command and agent content, where "a sensitive value there becomes a placeholder" |
| `settingsHooksMayRun` | function | Whether hooks of a settings file may run: the trust table's `settings-hooks` row |
| `ShellGuard` | type | A field whose value is passed to a shell refuses `${user_config.*}` |
| `ShellPaths` | type | The two ways a string a shell parses carries a path variable (`SubstitutionScope.shellPaths`) |
| `SkillsDirBlock` | type | What stops skills-directory plugins in managed settings |
| `skillsDirCommands` | function | The commands of a skills-directory plugin |
| `SkillsDirFolder` | type | The `folder` argument of `skillsDirCommands` |
| `skillsDirPluginEnabled` | function | Whether a skills-directory plugin is on: "The manifest's `defaultEnabled`, unless a settings file sets `<name>@skills-dir` to `true` or `false`." |
| `skillTriggerNames` | function | The names a monitor of plugin `pluginId` may write after `on-skill-invoke:` for this skill: none unless the skill is that plugin's own |
| `subprocessScrubEnabled` | function | Whether the snapshot turns the scrub on: an on/off variable (`format/env-flag`) |
| `substituteContent` | function | Substitutes `${...}` in the Markdown body of a skill, command or agent |
| `Substituted` | type | What `prepareContentSubstitution` returns; What `substituteContent` returns |
| `substituteDeep` | function | Substitutes every string of a JSON value (an MCP server's `args` and `env`, an LSP server), each with the policy of its path; numbers, booleans and `null` stay |
| `Substituter` | type | The `substitution` argument of `exportedEnvironment` |
| `substituteSurface` | function | `substituteTemplate` with the policy of a surface in this scope |
| `substituteTemplate` | function | Substitutes the variables of one template under a field policy |
| `SUBSTITUTION_SURFACES` | constant | Where a string is substituted, finer than a component where the docs split one |
| `SubstitutionScope` | type | What a plugin's `${...}` references resolve against |
| `SubstitutionSurface` | type | One of `SUBSTITUTION_SURFACES` |
| `SURFACE_COMPONENT` | constant | The component whose row of the table each surface belongs to |
| `SURFACE_POLICY` | constant | The differences between surfaces, from the docs: - `${user_config.*}`: exec-form `args`, MCP config, LSP config (manifest-reference, "Reference a saved value") |
| `TokenReference` | type | What a template referenced, in order of first appearance, once each |
| `TRUST_SITUATIONS` | constant | The columns of the table, and the folder's other states |
| `TRUST_SOURCES` | constant | How a folder came to be trusted |
| `trustDialogListing` | function | What the dialog lists "so you can review them first": the rules and directories the folder would grant |
| `TrustFacts` | type | The `facts` argument of `workspaceTrustKey`; The `facts` argument of `workspaceTrustState` |
| `TrustKey` | type | What `workspaceTrustKey` returns |
| `TrustStateOptions` | type | The `options` argument of `workspaceTrustState` and `workspaceTrustSituation` |
| `trustSituation` | function | Which column of the trust table applies to a folder: trusted, parent-trusted, non-interactive or untrusted |
| `TrustSituation` | type | One of `TRUST_SITUATIONS` |
| `TrustSituationFacts` | type | The `facts` argument of `trustSituation` |
| `TrustSource` | type | One of `TRUST_SOURCES` |
| `untrustedWorkspaceWarning` | function | The warning for project allow rules or additional directories a folder that is not trusted cannot supply |
| `UserConfigPolicy` | type | Which `${user_config.KEY}` values a field takes |
| `UserConfigValue` | type | One saved `userConfig` option value, as the SDK types `Settings.pluginConfigs[id].options[key]` (a string, number, boolean or list of strings) |
| `validatePlugin` | function | `claude plugin validate <dir>` over a folder |
| `ValidatePluginInput` | type | The `input` argument of `validatePlugin` |
| `validateUserConfigValues` | function | One error per declared option whose value would not be accepted: `userConfig.<key>` |
| `VALIDATION_TARGETS` | constant | What `validatePlugin` looked at: the folder's marketplace, its plugin, only its components, or nothing it knows |
| `ValidationReport` | type | What `validatePlugin` returns |
| `ValidationTarget` | type | One of `VALIDATION_TARGETS` |
| `ValuePath` | type | The `policyFor` argument of `substituteDeep` |
| `VARIABLE_COMPONENTS` | constant | The table "Where each variable resolves": per plugin component, the fields where `${...}` resolves inline and what the process receives in its environment |
| `VARIABLE_FIELDS` | constant | The substituted fields and exported variables of each component |
| `VariableComponent` | type | One of `VARIABLE_COMPONENTS` |
| `VariableField` | type | A field `${...}` resolves in; `body` is "anywhere in the Markdown body" |
| `WorkspaceTrust` | type | Whether the user accepted the workspace trust dialog for a folder |
| `workspaceTrustKey` | function | The key workspace trust is stored under: the git repository root in a repository, else the folder |
| `workspaceTrustSituation` | function | `workspaceTrustState` for a host that knows synchronously whether the dialog was accepted for a folder: the same column, the same folders asked |
| `workspaceTrustState` | function | The folder's column of the trust table (`trustSituation`) from what the port answers: `trusted` when the dialog was accepted for the key |
