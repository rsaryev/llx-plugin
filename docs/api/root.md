# `@rsaryev/llx-plugin`

What a host needs to run plugins: the plugin host and its sessions, loading and validation, the permission decision, the port types, and Claude Code's own types and closed lists.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `AddHooksOptions` | type | The `options` argument of `HookScope.addHooks` |
| `AgentDefinition` | type | Claude Code's official `AgentDefinition` (`@anthropic-ai/claude-agent-sdk`) |
| `AgentInput` | type | The input of Claude Code's `Agent` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `AgentMcpServerSpec` | type | Claude Code's official `AgentMcpServerSpec` (`@anthropic-ai/claude-agent-sdk`) |
| `AgentOutput` | type | The output of Claude Code's `Agent` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `AgentOverrides` | type | What a host that rebuilds its run state per run passes instead of what the session opened with |
| `AgentRecord` | type | One agent file as Claude Code would load it |
| `AgentRequest` | type | A multi-turn run that may use the named tools (an `agent` hook's verifier) |
| `AgentsOptions` | type | The options of `session.agents`: whether built-in subagents are listed |
| `AgentsReload` | type | A session's subagents: the built-ins, the `--agents` flag, the managed, project, personal and added `.claude/agents/` folders and the plugins' `agents/` |
| `ArtifactInput` | type | The input of Claude Code's `Artifact` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ArtifactOutput` | type | The output of Claude Code's `Artifact` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `AskUserQuestionInput` | type | The input of Claude Code's `AskUserQuestion` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `AskUserQuestionOutput` | type | The output of Claude Code's `AskUserQuestion` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `AsyncHookJSONOutput` | type | Claude Code's official `AsyncHookJSONOutput` (`@anthropic-ai/claude-agent-sdk`) |
| `BackgroundListener` | type | Gets what one background hook delivered, as it settles, and where it came from (`session.onBackground`) |
| `BackgroundSource` | type | Which run of which session a background delivery came from, and how that run ended |
| `BaseHookInput` | type | Claude Code's official `BaseHookInput` (`@anthropic-ai/claude-agent-sdk`) |
| `BashInput` | type | The input of Claude Code's `Bash` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `BashOutput` | type | The output of Claude Code's `Bash` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `BuiltinToolName` | type | A built-in tool name of the SDK (`BUILTIN_TOOL_NAMES`), as a union |
| `ChannelPluginRef` | type | One `allowedChannelPlugins` entry, as the SDK types it: the plugin and the marketplace it comes from (`{ marketplace, plugin }`) |
| `classifyPluginFolder` | function | Judgment: the docs name the rule, not its edges |
| `ClaudeDesignInput` | type | The input of Claude Code's `ClaudeDesign` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ClaudeDesignOutput` | type | The output of Claude Code's `ClaudeDesign` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ClientCapabilities` | type | Claude Code's official `ClientCapabilities` (`@modelcontextprotocol/sdk/types.js`) |
| `Clock` | type | Time, the only way the kit sees it (L3: no `Date`, no `setTimeout` in `src/`) |
| `CommandLineRules` | type | Rules the launch adds: `--allowedTools` and `--disallowedTools` |
| `CommandResult` | type | What `CommandRunner.run` returns; The `result` argument of `installOutcome` |
| `CommandRun` | type | The `run` argument of `CommandRunner.run`; What `nodeDepsRun` returns |
| `CommandRunner` | type | The `commands` field of `HookPorts`; The `runner` argument of `runMcpHeadersHelper` |
| `CommandSpec` | type | A command a port runs: a program and its arguments with no shell, or a shell command line |
| `createPermissionsPolicy` | function | The permissions policy of a settings view |
| `createPluginHost` | function | The public entry: the loaded plugins, the ports the host implements and the settings, composed once and replaced by `update` |
| `createPolicyView` | function | The view of settings layers that reads each key by its merge |
| `CronCreateInput` | type | The input of Claude Code's `CronCreate` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `CronCreateOutput` | type | The output of Claude Code's `CronCreate` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `CronDeleteInput` | type | The input of Claude Code's `CronDelete` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `CronDeleteOutput` | type | The output of Claude Code's `CronDelete` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `CronListInput` | type | The input of Claude Code's `CronList` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `CronListOutput` | type | The output of Claude Code's `CronList` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `decide` | function | Whether a call may run, asks the user, is denied or goes to the host's classifier |
| `DecideContext` | type | The session facts decided outside `decide`, and the rules in force |
| `Decision` | type | The outcome of a permission check |
| `DefaultsPlugin` | type | A plugin whose `settings.json` holds defaults: its id, name and applied settings |
| `DirectoryEntry` | type | What `PluginFiles.list` returns |
| `DOCUMENTED_TOOLS` | constant | The tools of tools-reference.md ("Tool" column of the first table), in the table's order |
| `DocumentedTool` | type | One of `DOCUMENTED_TOOLS` |
| `EFFORT_LEVELS` | constant | The named reasoning-effort levels, lowest first (skills and agents `effort` frontmatter, the `effortLevel` setting, `CLAUDE_CODE_EFFORT_LEVEL`) |
| `EffortLevel` | type | Claude Code's official `EffortLevel` (`@anthropic-ai/claude-agent-sdk`) |
| `ElicitationHookInput` | type | Claude Code's official `ElicitationHookInput` (`@anthropic-ai/claude-agent-sdk`) |
| `ElicitationHookSpecificOutput` | type | Claude Code's official `ElicitationHookSpecificOutput` (`@anthropic-ai/claude-agent-sdk`) |
| `ElicitationRequest` | type | Claude Code's official `ElicitationRequest` (`@anthropic-ai/claude-agent-sdk`) |
| `ElicitationResult` | type | Claude Code's official `ElicitationResult` (`@anthropic-ai/claude-agent-sdk`) |
| `ElicitationResultHookSpecificOutput` | type | Claude Code's official `ElicitationResultHookSpecificOutput` (`@anthropic-ai/claude-agent-sdk`) |
| `EnterPlanModeInput` | type | The input of Claude Code's `EnterPlanMode` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `EnterPlanModeOutput` | type | The output of Claude Code's `EnterPlanMode` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `EnterWorktreeInput` | type | The input of Claude Code's `EnterWorktree` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `EnterWorktreeOutput` | type | The output of Claude Code's `EnterWorktree` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `EnvFileStore` | type | The `envFiles` field of `PluginHostOptions`; The `store` argument of `createEnvFiles` |
| `Environment` | type | Environment variables as plain values |
| `EventFactsOf` | type | The `facts` argument of `buildHookInput`; The `facts` field of `DispatchRequest` |
| `EventWithSpecificOutput` | type | Events whose JSON output has an event-specific part |
| `ExitPlanModeInput` | type | The input of Claude Code's `ExitPlanMode` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ExitPlanModeOutput` | type | The output of Claude Code's `ExitPlanMode` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ExitReason` | type | Claude Code's official `ExitReason` (`@anthropic-ai/claude-agent-sdk`) |
| `ExitWorktreeInput` | type | The input of Claude Code's `ExitWorktree` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ExitWorktreeOutput` | type | The output of Claude Code's `ExitWorktree` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ExpandOptions` | type | The options of `session.expandSkill`: arguments, signal and who invokes it |
| `Expansion` | type | The `expansion` field of `MentionExpansion`; What `expandSkill` returns |
| `FileEditInput` | type | The input of Claude Code's `FileEdit` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `FileEditOutput` | type | The output of Claude Code's `FileEdit` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `FileReadInput` | type | The input of Claude Code's `FileRead` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `FileReadOutput` | type | The output of Claude Code's `FileRead` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `FileReference` | type | The files a text names with `@` |
| `FileStat` | type | What a host knows about one entry; booleans, so no code compares a kind to a string |
| `FileWriteInput` | type | The input of Claude Code's `FileWrite` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `FileWriteOutput` | type | The output of Claude Code's `FileWrite` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `FolderScan` | type | The `folders` argument of `scanSkillContainer`; The `folders` argument of `scanSavedWorkflows` |
| `FolderSkillSource` | type | Where one listed skill or command came from and what name it gave up: what a host needs for the `claude.ai sync` group of `/skills` and for the note under it |
| `FolderSkillSources` | type | The folders' skills by source, and the ones that lost every name and are not listed |
| `FolderSource` | type | A component read from a scope folder (`managed`, `user`, `project`...: the scopes differ per component) |
| `GlobInput` | type | The input of Claude Code's `Glob` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `GlobOutput` | type | The output of Claude Code's `Glob` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `GrepInput` | type | The input of Claude Code's `Grep` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `GrepOutput` | type | The output of Claude Code's `Grep` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `HOOK_EVENTS` | constant | Every hook event Claude Code fires, in its documented order |
| `HOOK_HANDLER_TYPES` | constant | Every handler type, in the order hooks.md lists them ("Hook handler fields") |
| `HookCallback` | type | Claude Code's official `HookCallback` (`@anthropic-ai/claude-agent-sdk`) |
| `HookCallbackMatcher` | type | Claude Code's official `HookCallbackMatcher` (`@anthropic-ai/claude-agent-sdk`) |
| `HookEnvironment` | type | The environment hooks run in: the settings environment and the env files |
| `HookEvent` | type | Claude Code's official `HookEvent` (`@anthropic-ai/claude-agent-sdk`) |
| `HookHandle` | type | Removes one registration; it does nothing once the prefix was registered again or removed |
| `HookHandler` | type | One handler: a command, an HTTP request, an MCP tool call, a prompt or an agent |
| `HookHandlerType` | type | The `handlerTypes` field of `EventInfo`; The `type` argument of `eventsSupporting` |
| `HookInput` | type | Claude Code's official `HookInput` (`@anthropic-ai/claude-agent-sdk`) |
| `HookInputOf` | type | The input Claude Code sends a hook on event `E` |
| `HookJSONOutput` | type | Claude Code's official `HookJSONOutput` (`@anthropic-ai/claude-agent-sdk`) |
| `HookLifetime` | type | How long hooks added with `addHooks` live: the session, or until the `runScoped` turn ends |
| `HookMatcherGroup` | type | One `{ matcher, hooks }` group under an event |
| `HookObserver` | type | The host's window onto a dispatch: `started` is the run stage's, the others the engine's |
| `HookOutcome` | type | What an event came to, merged over every handler that ran |
| `HookPermissionDecision` | type | Claude Code's official `HookPermissionDecision` (`@anthropic-ai/claude-agent-sdk`) |
| `HookPorts` | type | The ports the engine runs handlers through: each handler type needs its own |
| `HookScope` | type | The session methods that add and remove the hooks of a run, an agent or a skill |
| `HookSourceKind` | type | Where a registered handler was declared |
| `HookSpecificOutputOf` | type | The `hookSpecificOutput` of one hook event |
| `HooksSettings` | type | The shape of hook configuration, derived from the official `Settings` type |
| `HostedPlugin` | type | A plugin the host knows and whether it runs |
| `HostPlugin` | type | A plugin the host was given: loaded once (`loadPlugin`), known by its `name@marketplace` id |
| `HostPorts` | type | What the host passes: the ports, with the ones its hook handler types need |
| `HostSkill` | type | A skill the host supplies itself (`SessionOptions.hostSkills`): one built into the host, or one its extension mechanism registers at run time |
| `HostSource` | type | The host gave the skill itself (`SessionOptions.hostSkills`): a bundled skill of the host |
| `HostUpdate` | type | What `host.update` replaces: each part given (and not `undefined`) replaces the host's own whole; a part left out stays |
| `HttpClient` | type | The `http` field of `HookPorts`; The `http` field of `RunPorts` |
| `HttpFailure` | type | What `HttpClient.request` returns; What `ModFetcher.request` returns |
| `HttpRequest` | type | One HTTP request |
| `HttpResponse` | type | What `HttpClient.request` returns |
| `InvocableHead` | type | The `invocable` field of `ResolvedFolderSkill`; The `invocable` field of `ScannedEntry` |
| `InvocationPolicy` | type | The `policy` field of `SessionSkill`; What `invocationPolicy` returns |
| `LinkRoots` | type | The real paths (`/`-separated, one spelling) a link is judged against |
| `listingLine` | function | Judgment: the docs give the content of a line, not its form |
| `ListMcpResourcesInput` | type | The input of Claude Code's `ListMcpResources` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ListMcpResourcesOutput` | type | The output of Claude Code's `ListMcpResources` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `LoadedPlugin` | type | The result of `loadPlugin`: a plugin that loads, and everything found wrong or worth a warning |
| `loadPlugin` | function | Loads a plugin folder into a typed `Plugin`: the optional manifest, every component in the standard layout and the manifest's paths, each reader's issues collected |
| `LoadPluginInput` | type | The `input` argument of `loadPlugin`; The `input` argument of `loadRepositoryPlugin` |
| `Locations` | type | Where things are on the host: the values behind `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and `CLAUDE_PROJECT_DIR`, and path joining |
| `McpAvailability` | type | What `McpCaller.ensureConnected` returns |
| `McpCaller` | type | The host's MCP client: the kit resolves server configs, the host connects and calls |
| `McpCallToolResult` | type | What an MCP tool call answers, as the SDK types it (`CallToolResult` of the MCP SDK, which the Agent SDK uses for the handler of an in-process tool but does not export) |
| `McpContentBlock` | type | One content block of a tool's result as MCP returns it (text, image, resource, resource_link,...) |
| `McpHttpServerConfig` | type | Claude Code's official `McpHttpServerConfig` (`@anthropic-ai/claude-agent-sdk`) |
| `McpInput` | type | The input of Claude Code's `Mcp` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `McpOutput` | type | The output of Claude Code's `Mcp` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `McpServerConfig` | type | Claude Code's official `McpServerConfig` (`@anthropic-ai/claude-agent-sdk`) |
| `McpSSEServerConfig` | type | Claude Code's official `McpSSEServerConfig` (`@anthropic-ai/claude-agent-sdk`) |
| `McpStdioServerConfig` | type | Claude Code's official `McpStdioServerConfig` (`@anthropic-ai/claude-agent-sdk`) |
| `McpToolCall` | type | The `call` argument of `McpCaller.callTool`; What `fakeMcp` returns |
| `McpToolResult` | type | What `McpCaller.callTool` returns; The `tools` field of `FakeMcpOptions` |
| `MentionExpansion` | type | One skill of the message, expanded; a mention the user may not invoke is a failed expansion |
| `MentionOptions` | type | How a message is read: the host's commands that take another command as their arguments |
| `MentionPart` | type | The session methods that read and expand the skills a message names |
| `MessageExpansion` | type | What `MentionPart.expandMessage` returns |
| `MessageMentions` | type | Which skills a message names, read against the session's catalog; nothing is expanded |
| `MessageOptions` | type | The `options` argument of `MentionPart.expandMessage` |
| `ModelAnswer` | type | What `ModelRunner.evaluate` returns; What `ModelRunner.runAgent` returns |
| `ModelCatalog` | type | The canonical name of a model; the host knows its models |
| `ModelListing` | type | What the model is told about a skill: name and description, name only, or nothing |
| `ModelListingResult` | type | The `model` field of `SkillsListing`; What `modelListing` returns |
| `ModelRequest` | type | A model call that is no more than a prompt: the host picks the model when `model` is absent |
| `ModelRunner` | type | The `models` field of `HookPorts`; The `models` field of `RunPorts` |
| `Monitor` | type | The `monitors` field of `Plugin`; The `monitors` field of `ComponentValues` |
| `MonitorId` | type | A monitor a session started: its plugin's id and its name, unique within the plugin |
| `MonitorInput` | type | The input of Claude Code's `Monitor` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `MonitorLedgerState` | type | A session's `MonitorLedger` as plain data (`session.monitorLedger()`) |
| `MonitorOutput` | type | The output of Claude Code's `Monitor` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `MonitorPart` | type | The session methods that list the monitors to start |
| `MonitorStart` | type | One monitor to start now, ready to spawn |
| `MonitorStartOptions` | type | What `monitorsToStart` reads besides the session: the host's facts of `MonitorMode` |
| `normalizePermissionMode` | function | A mode name as Claude Code accepts it: a mode itself or one of its aliases; else `undefined` |
| `NotebookEditInput` | type | The input of Claude Code's `NotebookEdit` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `NotebookEditOutput` | type | The output of Claude Code's `NotebookEdit` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `OfferChromeSetupInput` | type | The input of Claude Code's `OfferChromeSetup` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `OfferChromeSetupOutput` | type | The output of Claude Code's `OfferChromeSetup` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `OptionValues` | type | The `userConfig` field of `PluginHostOptions`; The `userConfig` field of `SessionOptions` |
| `OutputStyle` | type | A custom output style: a Markdown file whose frontmatter is metadata and whose body is the instructions Claude Code sends with every request |
| `OverrideState` | type | The `override` field of `SessionSkill`; The `state` argument of `overrideMenuLabel` |
| `ParentSettingsContext` | type | The parent settings an embedding host passes through the Agent SDK's `managedSettings` option |
| `PERMISSION_BEHAVIORS` | constant | The three rule behaviours of permissions.md ("Manage permissions"): allow, ask and deny |
| `PERMISSION_MODES` | constant | The permission modes of permissions.md ("Permission modes"), tied to the official `PermissionMode` union |
| `PermissionBehavior` | type | Claude Code's official `PermissionBehavior` (`@anthropic-ai/claude-agent-sdk`) |
| `PermissionMode` | type | Claude Code's official `PermissionMode` (`@anthropic-ai/claude-agent-sdk`) |
| `permissionRequestDecision` | function | The decision once the `PermissionRequest` hooks have answered |
| `PermissionRule` | type | One permission rule, parsed |
| `PermissionRuleFacts` | type | The permission rules of a settings view as the rules module reads them, so a host that rebuilds its permissions for each run (a new view |
| `permissionRulesOf` | function | The permission rules of a settings view, parsed, by behaviour |
| `PermissionRulesOf` | type | What `permissionRulesOf` returns |
| `PermissionRuleValue` | type | Claude Code's official `PermissionRuleValue` (`@anthropic-ai/claude-agent-sdk`) |
| `PermissionSession` | type | The permissions of a session: its mode, the context `decide` takes and its start notices |
| `PermissionSessionInput` | type | The `input` argument of `startPermissions` |
| `PermissionsPolicy` | type | The permission keys of the settings as one object over a view |
| `PermissionUpdate` | type | Claude Code's official `PermissionUpdate` (`@anthropic-ai/claude-agent-sdk`) |
| `Plugin` | type | A plugin as loading found it |
| `PluginCatalog` | type | What one plugin's Markdown components read to: the formats' own readers, once, at load |
| `PluginDirectoryReading` | type | What `readPluginDirectory` returns; The `reading` argument of `pluginFoldersOf` |
| `PluginFiles` | type | The `input` argument of `classifyPluginFolder`; The `files` field of `LoadPluginInput` |
| `PluginFolderKind` | type | What a folder passed as `--plugin-dir` is |
| `PluginHost` | type | What `createPluginHost` returns |
| `PluginHostOptions` | type | The `options` argument of `createPluginHost` |
| `PluginIssue` | type | The `issues` field of `AgentsReload`; The `issues` field of `HookOutcome` |
| `PluginManifest` | type | A manifest that loaded |
| `PluginSession` | type | One session over the host's plugins: what to list and expand, the hooks to dispatch, and the components to resolve |
| `PluginSource` | type | A component a plugin brought: the plugin's id as the host names it (`name@marketplace`, or the bare name) |
| `pluginsWithDependencies` | function | The load-time dependency verdict without a host or a session |
| `PluginTextFile` | type | A skill, command, agent or output style as loading finds it: its path, its name inside the plugin and its text |
| `policyContext` | function | A `PolicyContext` from the facts a host knows |
| `PolicyContext` | type | What a host tells the policy besides the layers: plain data it copies in, so the kit reads no `process.env`, no file and no account |
| `PolicyLayer` | type | The `given` argument of `createPolicyView`; The `layers` field of `PolicyView` |
| `PolicyScope` | type | One of `POLICY_SCOPES` |
| `PolicyView` | type | Typed questions over the ordered layers, the one thing every area resolver asks |
| `PortFailure` | type | How a port reports an effect that did not happen (a connection refused, a timeout, a model that failed): a value in the result union, never a thrown exception |
| `PreloadedSkills` | type | What `session.preloadSkills` returns: the preloaded skills and the skipped names |
| `PreloadOptions` | type | What `session.preloadSkills` takes besides the definition |
| `PreparedCall` | type | A call after the host's own preparation: the real paths a symlink in the call resolves to, which the path rules need, and the names of a called skill |
| `preToolUseHookOutcome` | function | What the permission check (`decide`) reads of the `PreToolUse` hooks |
| `ProjectsInput` | type | The input of Claude Code's `Projects` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ProjectsOutput` | type | The output of Claude Code's `Projects` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `Prompt` | type | Claude Code's official `Prompt` (`@modelcontextprotocol/sdk/types.js`) |
| `PromptArgument` | type | Claude Code's official `PromptArgument` (`@modelcontextprotocol/sdk/types.js`) |
| `ProposeGoalInput` | type | The input of Claude Code's `ProposeGoal` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ProposeGoalOutput` | type | The output of Claude Code's `ProposeGoal` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ProposeSkillsInput` | type | The input of Claude Code's `ProposeSkills` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ProposeSkillsOutput` | type | The output of Claude Code's `ProposeSkills` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `PushNotificationInput` | type | The input of Claude Code's `PushNotification` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `PushNotificationOutput` | type | The output of Claude Code's `PushNotification` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `readCatalog` | function | Reads the skills, commands, agents and output styles of a loaded plugin with the format readers |
| `ReadMcpResourceDirInput` | type | The input of Claude Code's `ReadMcpResourceDir` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ReadMcpResourceDirOutput` | type | The output of Claude Code's `ReadMcpResourceDir` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ReadMcpResourceInput` | type | The input of Claude Code's `ReadMcpResource` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ReadMcpResourceOutput` | type | The output of Claude Code's `ReadMcpResource` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ReadNotificationsInput` | type | The input of Claude Code's `ReadNotifications` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ReadNotificationsOutput` | type | The output of Claude Code's `ReadNotifications` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `readPluginDirectory` | function | A folder passed as `--plugin-dir` and the plugins it loads |
| `readSettingsLayer` | function | An absent source (`undefined`) is an empty layer; a document that is no JSON object is skipped |
| `RefreshMcpToolsInput` | type | The input of Claude Code's `RefreshMcpTools` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `RefreshMcpToolsOutput` | type | The output of Claude Code's `RefreshMcpTools` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `RegisteredHandler` | type | What `HookScope.hookEntries` returns; The `entry` argument of `consumedByRun` |
| `RemoteTriggerInput` | type | The input of Claude Code's `RemoteTrigger` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `RemoteTriggerOutput` | type | The output of Claude Code's `RemoteTrigger` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `REMOVED_TOOLS` | constant | Tools Claude Code removed but a rule may still name |
| `RemovedTool` | type | One of `REMOVED_TOOLS` |
| `ReportFindingsInput` | type | The input of Claude Code's `ReportFindings` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ReportFindingsOutput` | type | The output of Claude Code's `ReportFindings` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `RepositoryChain` | type | The folders a project's own skills and commands are read from |
| `Resolved` | type | A resolved list and what was found wrong while resolving it |
| `ResolvedLspServer` | type | An LSP server config resolved for this host |
| `ResolvedMcpServer` | type | A plugin's MCP server config resolved for this host |
| `ResolvedSettingSource` | type | Claude Code's official `ResolvedSettingSource` (`@anthropic-ai/claude-agent-sdk`) |
| `ResolvedUserConfig` | type | What the user (or the host) saved for a plugin's `userConfig` options |
| `ResolveOptions` | type | The options of a session's component readers: the signal |
| `SAVED_EFFORT_LEVELS` | constant | The levels a file may save: `max` is "session-only and is not written" |
| `savedApproval` | function | The effect of "Yes, and don't ask again" for `toolName` under the policy (`allowManagedPermissionRulesOnly` stops saving new rules) and the host's paths |
| `SavedApproval` | type | What "Yes, and don't ask again" does for one tool in a session, and where it is saved |
| `SavedEffortLevel` | type | The level a settings file may save (`effortLevel`, `modelSettings.<model>.effortLevel`) |
| `ScanFolder` | type | One folder opened for reading: its files, and how this host writes the paths of what is below it |
| `ScanScope` | type | One of `SCAN_SCOPES` |
| `ScheduleWakeupInput` | type | The input of Claude Code's `ScheduleWakeup` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ScheduleWakeupOutput` | type | The output of Claude Code's `ScheduleWakeup` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ScopedHookSource` | type | Where scoped hooks come from: an agent's frontmatter, a skill, or the host's own run |
| `ScratchFiles` | type | Somewhere to put text the kit may not inline: a hook string over the cap is spilled to a file and the model is told where it is, as are over-long tool results |
| `SDK_ONLY_TOOLS` | constant | Tools the SDK's `BUILTIN_TOOL_NAMES` lists that the tools-reference table does not |
| `SdkMarketplaceSource` | type | One marketplace source object, as the SDK types the entries of `strictKnownMarketplaces` (`github`, `git`, `url`, `hostPattern`, `skills-dir`…) |
| `SDKMessageOrigin` | type | Claude Code's official `SDKMessageOrigin` (`@anthropic-ai/claude-agent-sdk`) |
| `SdkOnlyTool` | type | One of `SDK_ONLY_TOOLS` |
| `SDKPermissionDeniedMessage` | type | Claude Code's official `SDKPermissionDeniedMessage` (`@anthropic-ai/claude-agent-sdk`) |
| `SdkPluginConfig` | type | Claude Code's official `SdkPluginConfig` (`@anthropic-ai/claude-agent-sdk`) |
| `SDKResultError` | type | Claude Code's official `SDKResultError` (`@anthropic-ai/claude-agent-sdk`) |
| `SendFeedbackInput` | type | The input of Claude Code's `SendFeedback` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `SendFeedbackOutput` | type | The output of Claude Code's `SendFeedback` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `SessionAgent` | type | A subagent as a host registers it: the official definition under the name a call uses |
| `SessionDispatchOptions` | type | What a session's dispatch takes besides the event and its facts |
| `SessionLimits` | type | What the host knows about the session beyond the environment the kit reads itself |
| `SessionOptions` | type | What one session is opened with |
| `SessionPluginDefaults` | type | The plugin defaults of a session's agents |
| `SessionSkill` | type | One skill or command the session can invoke |
| `Settings` | type | Claude Code's official `Settings` (`@anthropic-ai/claude-agent-sdk`) |
| `SettingSource` | type | Claude Code's official `SettingSource` (`@anthropic-ai/claude-agent-sdk`) |
| `SettledDeliveries` | type | What a host takes from the deliveries of background hooks |
| `Severity` | type | One of `SEVERITIES` |
| `ShellKind` | type | One process run, as `command` hooks, `` !`cmd` `` in skills, status lines and command sources need it |
| `ShellPermission` | type | The host's answer for one command: what its permission rules and the skill's grants decide |
| `ShowOnboardingRolePickerInput` | type | The input of Claude Code's `ShowOnboardingRolePicker` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ShowOnboardingRolePickerOutput` | type | The output of Claude Code's `ShowOnboardingRolePicker` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `SkillCatalog` | type | Every row, and what keeps the list from being whole or a host skill from loading |
| `SkillCatalogOptions` | type | The options of `session.skillCatalog`: commands a `paths` match activated |
| `SkillContent` | type | What `skillContent` read: the skill with its body, or why it could not |
| `SkillInvoker` | type | What fires the skill: the user typing `/name`, the model's Skill call, a scheduled fire, a workflow's agent |
| `skillKeywords` | function | The frontmatter `keywords` of a row: a YAML list keeps its strings, a string is split at commas; anything else is none |
| `SkillMention` | type | Where a message names a skill |
| `SkillPlace` | type | Where a skill lives, as the host writes paths: absolute, each absent when the skill has none |
| `skillPlugin` | function | The plugin a skill or command row belongs to; `undefined` for a folder or host skill |
| `SkillPlugin` | type | A plugin skill's plugin: the id the host uses for it and the name its commands are scoped by |
| `skillScope` | function | The scope a session skill comes from |
| `SkillScope` | type | Where a row loaded from: a folder scope, `plugin`, or `host` |
| `SkillsListing` | type | What `session.skills` returns: the model listing, the menu and the workflows |
| `SkillsOptions` | type | What the model is told and what the `/` menu offers; `usage`, `activated` and the budget as `modelListing` |
| `SkillSource` | type | Where a skill came from: a plugin, a folder scope, or the host; the plugin and folder shapes are the ones agent rows share (`format/component-source`) |
| `SkillsReload` | type | What a read of the folders found |
| `SlashCommand` | type | Claude Code's official `SlashCommand` (`@anthropic-ai/claude-agent-sdk`) |
| `StartedPermissions` | type | What `startPermissions` returns |
| `startPermissions` | function | Starts the permission side of a session: the mode, then the context `decide` reads |
| `SubprocessKind` | type | One of `SUBPROCESS_KINDS` |
| `SyncHookJSONOutput` | type | Claude Code's official `SyncHookJSONOutput` (`@anthropic-ai/claude-agent-sdk`) |
| `TaskCreateInput` | type | The input of Claude Code's `TaskCreate` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskCreateOutput` | type | The output of Claude Code's `TaskCreate` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskGetInput` | type | The input of Claude Code's `TaskGet` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskGetOutput` | type | The output of Claude Code's `TaskGet` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskListInput` | type | The input of Claude Code's `TaskList` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskListOutput` | type | The output of Claude Code's `TaskList` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskStopInput` | type | The input of Claude Code's `TaskStop` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskStopOutput` | type | The output of Claude Code's `TaskStop` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskUpdateInput` | type | The input of Claude Code's `TaskUpdate` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TaskUpdateOutput` | type | The output of Claude Code's `TaskUpdate` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TextFileReader` | type | The narrowest read: a text file |
| `TodoWriteInput` | type | The input of Claude Code's `TodoWrite` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TodoWriteOutput` | type | The output of Claude Code's `TodoWrite` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `Tool` | type | Claude Code's official `Tool` (`@modelcontextprotocol/sdk/types.js`) |
| `ToolCheck` | type | What `checkTool` found for one tool call |
| `ToolCheckPart` | type | The session method that checks a tool call: hooks, then the permission decision |
| `ToolInputSchemas` | type | Claude Code's official `ToolInputSchemas` (`@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `ToolOutputSchemas` | type | Claude Code's official `ToolOutputSchemas` (`@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `TouchedFile` | type | What `session.touchFile` returns: the commands the file activated |
| `TurnOptions` | type | What a turn may change over the session it runs in |
| `TurnPart` | type | The session method that gives the same session for one turn |
| `UpdateResult` | type | What `host.update` reports: the plugins and issues the host has now |
| `UserConfigValue` | type | One saved `userConfig` option value, as the SDK types `Settings.pluginConfigs[id].options[key]` (a string, number, boolean or list of strings) |
| `validatePlugin` | function | `claude plugin validate <dir>` over a folder |
| `ValidatePluginInput` | type | The `input` argument of `validatePlugin` |
| `ValidationReport` | type | What `validatePlugin` returns |
| `WebFetchInput` | type | The input of Claude Code's `WebFetch` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `WebFetchOutput` | type | The output of Claude Code's `WebFetch` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `WebSearchInput` | type | The input of Claude Code's `WebSearch` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `WebSearchOutput` | type | The output of Claude Code's `WebSearch` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `WorkflowCommand` | type | A plugin workflow the session offers as `/<plugin>:<meta.name>` |
| `WorkflowInput` | type | The input of Claude Code's `Workflow` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `WorkflowOutput` | type | The output of Claude Code's `Workflow` tool (official, `@anthropic-ai/claude-agent-sdk/sdk-tools`) |
| `WorkflowsContext` | type | What the host tells the workflow keys besides the layers: plain data, the kit reads no `process.env` |
