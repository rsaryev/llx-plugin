# `@rsaryev/llx-plugin/format`

The reader of every plugin file: manifest, marketplace, skills, agents, hooks, MCP and LSP configs, output styles, themes and mod files.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `AGENT_COLORS` | constant | The values of an agent's `color` field |
| `AGENT_FIELD_NAMES` | constant | The 19 frontmatter fields of a subagent file, in the table's order |
| `AGENT_FIELDS` | constant | The registry: one spec per field name, so a field added to the table fails the typecheck here |
| `AGENT_ISOLATIONS` | constant | The values of an agent's `isolation` field: only `worktree` |
| `AGENT_MEMORY_SCOPES` | constant | The values of an agent's `memory` field: `user`, `project` or `local` |
| `AGENT_SOURCES` | constant | Where an agent file comes from, in priority order |
| `AgentCoercer` | type | The coercer of a field: `path` is the agent file, for the issues it reports |
| `AgentColor` | type | One of `AGENT_COLORS` |
| `agentDescriptionsOverLimit` | function | The startup notice when the agents' names and descriptions exceed 15,000 tokens |
| `AgentDraft` | type | The `draft` argument of `renderAgentFile` |
| `AgentExtras` | type | Fields the official `AgentDefinition` has no key for |
| `AgentFieldName` | type | One of `AGENT_FIELD_NAMES` |
| `AgentFieldRead` | type | What one agent field read gives: its value, or `undefined` with the issues that say why |
| `AgentFieldSpec` | type | How an agent frontmatter field is read, and whether a plugin agent applies it |
| `AgentFieldValue` | type | The `read` field of `AgentFieldSpec` |
| `AgentIsolation` | type | One of `AGENT_ISOLATIONS` |
| `AgentMemoryScope` | type | One of `AGENT_MEMORY_SCOPES` |
| `AgentOrigin` | type | What a host knows about an agent file besides its text |
| `AgentReadResult` | type | What `readAgent` returns |
| `AgentRecord` | type | One agent file as Claude Code would load it |
| `AgentSource` | type | One of `AGENT_SOURCES` |
| `ANSI_COLOR_NAMES` | constant | The ANSI colour names a theme may use, plain and bright |
| `AnsiColorName` | type | One of `ANSI_COLOR_NAMES` |
| `AnsiPalette` | type | The 16 ANSI colours as `#rrggbb`, by name: what a terminal draws for `ansi:<name>` |
| `AUTO_COMPACT_RANGE` | constant | A token count in this range |
| `BASH_DENY_TURNS_OFF_POWERSHELL` | constant | The stderr warning when denying the whole Bash tool leaves a Windows session with no shell tool |
| `BodyReader` | type | Reads the body of a skill or command the catalog holds without it |
| `boundedMcpErrorText` | function | The text of an error as Claude receives it: "Error text longer than about 11,000 characters keeps only its first 5,000 and last 5,000 characters" |
| `BUILTIN_OUTPUT_STYLES` | constant | `default` and the four built-in styles, in the order output-styles.md lists them |
| `BundledSkillHead` | type | A skill the host supplies itself: Claude Code's bundled skills |
| `bundleServerOf` | function | The manifest's `${...}` variables in every string of the server: `${__dirname}`, `${HOME}`, `${/}` and `${pathSeparator}` |
| `bundleSettingKey` | function | The key a bundled server's setting has among the plugin's settings: `<server>.<key>` |
| `CacheTtl` | type | One of `CACHE_TTLS` |
| `cannotAddMcpToManagedScope` | function | `claude mcp add` and `add-json` with `--scope managed` |
| `classifyMcpSource` | function | What a manifest `mcpServers` value (or one element of an array) is, or `undefined` |
| `claudeAiConnectorsFetched` | function | `ENABLE_CLAUDEAI_MCP_SERVERS` |
| `CollectedMcpServers` | type | What `collectMcpServers` returns |
| `collectMcpServers` | function | Every server of a plugin: the root `.mcp.json` first, then each declared source in array order; a later name replaces an earlier one |
| `CollectOptions` | type | What decides containment (`platform`, `roots`), and the host's capabilities: a bundle opener (without it a bundle is a warning) and saved bundle settings |
| `Command` | type | A command file or a manifest `commands` entry |
| `CommandDraft` | type | A command file takes neither `name` nor `paths` (the reader leaves both untaken) |
| `CommandEntry` | type | The `entry` field of `PluginTextFile`; The `entry` field of `DiscoveredFile` |
| `CommandEntryContext` | type | The `ctx` argument of `readCommandEntry`; The `ctx` argument of `loadCommandEntries` |
| `CommandHead` | type | A command without its body |
| `CommandLayout` | type | The `layout` argument of `readCommand` |
| `CommandRead` | type | Commands, "the older format": a flat Markdown file that "takes the same frontmatter as skills" except `name` and `paths` |
| `ConfigFlag` | type | One `--config` flag of `claude plugin install`: a plugin option, or a setting of a bundled server |
| `configFlagApplies` | function | Whether the `--mcp-config` flag applies to an MCP bundle of this source |
| `copyOfPluginTheme` | function | "Plugin themes are read-only, so when a user edits one in `/theme`, the edit is saved as a copy in their own themes directory" |
| `CREDENTIAL_ENV_NAMES` | constant | The credential variables of mcp.md ("Credential variables that read as empty") |
| `credentialDebugLine` | function | The debug-log line for a covered variable the user has set and a remote server's `url` or `headers` references |
| `customThemeId` | function | What `/theme` stores as the preference when the theme is selected: `custom:<slug>`, or `custom:<plugin-name>:<slug>` for a plugin's theme |
| `cutMcpDescription` | function | "Claude sees only the text before the cut"; the cut keeps a surrogate pair whole |
| `DEFAULT_OUTPUT_STYLE_ID` | constant | The id Default has in the `/output-style` list |
| `DisplayedHeader` | type | One header a surface shows: its name, and its value when the scope shows it |
| `displayHeaders` | function | What `claude mcp get` shows of a remote server's headers |
| `displayReference` | function | What `/mcp`, `claude mcp list` and `claude mcp get` show of a server's URL or command line |
| `droppedServerLogLine` | function | "Claude Code drops that server and records `Invalid MCP server config for <server> in <path>` only in that debug log" |
| `editFrontmatter` | function | `text` with `changes` set in its frontmatter: a key it has keeps its place, a new one goes after the others in the order given, `undefined` removes one |
| `ELICITATION_REJECTED` | constant | The message for a Java MCP SDK server that rejects the elicitation capability |
| `EnvExpansion` | type | What `expandEnvText` returns |
| `EnvLookup` | type | The environment as a function: a name to its value, `undefined` when it is unset |
| `escapeAngleBrackets` | function | `<` and `>` in `description` and `when_to_use` "show as `&lt;` and `&gt;`" |
| `excludedToolsNotice` | function | What Claude is told about the tools Claude Code excluded: "tells Claude which tools it excluded and why, so you can ask Claude why a tool is missing" |
| `expandEnvText` | function | Expands every reference of a text in one pass: a value is never scanned again |
| `expandMcpServer` | function | A server of the local, project or user scope with its references expanded: `command`, `args` and `env` of a stdio server |
| `FIELD_READERS` | constant | One reader per documented key (K1: a registry typed over the keys, no switch) |
| `FieldOutcome` | type | What reading one skill field gives: the values and the problems |
| `FieldProblem` | type | Coercions of frontmatter values, shared by skills, commands, output styles and agents |
| `FieldRead` | type | What `readText` returns |
| `FieldReader` | type | Reads one skill frontmatter field |
| `fileToolRuleBannerRow` | function | The startup banner row for a deny or ask rule of a file tool that file checks never consult |
| `fileToolRuleWarning` | function | The full warning for such a rule: `source` is a settings file path or the flag |
| `FIXED_CREDENTIAL_NAMES` | constant | The environment variables that always hold credentials (the OpenTelemetry and custom headers) |
| `FlagAgentsRead` | type | What `readFlagAgents` returns |
| `FolderSource` | type | A component read from a scope folder (`managed`, `user`, `project`...: the scopes differ per component) |
| `Frontmatter` | type | What `parseFrontmatter` returns; The `frontmatter` field of `SkillSource` |
| `FrontmatterEdit` | type | What `editFrontmatter` returns |
| `FrontmatterState` | type | Where the frontmatter stands: - `none`: the file does not open with a `---` line, or no closing `---` follows |
| `hasAppliedSettings` | function | True when a read holds at least one applied key: `settings.json` then wins over the manifest |
| `hasUrlPassword` | function | Whether `value` holds a URL whose userinfo carries a password: "a value that looks like a credential" |
| `hookAgentType` | function | The `agent_type` hooks receive for this agent, and the value a hook matcher is matched against |
| `hookNeedsQuotes` | function | The notification for an `asyncRewake` shell-form hook whose script path has a space and no quotes |
| `HooksModules` | type | What `readHooksJsonModules` returns |
| `HooksRead` | type | Reading hook configuration: three levels of nesting, an event, its matcher groups, and each group's handlers |
| `HttpMcpServer` | type | An HTTP MCP server, with its optional `headersHelper` |
| `imageResultNote` | function | What tells Claude where the original of an image result is saved (wording is the kit's) |
| `includeCodingInstructions` | function | Whether the final prompt carries Claude Code's software engineering instructions |
| `InvocableDraft` | type | What an author sets of the shared fields: the read-only views (`frontmatter`, `undescribed`) are the reader's |
| `InvocableFrontmatter` | type | The frontmatter a skill and a command share, with the documented defaults applied |
| `InvocableHead` | type | The `invocable` field of `ResolvedFolderSkill`; The `invocable` field of `ScannedEntry` |
| `isHooksModuleName` | function | Whether a path names a mod's hooks module |
| `isModTestFile` | function | Tests `claude plugin test` runs: "files whose names end in `.test.ts` or `.test.tsx`" |
| `limitMcpResult` | function | What to do with a tool result |
| `LinkRoots` | type | The real paths (`/`-separated, one spelling) a link is judged against |
| `listablePrompts` | function | The MCP prompts a host lists, without those of the reserved server |
| `listOutputStyles` | function | What `/output-style` lists with no argument and the `/config` picker shows: Default, the built-in styles, then each custom style with its `name` and `description` |
| `LSP_FIELDS` | constant | The fourteen rows of the table |
| `LSP_TRANSPORTS` | constant | `stdio` (default) or `socket`: "Claude Code accepts `socket` but runs every server over stdio" |
| `LspConfigRead` | type | The `sources` argument of `mergeLspSources`; What `mergeLspSources` returns |
| `LspServer` | type | The `lspServers` field of `Plugin`; The `lspServers` field of `ComponentValues` |
| `LspServerRead` | type | What `readLspServer` returns |
| `LspTransport` | type | One of `LSP_TRANSPORTS` |
| `MANAGED_SETTINGS_NEED_APPROVAL` | constant | The error when a `claude plugin` command cannot ask for approval of managed settings |
| `MANAGED_SETTINGS_NOT_APPROVED` | constant | What Claude Code prints when the security approval dialog is declined |
| `manifestNotRead` | function | Where a marketplace plugin's manifest resolves when it is not inside the plugin or its marketplace |
| `ManifestResult` | type | Reading `.claude-plugin/plugin.json` as Claude Code loads it: an unrecognized top-level key is stripped with a warning |
| `MARKETPLACE_NAME_IMPERSONATES` | constant | What `claude plugin marketplace add` says for an impersonating name |
| `MARKETPLACE_NAME_LOOKS_OFFICIAL` | constant | The marketplace's own error for an imitating name |
| `marketplaceNameRefused` | function | The error of a name that imitates an official marketplace, on every plugin it affects |
| `matchesNoToolBannerRow` | function | The startup banner row for a deny or ask rule whose tool name is unknown |
| `MCP_ADD_SCOPES` | constant | `claude mcp add-json <name> '<json>'` and the part of `claude mcp add` that both share |
| `MCP_DISPLAY_SCOPES` | constant | Where a configured server comes from, as far as what the surfaces show is concerned |
| `MCP_ENV_BASELINE` | constant | Judgment: the docs say "a safe baseline environment" and do not list it |
| `MCP_FAILURE_SKIP_MS` | constant | "A connection to that server failed less than 15 minutes earlier." |
| `MCP_RESULT_SIZE_CEILING` | constant | "Up to a hard ceiling of 500,000 characters." |
| `MCP_SOURCE_KINDS` | constant | Where a plugin's MCP servers come from |
| `MCP_TOOL_NAME_LIMIT` | constant | "Claude Code leaves an MCP tool out of the tools it sends to Claude when its full name is over 128 characters." |
| `MCP_TRANSPORTS` | constant | The transport names of a server's `type`; a server without a `type` is stdio |
| `mcpAddKey` | function | How the host names a stored server for `McpAddOptions.existing`: the scope and the name, which together make "the same server name at the same scope" |
| `McpAddOptions` | type | The `options` argument of `readMcpAddJson` |
| `McpAddRead` | type | What `readMcpAdd` returns; What `readMcpAddJson` returns |
| `McpAddScope` | type | One of `MCP_ADD_SCOPES` |
| `mcpAuthRejection` | function | What an MCP server's auth rejection (by status and source) means for its connection |
| `McpAuthRejectionInput` | type | What a rejected request means for a server |
| `McpAuthState` | type | What `mcpAuthRejection` returns |
| `mcpBackgrounding` | function | `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`: "Set to `0` to turn automatic backgrounding off and, in an interactive session, to make Claude wait for MCP tasks" |
| `McpBackgrounding` | type | What `mcpBackgrounding` returns |
| `McpbManifest` | type | The `manifest` argument of `bundleServerOf`; The `manifest` argument of `requiredBundleSettings` |
| `McpbRead` | type | What `readMcpbManifest` returns |
| `McpBundleConfig` | type | A bundled server's own settings: what its bundle declares, in the plugin option shape, for a host's settings form and for the resolve |
| `McpbVariables` | type | The `variables` argument of `bundleServerOf` |
| `mcpCacheDiscardedAfterFailures` | function | Whether the entry is discarded once `failures` background refreshes in a row have failed |
| `mcpCacheEntryUse` | function | Whether a cached MCP tool list is used as is, used and refreshed in the background, or ignored |
| `McpCacheUse` | type | What a start does with a cache entry of a given age |
| `McpClientRuntime` | type | The `runtime` field of `McpClientSettings` |
| `mcpClientSettings` | function | `MCP_SDK_GENERATION` pins the client runtime (`v1`, or `v2`, the default |
| `McpClientSettings` | type | What `mcpClientSettings` returns |
| `McpConfigRead` | type | What `McpSource.load` returns; What `readMcpConfig` returns |
| `mcpConnectionBatches` | function | How many local and remote MCP servers connect at once, from the environment |
| `McpConnectionBatches` | type | What `mcpConnectionBatches` returns |
| `McpConnectionFailure` | type | The `failure` argument of `skipsStdioConnection` |
| `mcpConnectTimeoutMs` | function | The MCP connect timeout from `MCP_CONNECT_TIMEOUT_MS`, or the default |
| `mcpDescriptionLimits` | function | `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`: "Claude Code uses that number for both limits"; anything but plain digits is ignored |
| `McpDescriptionLimits` | type | What `mcpDescriptionLimits` returns |
| `mcpDiscoveryCache` | function | The discovery cache's settings |
| `McpDiscoveryCache` | type | The `cache` argument of `mcpCacheDiscardedAfterFailures`; The `cache` argument of `mcpCacheEntryUse` |
| `McpDisplayScope` | type | One of `MCP_DISPLAY_SCOPES` |
| `mcpEndpointKey` | function | A key equal for two servers exactly when Claude Code counts them as one endpoint |
| `McpExpansion` | type | What `expandMcpServer` returns |
| `McpExpansionOptions` | type | What a host adds to the expansion of one server: more names that read as empty toward a remote server |
| `McpFirstTurnServer` | type | What keeps its own first-turn wait in a non-interactive session |
| `mcpFirstTurnWaitMs` | function | `CLAUDE_CODE_MCP_STARTUP_WAIT_MS`: how long the first turn waits for a server that is still connecting |
| `McpImageFile` | type | What `mcpImageFiles` returns |
| `mcpImageFiles` | function | The image files to save beside the inline copy |
| `mcpJsonUnreadable` | function | The error of a command that finds `.mcp.json` is not a regular file or is over 2 MiB |
| `McpListedTool` | type | A tool as a server listed it: its input schema is whatever the server sent, checked here |
| `McpLoadContext` | type | What a source needs to load: the plugin's files and what decides whether a path leaves them (`locate`), and, optionally, the host's capabilities |
| `McpOAuthConfig` | type | The `oauth` block of a remote server's entry and what it decides |
| `mcpOAuthDiscovery` | function | The metadata URLs an MCP OAuth sign-in tries, in order, or the one `authServerMetadataUrl` pins |
| `McpOAuthDiscovery` | type | Where the authorization server's metadata is looked for |
| `McpOAuthMetadata` | type | The metadata of an authorization server as far as scopes go |
| `McpOAuthPlan` | type | What `planMcpOAuth` returns |
| `McpOAuthRead` | type | What `readMcpOAuth` returns |
| `mcpOAuthRedirectUri` | function | The redirect URI a fixed callback port registers |
| `mcpOutputLimits` | function | The limits for one tool. "The environment variable applies to tools that don't declare their own limit" |
| `McpOutputLimits` | type | The `limits` argument of `limitMcpResult`; What `mcpOutputLimits` returns |
| `McpOversize` | type | What a transport does with a message over its bound |
| `mcpPromptCommand` | function | The `/mcp__server__prompt` command name of an MCP prompt |
| `McpPromptDefinition` | type | MCP prompts as commands |
| `McpPromptInvocation` | type | The parameters of `prompts/get` |
| `mcpPromptListing` | function | "Claude Code lists each MCP prompt as `/servername:promptname (MCP)`" |
| `McpPromptRead` | type | What `readMcpPromptInvocation` returns |
| `mcpPromptToolAnswer` | function | What a `--permission-prompt-tool` result means for a call |
| `McpPromptToolAnswer` | type | The `answer` argument of `mcpPromptToolAnswer`; What `mcpPromptToolAnswer` returns |
| `McpProtocolNegotiation` | type | The `negotiation` field of `McpClientSettings` |
| `McpReloadPlan` | type | How a plugin's MCP servers follow a reload |
| `McpResultVerdict` | type | What `limitMcpResult` returns |
| `McpSecretRequest` | type | Where the client secret comes from: "The `--client-secret` flag prompts", or `MCP_CLIENT_SECRET` |
| `McpSendCheck` | type | What `mcpToolSendCheck` returns |
| `mcpServerDisabled` | function | The result an MCP tool call gets when the server is turned off |
| `mcpServerExistsMessage` | function | The message of `claude mcp add` for a name taken at that scope |
| `mcpServerNameReserved` | function | The warning for an MCP server whose name Claude Code reserves |
| `McpServerRead` | type | What `readMcpServer` returns |
| `McpSource` | type | One declared source, ready to load |
| `McpSourceKind` | type | One of `MCP_SOURCE_KINDS` |
| `McpStartupRun` | type | The `run` argument of `mcpStartupWaitsFor` |
| `McpStartupServer` | type | The `server` argument of `mcpStartupWaitsFor` |
| `mcpStartupWaitsFor` | function | Whether startup waits for one server before the first query. "MCP startup is non-blocking by default"; `MCP_CONNECTION_NONBLOCKING=0` waits for every server |
| `mcpStdioEnvironment` | function | The environment a stdio MCP server is spawned with, under `CLAUDE_CODE_MCP_ALLOWLIST_ENV` |
| `McpStdioEnvironmentInput` | type | The `input` argument of `mcpStdioEnvironment` |
| `mcpTimeouts` | function | `MCP_TIMEOUT`, `MCP_TOOL_TIMEOUT` and the server's own `timeout` |
| `McpTimeouts` | type | What `mcpTimeouts` returns |
| `McpTimeoutServer` | type | The `server` argument of `mcpTimeouts` |
| `McpToolDeclaration` | type | What Claude Code does with a tool's input schema before the tool goes to the API |
| `McpToolHints` | type | What a tool's entry declares, read once |
| `McpToolPolicy` | type | The `policy` argument of `prepareMcpTool` |
| `McpToolPreparation` | type | What `prepareMcpTool` returns |
| `mcpToolSendCheck` | function | Whether a tool goes to the model, and the debug line when it does not |
| `McpTransport` | type | One of `MCP_TRANSPORTS` |
| `MemoryRule` | type | The `rule` field of `MemoryRuleRead`; The `rule` argument of `ruleActivatesFor` |
| `MemoryRuleRead` | type | What `readMemoryRule` returns |
| `MemoryRuleScope` | type | Where a rule file lives, which sets what its `paths` patterns are relative to: `user` or `project` |
| `mergeLspSources` | function | Joins the maps of a plugin in loading order: `.lsp.json` first, then each declared source |
| `missingBundleSettings` | function | The settings among `required` that `saved` has no value for: the one rule both the host's dialog and the kit's load-time check use |
| `modelVisibleMcpTool` | function | Whether a server lists a tool for Claude |
| `Monitor` | type | The `monitors` field of `Plugin`; The `monitors` field of `ComponentValues` |
| `MonitorRead` | type | What `readMonitor` returns |
| `MonitorsRead` | type | What `readMonitors` returns |
| `MonitorTrigger` | type | `always`, or the first run of one skill |
| `noSuchTool` | function | The error result for a call to a tool that is not in the session's tool list; `hint` follows the name |
| `organizationSettingsUnavailable` | function | The reasons the page lists for organization settings that could not load, as it names them |
| `OutputStyle` | type | A custom output style: a Markdown file whose frontmatter is metadata and whose body is the instructions Claude Code sends with every request |
| `OutputStyleChoice` | type | What `listOutputStyles` returns |
| `OutputStyleContext` | type | Where the file was found |
| `OutputStyleRead` | type | What `readOutputStyle` returns |
| `OutputStyleRequest` | type | The argument of `resolveOutputStyle` |
| `outputStyleSystem` | function | The system prompt an output style gives |
| `oversizedMcpMessage` | function | What happens to a message of `bytes` (after decompression) from a server of `transport`: `undefined` when it is fine |
| `parseFrontmatter` | function | Split a Markdown file into its YAML frontmatter and body, as skills.md and output-styles.md describe |
| `parseMonitorTrigger` | function | `"always"` or `"on-skill-invoke:<skill>"` |
| `pathCouldNotBeChecked` | function | `/plugin` Errors tab: a path the operating system could not check (any error but "not found") |
| `pathCouldNotBeCheckedInList` | function | The same error as `claude plugin list` prints it |
| `permissionPromptToolNotFound` | function | The error of a run whose `--permission-prompt-tool` is not among the connected MCP tools when the first permission decision is needed |
| `persistedResultMessage` | function | What replaces a saved result in the conversation: "a message that names the file path" (wording is the kit's) |
| `planMcpOAuth` | function | Whether a server signs in with OAuth, and with which headers. "OAuth authentication works with HTTP servers" and the flags apply "to HTTP and SSE transports" |
| `planMcpReload` | function | What a reload does to each server, by the name the host registers it under |
| `PLUGIN_IGNORED_FIELDS` | constant | The fields a plugin agent ignores: derived from the registry |
| `PluginChannel` | type | A `channels` entry: a channel bound to one of the plugin's MCP servers |
| `PluginDependency` | type | The `dependencies` field of `MarketplaceEntry` |
| `PluginIssue` | type | The `issues` field of `AgentsReload`; The `issues` field of `HookOutcome` |
| `PluginManifest` | type | A manifest that loaded |
| `PluginMcpServer` | type | The `mcpServers` field of `Plugin`; The `server` field of `ResolvedMcpServer` |
| `PluginSettings` | type | A plugin's default settings (`settings.json` or the `settings` manifest key): only `agent` and `subagentStatusLine` take effect |
| `PluginSettingsRead` | type | The `read` argument of `hasAppliedSettings`; What `readPluginSettings` returns |
| `PluginSource` | type | A component a plugin brought: the plugin's id as the host names it (`name@marketplace`, or the bare name) |
| `prepareMcpTool` | function | The tool as it goes to the API, or why it does not |
| `PromptKind` | type | Which system prompt Claude Code builds |
| `readAgent` | function | Read one agent file: the Markdown body is the system prompt, `name` and `description` are required |
| `readCommand` | function | Read a command file |
| `readCommandEntry` | function | Build a `Command` from one entry of the manifest's `commands` map |
| `readConfigFlag` | function | `--config <key=value>`: "A key written `<server>.<key>` sets a setting that a bundled MCP server declares in its own `user_config` instead" |
| `readFlagAgents` | function | Reads the parsed `--agents` value |
| `readHooksFile` | function | Reads `hooks/hooks.json`: `{ "hooks": { <event>: [ { matcher?, hooks: [ <handler> ] } ] } }` |
| `readHooksJsonModules` | function | Reads `modules` of `hooks/hooks.json`: "an array with one path, relative to this file" (`"modules": ["./register.js"]`) |
| `readHooksSettings` | function | Reads an event map: the `hooks` object of `settings.json`, or an inline `hooks` object |
| `readLspConfig` | function | The servers of one map: a `.lsp.json` (or another `.json` file `lspServers` names) or an inline map |
| `readLspServer` | function | One entry of a map; `origin` is the file (or `lspServers` for an inline map) it came from |
| `readManifest` | function | Reads a parsed `plugin.json` into a manifest with its issues |
| `readMcpAdd` | function | Reads the arguments after `claude mcp add` |
| `readMcpAddJson` | function | `claude mcp add-json <name> '<json>'`: "The JSON must conform to the MCP server configuration schema" (`readMcpServer`) |
| `readMcpbManifest` | function | The name, server and settings of a bundle manifest for `platform` (`darwin`, `linux`, `win32`) |
| `readMcpbOptions` | function | A bundle's `user_config` block in the plugin option shape |
| `readMcpConfig` | function | Reads a parsed MCP config (`.mcp.json` or a manifest's `mcpServers`) into servers and issues |
| `readMcpOAuth` | function | Reads the value of a server's `oauth` key |
| `readMcpPromptInvocation` | function | Reads the space-separated arguments of an MCP prompt command |
| `readMcpServer` | function | Reads one entry |
| `readMcpToolHints` | function | The hints of one `tools/list` entry |
| `readMemoryRule` | function | One rule file. "If the YAML between the markers doesn't parse, Claude Code ignores the frontmatter and loads the rule as if it had no `paths`" |
| `readMonitor` | function | One entry of the array; `index` is its position, for the issue |
| `readMonitors` | function | The monitors of one source: `monitors/monitors.json`, a `.json` file `experimental.monitors` names, or its inline array |
| `readOutputStyle` | function | Read one output style file |
| `readPluginSettings` | function | Reads one settings object |
| `readsAsEmptyTowardRemote` | function | True for a name that reads as empty in the `url` and `headers` of a remote server |
| `readSkill` | function | Read one `SKILL.md` |
| `readText` | function | A string, trimmed; a number or boolean is written out; blank is absent |
| `readTheme` | function | Read a theme file |
| `RedactedPluginServer` | type | What `claude mcp get` and `claude mcp list` show of a plugin's servers |
| `redactPluginServer` | function | The redacted view of a plugin's stdio or WebSocket server, or `undefined` for an http or sse server, whose values the docs do not say are hidden |
| `refusedSchemaFallback` | function | The tool the API refused, resent "with the tool declared without parameters", and the line for the server's log |
| `REMOTE_MANAGED_SETTINGS_DID_NOT_LOAD` | constant | The notice shown when the remote managed settings did not load |
| `REMOTE_MANAGED_SETTINGS_STILL_LOADING` | constant | The state lines of the fetch that appear in the Code tab |
| `remoteManagedSettingsFailed` | function | The warning when server-managed settings could not be fetched or applied; `cause` names what failed |
| `remoteManagedSettingsLoaded` | function | The line when the settings loaded after one of the warnings; `applies` says whether a remote policy applies |
| `RemoteMcpServer` | type | A remote MCP server: SSE, HTTP or WebSocket |
| `RemotePolicy` | type | What the `Remote managed settings failed to load` warning says about the policy the session runs on |
| `renderAgentFile` | function | Writes an agent draft as its Markdown file with frontmatter |
| `renderCommandFile` | function | A command file is a skill file without `name` and `paths`: the one writer |
| `renderSkillFile` | function | Writes a skill draft as its `SKILL.md` text with frontmatter |
| `requestedOAuthScopes` | function | The `scope` of an MCP OAuth authorization request, or `undefined` to let the server decide |
| `requiredBundleSettings` | function | The settings of a bundle the server cannot start without, as `<server>.<key>` |
| `requiringInteraction` | function | The callable names of the tools of one server that "require explicit approval on every call", for `DecideContext.requiresUserInteraction` of the permission check |
| `reservedSkillNameNotice` | function | The startup notice for a skill, command or workflow whose name uses `anthropic-skills` |
| `reservedSpellingIgnored` | function | The warning for a registered entry whose name is another spelling of a reserved name |
| `reservedSpellingRefusal` | function | The refusal to add a marketplace whose name is another spelling of a reserved name |
| `resolveOutputStyle` | function | The active style |
| `resolveSkillName` | function | Resolve the name and the command of a skill from where it sits and its frontmatter `name` (`declared`, as read; undefined when absent) |
| `resolveTypesPath` | function | The declaration file of a mod: the manifest's `types` path, else `types/index.d.ts`; relative to the plugin folder, `/`-separated |
| `sandboxAllowIgnored` | function | The `/status` warning for `allowRead` or `allowedDomains` entries a managed lock ignores |
| `scopedAgentName` | function | The name a plugin agent is registered under: the plugin name, each subfolder of `relativePath` and `name`, joined by colons |
| `scrubAction` | function | What the scrub does to the variable `name` holding `value`; a variable no rule names is kept |
| `ScrubAction` | type | What the scrub does to one variable |
| `SEVERITIES` | constant | What a check found, in the shape `claude plugin validate` reports: an error keeps the plugin from loading, a warning does not |
| `Severity` | type | One of `SEVERITIES` |
| `Skill` | type | The `skills` field of `PluginCatalog`; The `preloaded` field of `PreloadedSkills` |
| `SKILL_FIELDS` | constant | The frontmatter keys of a skill; the list is closed and an unknown key is skipped without an issue |
| `SKILL_SHELLS` | constant | The shells `shell` accepts |
| `SkillDraft` | type | The `draft` argument of `renderSkillFile` |
| `SkillField` | type | One of `SKILL_FIELDS` |
| `SkillFieldValues` | type | What one field sets: a piece of the skill, `name` (resolved elsewhere) included |
| `SkillHead` | type | A skill or a command read without its body |
| `SkillLayout` | type | Where a `SKILL.md` sits: its origin and the name of its folder |
| `SkillName` | type | How a skill gets its command name |
| `skillNamesRefused` | function | The startup notice for skill or command names Claude Code refused; `names` is the count |
| `SkillOrigin` | type | Where a skill came from, which decides what the runtime may do with its text |
| `SkillRead` | type | What `readSkill` returns |
| `SkillShell` | type | One of `SKILL_SHELLS` |
| `SKIPPING_CONNECTION` | constant | Errors.md quotes it as the status of a server that was not started |
| `skipsStdioConnection` | function | Whether Claude Code skips connecting a plugin's server |
| `SseMcpServer` | type | An SSE MCP server, with its optional `headersHelper` |
| `storedTokenRecovery` | function | A stored OAuth token rejected with 401: "Your stored login has a refresh token" or not |
| `StoredTokenRecovery` | type | What `storedTokenRecovery` returns |
| `StyleSelection` | type | The style in force: Default, a built-in one, or a custom one (`style` is set) |
| `Theme` | type | The `theme` field of `PluginTheme`; The `edited` argument of `copyOfPluginTheme` |
| `THEME_BASES` | constant | "Built-in preset the theme starts from" (the `base` row) |
| `THEME_TOKEN_NAMES` | constant | Every token name a theme file may set |
| `ThemeBase` | type | One of `THEME_BASES` |
| `ThemeColor` | type | A theme colour, as written: terminal palettes stay palette references (`ansi:` follows the terminal's own colours) |
| `themeColorToHex` | function | The colour as `#rrggbb` |
| `ThemeCopy` | type | What `copyOfPluginTheme` returns |
| `ThemeRead` | type | What `readTheme` returns |
| `themeSlug` | function | The slug of a theme file: its name without `.json`; both `/` and `\` separate a path |
| `UnrecognizedField` | type | The `unrecognized` field of `AgentRecord` |
| `UserConfigOption` | type | The `userConfig` field of `Plugin`; The `declared` field of `ResolvedUserConfig` |
| `validAgentName` | function | Whether a name is a valid agent name |
| `validateManifest` | function | `claude plugin validate` on a parsed `plugin.json`: the validator's findings and what the inline `hooks` and `mcpServers` hold (`checkPluginManifest`, the one rule set) |
| `ValidationIssue` | type | What `claude plugin validate` reports about one file |
| `withoutUserinfo` | function | `value` with the username and password cut from every URL in it |
| `writeFrontmatter` | function | A whole file: `---`, the fields in the order given (JavaScript lists integer-like keys first), `---`, then `body` exactly as given, with no line added before it |
| `WsMcpServer` | type | `ws` takes the fields of `http` |
