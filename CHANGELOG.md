# Changelog

## [Unreleased]

## [0.1.1] - 2026-11-12

### Added

#### format

- `customThemeId(slug, plugin?)` (`./format`) takes the plugin's name and writes
  `custom:<plugin-name>:<slug>`, the preference `/theme` stores for a plugin's theme
  (settings-reference.md, `theme`); `readThemeSetting` reads it back. Without `plugin` it is
  `custom:<slug>` as before.
- `findOutputStyle(styles, argument)` (`./format`): the style the argument of `/output-style
  <style>` names, a built-in or a custom one, without regard to case, or `undefined` when it names
  none. `resolveOutputStyle` falls back to the setting and to Default, so it could not tell a host
  that the argument matched nothing.

#### settings

- `subagentStatusLineInput(base, columns, tasks)`, `runSubagentStatusLine(line, { input, env },
  runner, { signal })` and `readSubagentStatusRows(stdout, tasks)` (`./settings`), with the types
  `SubagentStatusTask`, `SubagentStatusLineInput` and `SubagentStatusLineRun`: the run of the
  `subagentStatusLine` that `session.subagentStatusLine()` selects (statusline.md, "Subagent status
  lines"): the stdin object, one run through `CommandRunner`, and the rows it rewrote by task id
  (`''` hides one). The refresh tick, the environment and drawing a row stay the host's. statusline.md
  is outside the requirement set, so these are judgments (spec/judgments.md).

## [0.1.0] - 2026-11-12

The first public release, on npm under the MIT license.

Grouped by area (format, settings, hooks, skills, agents, marketplace, mods, host, cli, and the
repository's own tooling). A **BREAKING** entry says what a host changes, old → new; it is listed
once, in Changed or Removed.

### Added

#### format

- `writeFrontmatter(fields, body)` and `editFrontmatter(text, changes, body?)` (`./format`): the
  inverse of `parseFrontmatter`, property-tested (2,000 seeded cases of every JSON value shape and
  tricky text: reading back gives the same fields and body). An edit keeps a key's place, comments and
  unknown keys, appends a new key, removes one with `undefined`, and refuses a block that does not
  read (`FrontmatterEdit`). `renderSkillFile`, `renderCommandFile`, `renderAgentFile` write a file
  from `SkillDraft` / `CommandDraft` / `AgentDraft` in the reference table's order; `readSkill`,
  `readCommand` and `readAgent` read it back (judgment `frontmatterWriter`).
- Tests of the whole strict-mode table at `loadPlugin({ entry })`, and the evidence that Claude Code
  merges the entry with `plugin.json` at load and writes no merged file (judgment `mergeAtLoad`).
- Resolved LSP servers, monitors and MCP servers (`ResolvedLspServer`, `ResolvedMonitor`,
  `ResolvedMcpServer`, from `session.lspServers()`, `monitors()`, `mcpServers()`) carry
  `pluginId: string`, the declaring plugin's id as the host names it, the same value as
  `SessionSkill.source.pluginId`.
- `InvocableFrontmatter.frontmatter: Readonly<Record<string, unknown>>`: every skill and command
  keeps its frontmatter as parsed, unknown keys included and values as written (`{}` when the YAML
  does not parse); the kit gives no meaning to a key it does not know. `readInvocable` takes the keys
  it leaves unread (`untaken`).
- `LoadPluginInput.entry?: MarketplaceEntry`: `loadPlugin` merges the marketplace entry with
  `plugin.json` (`mergeEntryWithManifest`, `strict` included), so the entry's replaced hook events
  and the default skills scan reach the load.
- `readMcpbOptions(block)`: a bundle's `user_config` block in the plugin option shape.
- `resolveMcpServers`, `resolveLspServers`, `resolveMonitors` and `ResolvedKind` (`./loading`), and
  `NO_PROGRAM` and `onlyQuotedStrings`; `resolveHookCommand` takes `ofPlugin` and reports
  `notStarted` for a command that names no program.
- `validate` checks a manifest's `userConfig` options (the option-key rule and the `options` list),
  accepts `skills: "."` and an inline `experimental.monitors` array, and its `..` message names the
  path.
- A host's elicitation dialog needs no code of its own: `elicitationFieldProblems(schema, values)` names the problem of each form field (bounds, lengths, `format`, the listed options, the number of options chosen), `ElicitationField` carries the `labels` of its options (`oneOf`/`anyOf` titles, `enumNames`), `default`, `format`, `minLength`, `maxLength`, `minItems` and `maxItems`, and the new `@rsaryev/llx-plugin/elicitation` entry exports these pure functions alone, so a browser bundle takes only them. An `ElicitationResult` hook's `cancel` now reaches the server with the values the user submitted, as hooks.md says; a `decline` still carries none.
- `readMcpbManifest`, `bundleServerOf`, `fillBundleSettings`, `requiredBundleSettings` and `missingBundleSettings` read an MCPB bundle's own manifest (name, server for the platform, `user_config`, variables), so a host that opens bundles keeps no manifest parser; `modelVisibleMcpTool` applies `_meta.ui.visibility` and `boundedMcpErrorText` bounds the error text of a failed call as an error result is bounded.
- A `./layout` subpath exports the standard layout registry without importing the full host,
  parsers or hook/mod engines. Small folder classifiers can depend on this boundary alone.
- `prepareSubstituter` and `prepareContentSubstitution`: synchronous substitution for a host
  that reads a body lazily, with the path variables asked for once when it prepares.
- Repository plugins and workspace trust: `decideRepositoryPlugin` (the folder itself must be trusted;
  a parent's trust and `-p` never suffice; `~/.claude/skills/` is exempt; the primary directory, a
  worktree's main checkout and a managed block), `loadRepositoryPlugin` and its component limits (MCP
  servers wait for per-server approval, bundles and files outside the directory are skipped, monitors do
  not load), `contentGate` (the table of what runs before a folder is trusted), `workspaceTrustKey`,
  `workspaceTrustState`, `settingsHooksMayRun`, `localSettingsVerdict`, `projectEntryApplies` and the
  `WorkspaceTrust` port. The folder-is-a-plugin probe (`probeFolder`: `@skills-dir` needs a manifest,
  `--plugin-dir` does not), `planPluginScaffold` (`claude plugin init`) and `pluginDebugSteps`. An inline
  (`settings`) marketplace on `strictKnownMarketplaces` now needs identical `plugins` as well as the name.
- `removedFromHeadersHelper(name)`: whether a `headersHelper` from a project `.mcp.json` or a plugin runs without `name` in its environment, as Claude Code observed by `bun run oracle:headers-helper-env`.
- `readsAsEmptyInRemoteMcp(name)`: whether a remote MCP server's `url` or `headers` reads `${name}` as empty, for a host that expands its own MCP configs.
- `classifyPluginFolder`: whether a `--plugin-dir` folder is one plugin or a folder of plugins,
  with the edges Claude Code 2.1.319 applies.
- MCP startup and call-timing variables, pure over an environment lookup: `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`
  (`McpTimeouts.idleMs`: 5 minutes for network servers, 30 for stdio, `0` off, raised to one second,
  capped at the tool timeout, floored by the per-server `timeout`, none for IDE and SDK servers),
  `mcpConnectionBatches` (`MCP_SERVER_CONNECTION_BATCH_SIZE`, `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE`),
  `mcpBackgrounding` (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, `CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND`),
  `mcpStartupWaitsFor` (`MCP_CONNECTION_NONBLOCKING`), `mcpFirstTurnWaitMs`
  (`CLAUDE_CODE_MCP_STARTUP_WAIT_MS`), `mcpDiscoveryCache`, `mcpCacheEntryUse` and
  `mcpCacheDiscardedAfterFailures` (`MCP_DISCOVERY_CACHE` and its `_TTL_S`, `_MAX_STALE_S` and
  `_STRIKES`) and `mcpClientSettings` (`MCP_SDK_GENERATION`, `MCP_PROTOCOL_NEGOTIATION`).
- MCP contracts, pure over data: the `oauth` block, redirect, discovery and scopes; `claude mcp add`
  and `add-json`; tool names, hints, root-combinator rewriting and invalid-schema exclusion; result
  limits, persistence and images; MCP prompts; elicitation (modes, forms, URL cap, hooks); the
  `MCP_TIMEOUT`, `MCP_TOOL_TIMEOUT`, `MCP_CONNECT_TIMEOUT_MS` and description-length knobs; reload
  planning; redaction of a plugin server. An unset `${VAR}` in a plugin server is now the error
  `Invalid MCP server config for "<name>": Missing environment variables: ...` instead of a warning.
- MCP `headersHelper` and the subprocess environment, pure over data. `planHeadersHelper` answers
  where a server's helper runs (plugin root, project directory, primary working directory or the
  configuration directory, by where the server was configured), with which environment (credential
  variables removed for a project `.mcp.json`, a plugin and a project or `--add-dir` agent file;
  `CLAUDE_CODE_MCP_SERVER_NAME`, `_URL` with `REDACTED` for a removed variable's live value, and
  `CLAUDE_PLUGIN_ROOT` for a plugin), under 10 seconds, and whether it runs at all: a project or local
  server in a folder without persisted trust (a parent's and the automatic `-p` or SDK trust do not
  count) connects with its static headers and gets the `headersHelper not run` notice, an agent file's
  server in an untrusted folder is not loaded; `persistedTrust` reads `hasTrustDialogAccepted`.
  `runMcpHeadersHelper`, `connectionHeaders` and `attemptWithHeadersHelper` run it fresh each time,
  let dynamic headers win, stop the OAuth fall back on an `Authorization` header and retry a 401 or 403
  once. `scrubEnvironment` and `subprocessScrubEnabled` apply `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`'s
  table (credential names and URLs with a password removed, registry URLs lose their userinfo, GitHub
  tokens, proxies and `GIT_CONFIG_*` kept; the pre-2.1.251 behaviour by `version`). One credential
  classifier (`isCredentialVariable`) serves all of them and the marketplace helper. A monitor
  `command` can opt into `monitorPaths: 'environment-reference'`: the three path variables become
  `${NAME}` references and `ResolvedMonitor.environment` supplies the values, so a path holding shell
  metacharacters cannot inject.
- MCP settings: scope ranking, per-project toggles, project approvals and workspace trust, pure over
  data the host read. `rankMcpServers` loads each server once from the highest of managed, local,
  project, user, plugin and claude.ai connector (names across the three scopes, endpoints for plugins
  and connectors, the whole winning entry, hidden duplicates reported); `claudeJsonServers` and
  `projectFileServers` turn `~/.claude.json` and `.mcp.json` into candidates; `managedServerEntries`
  reads `managedMcpServers` from managed layers only; `readProjectToggles`, `serverEnabled` and
  `applyToggles` apply `disabledMcpServers` and `enabledMcpServers` (one list per kind of server);
  `projectServerApproval` and `canPromptForProjectServers` decide `Pending approval` and `Rejected` for
  `.mcp.json` servers with the untrusted-folder filter. The keys `enableAllProjectMcpServers`,
  `enabledMcpjsonServers` and `disabledMcpjsonServers` join the policy keys, and `resolvePolicy`
  returns an `mcp` area.
- MCP allow and deny lists: `createMcpServerPolicy` (and `resolvePolicy(...).mcp.serverPolicy()`)
  decides whether a server may load from `allowedMcpServers`, `deniedMcpServers` and
  `allowManagedMcpServersOnly`: the denylist of every file first and always, the allowlist of every file
  or only the highest managed one under the lock (a `true` in any admin source locks), `serverUrl`
  patterns with the port rule, exact `serverCommand` arrays, `serverName` only where the list has no
  entry of the server's kind, `${VAR}` expansion of entries (pinned environment) and servers (live
  environment), the servers that skip the allowlist, and the verdict with the messages users see.
  Invalid entries are stripped per the fail-closed rules; the three keys join the policy keys.
- Themes: `readTheme` reads a custom theme file (`~/.claude/themes/<slug>.json`, `themes/<slug>.json`
  in a plugin): `name` defaulting to the slug, `base` among the six presets (asserted against the SDK's
  `theme` setting), `overrides` over the documented tokens with `#rrggbb`, `#rgb`, `rgb()`, `ansi256()` and
  `ansi:<name>` colours; unknown tokens and invalid colours are dropped with an issue. `copyOfPluginTheme`
  is the copy an edit of a plugin theme is saved as. `Plugin.themes` now holds the read `Theme` of each
  file and the plugin it comes from (`PluginPath` is gone: `PluginTheme` and `PluginWorkflow` replace it).
- MCP: `${VAR}` for servers of the settings scopes, not only plugins' (`expandMcpServer`,
  `expandEnvText`): `command`, `args` and `env` of a stdio server, `url` and `headers` of a remote
  one, over a lookup function and no plugin. An empty string counts as set, an unset variable
  without a default keeps its text with a missing-variable warning, a `url` that does not parse
  after expansion drops the server, and the covered credential variables read as empty toward a
  remote server with a debug line naming the ones the user set (`credential-env`, one list for
  plugin and non-plugin servers). `displayReference` gives what `/mcp` and `claude mcp list` show
  (the `${VAR}` by name; a managed server's host only) and `mcpEndpointKey` the endpoint two
  servers are duplicates by (URL spellings that differ only in scheme or host case, default port or
  a trailing slash are one; a command is its arguments too).
- Validating: `validatePlugin({ files, label?, signal? })` reproduces `claude plugin validate <dir>`
  of the tracked Claude Code release over a `PluginFiles` folder: it picks the marketplace, the
  plugin or a bare components folder as the CLI does and returns `{ target, issues }` with each
  issue's `severity`, `file`, `path` and the CLI's own `message`. It checks the manifest (schema,
  advice, unknown fields, declared paths, inline hooks and MCP servers, the map form of `commands`),
  `hooks/hooks.json`, `.mcp.json`, the frontmatter of skills, agents and commands, `CLAUDE.md`, and,
  for a marketplace, every entry and the manifest of each entry inside it; it never follows a
  symlink and says so as the CLI does. Exports `ValidationIssue`, `ValidationReport`,
  `ValidationTarget`, `VALIDATION_TARGETS`.
- Manifest rules the docs state and the kit did not apply: a `userConfig` option's `options` must sit
  on a `string` field that is not `multiple` or `sensitive`, with a `default` from the list or
  `required: true` (else the plugin fails to load); `types` is a `./` path to a `.d.ts` file inside the
  plugin; a `channels` entry bound to a server that is not among the plugin's `mcpServers` is an
  error issue. `resolveChannel` gives a channel its `displayName` (default: the server name) and
  substitutes its `userConfig` into that server's `env`; `validateUserConfigValues` tells whether a
  saved value meets `type`, `required`, `multiple`, `options`, `min` and `max`. The mods reference
  tables the tests compare the kit with are a committed snapshot (`spec/docs-tables.json`), and
  `check:spec` (SP5) compares it and the tools table with the pulled docs.
- Output styles: `readOutputStyle` (`name`, `description`, `keep-coding-instructions`,
  `force-for-plugin`, `<plugin>:<name>` ids, a YAML error loads the style under its file name),
  `resolveOutputStyle` (case-sensitive setting, case-insensitive `/output-style`, a forced plugin
  style overrides both), `includeCodingInstructions` (full prompt only) and `listOutputStyles`.
- `readManifest` and `validateManifest` for `.claude-plugin/plugin.json`.
- A frontmatter parser (`parseFrontmatter`) and the value coercions of skills, commands and
  agents (`readFlag`, `readText`, `readList`, `readTable`, `readEnum`).
- `readInteger` and a mode for `readList` (`separators`, `braces`), the frontmatter API exported
  from the package, `line` and `column` on a frontmatter problem, `HttpRequest.as` and
  `HttpResponse.bytes` for binary bodies, and symlinks and access recording in the `memoryFiles`
  fake.
- Variable substitution in `loading/resolve`: `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`
  (created on first reference, `pluginDataId`), `${CLAUDE_PROJECT_DIR}`, `${user_config.KEY}`,
  `${VAR}` and `${VAR:-default}` in one pass (`substituteTemplate`, `substituteDeep`), the
  per-component policies (`SURFACE_POLICY`, `VARIABLE_FIELDS`), the environment a process receives
  (`exportedEnvironment`, `CLAUDE_PLUGIN_OPTION_<KEY>`) and Windows path rendering.
- MCP servers of a plugin: `readMcpConfig` and `readMcpServer` (wrapper or bare `.mcp.json`; `ws` and
  `headersHelper` on the official stdio, SSE and HTTP configs as `PluginMcpServer`),
  `collectMcpServers` and `classifyMcpSource` (root `.mcp.json` first, then each `mcpServers` source
  in order: `.json` file, inline map, `.mcpb`/`.dxt` bundle path or URL through the new optional
  `McpBundleReader` port, "needs configuration" for a bundle with an unsatisfied required setting),
  and `resolveMcpServer` (variables substituted per transport, credential variables read as empty,
  `headersHelper` rejecting `${user_config.*}` with the documented error, its environment) with
  the reusable `rejectUserConfigInShell` guard.
- `expandMcpServer(name, server, lookup, options?)` with `McpExpansionOptions.readsAsEmpty`
  (`./format`): a host adds its own variable names to the ones that read as empty toward a remote
  server; Claude Code's list still applies (judgment, docs/SECURITY.md).

#### settings

- `workspaceTrustSituation(isFolderTrusted, facts, options?)` (`./loading`): the column of the trust
  table for a host that knows synchronously whether the dialog was accepted for a folder, the same
  answer as `workspaceTrustState` with the same folders asked (no folder above a repository). Its
  options type is `TrustStateOptions`.
- `configDirectoryOf(home, configDir, join)` and `globalConfigFileOf(home, configDir, join)`
  (`./settings`): the one reading of `CLAUDE_CONFIG_DIR` the kit uses, for a host that resolves the
  same directory outside a session (empty is unset; a value is taken as given, neither trimmed nor
  `~`-expanded).
- `applyParentRules(view, context)` and `ParentSettingsContext` (`./settings`): the parent-settings
  rule over a view the host built itself.
- `permissions.denyInsteadOfPrompting` (Claude Code 2.1.321): read from user, managed and
  `--settings` files only, a `true` from user or `--settings` beats a managed `false`
  (`PermissionsPolicy.denyInsteadOfPrompting`). `startPermissions` sets
  `DecideContext.denyInsteadOfPrompting`, so `decide` denies a would-be prompt with the reason
  `no-approval-surface` and the permission callback is not asked; a critical-path removal in auto mode
  is denied at a terminal too. `permissionRequestDecision(decision, outcome)` lets a `PermissionRequest`
  hook answer a prompt or a denial in place of one; `availableTools` leaves out `AskUserQuestion`,
  `EnterPlanMode` and `ExitPlanMode` (`ToolSession.teammate` keeps the plan tools);
  `autoRespondElicitation(output, { denyInsteadOfPrompting })` cancels a request no hook answers;
  `settleClassification` takes `prompts`. The messages: `NO_APPROVAL_SURFACE_DENIAL`,
  `NO_APPROVAL_SURFACE_DECISION_REASON`, and `createRefusalStreak()` with `REFUSAL_STOP_MESSAGE` and
  `REFUSAL_STOP_RESULT` for the stop after 20 refused calls in a row in auto mode.
- `readChannelNotification(params)` reads the params of a channel notification (`content` string required, `meta` kept for identifier keys with string values), so a host does not write its own validator before `channelTag`.
- Managed MCP: `readManagedMcpFile` and `loadManagedMcpFile` read `managed-mcp.json` from the path of
  each platform; `readManagedMcpServers` validates `managedMcpServers` entries (remote `https` only, no
  program, no `${VAR}`, plain names and characters) with a notice for each dropped one;
  `mcpLoadPlan` (and `resolvePolicy(...).mcp.loadPlan`) decides what loads under exclusive control: an
  empty map blocks every other server, `claude mcp add` gets the enterprise-policy error, `--mcp-config`
  and `--strict-mcp-config` exit on a workstation (a cloud session keeps the managed servers and warns),
  connectors need `allowAllClaudeAiMcps`, Claude in Chrome needs `allowClaudeInChromeWithManagedMcp` from
  device sources; `providedServersTiming` and `reconcileManagedServers` say when provided servers connect
  and what a running session adds, reconnects or drops. The keys `managedMcpServers`,
  `allowAllClaudeAiMcps`, `allowClaudeInChromeWithManagedMcp` and `disableClaudeAiConnectors` join the
  policy keys, and `resolvePolicy` takes `deviceManaged` layers.
- The managed sources (`src/settings/managed`). `composeManaged(documents, { parentRestrictive })`
  chooses among remote settings, the MDM policy (plist or HKLM), the managed files and the HKCU
  registry as managed-settings.md ranks them: by default the highest source that delivers a policy
  key, with `managedSourcesBehavior: "merge"` every admin source combined by kind of key (lists union,
  locks take the strictest value, restriction allowlists and values taken whole from the highest
  source, provided MCP servers by name, `env` per variable, login keys from the machine policy), and
  the keys read from every admin source under both. `readAdminDocument` decides when a document is
  present, empty, broken (fatal) or unreadable; `readFileDocument` merges `managed-settings.json` with
  `managed-settings.d/` in alphabetical order; `wslChain` orders the Windows and `/etc/claude-code`
  documents under `wslInheritsWindowsSettings`; `parentSettingsOf` applies `parentSettingsBehavior` and
  the managed values that block a host's parent settings. `readPolicyHelper`, `readHelperOutput` and
  `runPolicyHelper` (through the `CommandRunner` port and the new `HelperFileProbe` of this module)
  judge a `policyHelper` and its failures; `withHelperSettings` makes its output the only managed
  settings. The delivery catalog (`managedFilePaths`, `MECHANISM_TRAITS`, registry and plist names,
  symlink verdict, `cacheAfterFetch`), `sourcesLoadedBy`, `reachOfPlace`, `serverChangeTiming`,
  `startupFetchOf` and `fetchesRemoteSettings` answer where and when a policy applies.
  `SettingsSources.managed` lets a host hand over every source so `loadSettingsLayers` composes the
  tier, `resolvePolicy({ managed })` takes `hasManagedSettings` and `parentMerge` from it, and
  `autoCompactWindow` joins the per-session overrides (`--autocompact`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW`).
- The merge core. `createGeneralView(layers)` extends the policy view with `merged()`, the
  whole of settings.md's precedence as one object: a block merges key by key, a list combines with the
  duplicates removed (the highest file's entries first), any other value comes from the highest file,
  and `fallbackModel`, `modelPicker` (user, managed and `--settings` only) and `availableModels` (a
  managed list as-is) keep their own rules. The 12 keys whose managed value is not an override are rows
  with a `ManagedException` (`disableClaudeAiConnectors`, `enableArtifact` and `disableArtifact`,
  `isolatePeerMachines`, the two `block...Outside...` keys, `autoMode.classifyAllShell`,
  `remoteControlAtStartup`, `crossSessionInbound`, `useAutoModeDuringPlan`, the two claude.ai sync keys
  and `maxEffortLevel`); `get` applies one rule for all of them. `permissions.defaultMode` ignores
  `auto` and `bypassPermissions` from project and local settings. `permissionRuleLists(view, trusted)`
  adds up allow, ask and deny across scopes (a deny at any scope blocks, `allowManagedPermissionRulesOnly`
  leaves managed rules only, a repository's allow rules and `additionalDirectories` wait for trust),
  `effortLevelFor` resolves `modelSettings` one model at a time, `resolveSessionValue` orders a key's
  flag, paired variable and settings value, `editEffect` and `loadsFileCreatedMidSession` say when an
  edit reaches a running session, `reachOf`, `FILE_ORIGINS`, `WRITE_TARGET`, `userSettingsFile`,
  `localSettingsFiles` and `globalGitExcludesFile` hold the scope and file-location facts of
  settings.md, and `readClaudeJson` decides what a broken `~/.claude.json` costs. A global config key
  is dropped from every settings file with a warning, and a source that does not parse is a Settings
  Error (`problemKind`) naming the file.

#### hooks

- `escapeReminderTags(text)` (`./hooks`): the `<system-reminder>` tag escape `mergeOutputs` and
  `limitDelivery` apply, for hook text a host writes into a reminder itself.
- `HookEngineOptions.onceClaims` with `createOnceClaims`, `withoutSpent` and `OnceClaims`: a host
  that builds an engine more than once for one registry passes one that outlives them, as it does
  `stopCap`. Also `SOURCE_POLICY`, `SourcePolicy` and `limitDelivery` (`./hooks`), and
  `SessionDispatchOptions` (root).
- `session.hookEntries()` and `runnableHandlers(entries, session)`: the registered hooks that would run, with their source, for a read-only `/hooks` view.
- `locationsWithoutPlugin`: the scope a host gives `resolveHookCommand` for a settings hook.
- Hooks: `registerHooks` turns a hooks file into registry entries; Settings: `hookSessionGates` reads
  `disableAllHooks`, `allowManagedHooksOnly`, the `hooks` lock, the HTTP allowlists and the settings
  files' hooks off the policy view as the plain data a hook session takes.
- `selectAgentHooks`, `agentHookGroups` and `hooksTrustGate`: the frontmatter hooks of an agent that
  fire for an event (only while the agent is active, the `PreToolUse` and `PostToolUse` matcher
  over the tool name, a subagent's `Stop` converted to `SubagentStop`, none for a plugin agent,
  project-level and `--add-dir` agents skipped until their folder is trusted); `readAgent` reads the
  `hooks` field with every hook event accepted.
- `readHooksFile` and `readHooksSettings`: hook configuration read and validated as hooks.md
  describes (events, matcher groups, the five handler types and their fields), into the official
  `HooksSettings`; and `matchesMatcher`, the matcher grammar of hooks.md (match-all, exact list,
  unanchored regular expression, the narrower set of `FileChanged` and `StopFailure`).
- Hook input (`hooks/input`): `buildHookInput` makes the JSON a hook reads from the session and the
  event's facts: the common fields (`session_id`, `prompt_id` absent before the first prompt,
  `scratchpad_dir`, `permission_mode` with Manual as `default`, `effort` on tool-context events,
  `agent_id` and `agent_type`, `hook_event_name`), facts checked against the official input type of
  each of the 33 events (a wrong type or value is an issue and no input), the conditional fields
  (`SessionStart` cost fields for resume and fork, `InstructionsLoaded` `globs`, `trigger_file_path`
  and `parent_file_path` by `load_reason`), and the `Stop` task and cron entries capped at 1000
  characters with the `… [+N chars]` marker and per-type fields. `serializeHookInput` is the one
  JSON text for stdin and an HTTP body.
- Command hook handler (`hooks/handlers`): `runHandler` runs a `command` hook through `CommandRunner`
  in exec form (`args` present: the executable and one argument per element, no shell, placeholders
  and `${user_config.*}` substituted as plain strings) or shell form (`bash` or `powershell`, the
  placeholders rewritten to `${env:NAME}` for PowerShell, a plugin hook that references
  `${user_config.*}` refused with the documented error), with the event JSON on stdin,
  `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and `CLAUDE_PLUGIN_OPTION_<KEY>`
  exported, `OTEL_*` removed and the documented working-directory fallbacks. `async` and
  `asyncRewake` hooks return a background run at once (no timeout for `async`, a wake text on exit
  code 2 for `asyncRewake`). `planTimeouts` and `handlerTimeoutMs` compute the limit the port
  enforces (600/600/600/30/60, lowered on `UserPromptSubmit`, `PreModelSwitch`, `PostModelSwitch`
  and `MessageDisplay`, the shared `SessionEnd` budget), and `statusMessage` reaches the host's
  observer when a hook starts.
- Remote hook handlers (`hooks/handlers/remote`): an `http` hook POSTs the hook input as JSON with
  `Content-Type: application/json`, interpolating `$VAR` and `${VAR}` in header values only for the
  names in `allowedEnvVars` (unlisted ones become empty strings); an `mcp_tool` hook calls the tool
  on the server it names (a plugin server by its scoped name), substitutes `${path}` from the hook
  input into the string arguments, waits for a connecting server only on events that can block or
  change a result, and reports `isError` as a non-blocking error; `prompt` and `agent` hooks
  substitute `$ARGUMENTS` (with the `\$` escape, the input appended when absent), pass `model` and
  the 30 s and 60 s timeouts, and read the `ok` / `reason` / `impossible` answer. `okFalseEffect`
  says what `ok: false` does on each of the 13 events (`continueOnBlock`, `impossible`, agent hooks),
  and `runLimited` runs at most 12 prompt or agent hooks at once, in handler order.
- The hook verdict and engine: `interpretRun` reads a run as the docs do (the stdout against exit
  code table, exit 2 on each of the 33 events, `onFailure` on `command` and `http` hooks, HTTP
  response handling, `ok: false` of prompt and agent hooks, background deliveries), and
  `createHookEngine` dispatches an event through select, input, run, read and merge into a
  `HookOutcome`.
- Hook output (`hooks/output`): `parseHookOutput` reads a hook's JSON against the schema of its
  event (the universal fields and a `hookSpecificOutput` bound to the official types, a value of the
  wrong type is a validation failure, a key no schema names is dropped); `OUTPUT_CAPS` says which of
  `continue`, `systemMessage`, `terminalSequence`, `decision` and the event's own fields each of the
  33 events honours; `mergeOutputs` merges every hook's output in registry order (`PreToolUse` deny >
  defer > ask > allow, `PreModelSwitch` deny > ask > allow, `PermissionRequest`, `PostToolUse`
  rewrites checked against the Bash, Glob, Grep, WebFetch and WebSearch output shapes, the classifier
  note capped at 2,000 characters, `Elicitation` where any decline wins) into typed `effects`;
  `allowedTerminalSequence` keeps `terminalSequence` to OSC 0/1/2/9/99/777 and BEL;
  `parsePermissionUpdates` validates the six permission update entries (`manual` is `default`);
  `createOutputStage` caps each string of a hook at 10,000 characters, saving the rest through
  `ScratchFiles` with a 2,000-character preview, and is the engine's default output stage
  (`HookPorts.scratch`); `OutputStage` gains `limit`, `merge` takes the event's facts, and
  `MergedOutput` carries `issues`.
- Hook output (`hooks/output`): `SubagentStart` `hookSpecificOutput.additionalContext` is proven
  as a requirement (accepted for that event only, carried from every hook, capped, and no decision
  holds subagent creation back).

#### skills

- `PluginHostOptions.shellArguments?: 'pasted' | 'environment-reference'` (type `ShellArguments`,
  `./skills`): default `pasted`, as Claude Code. Under `environment-reference` a skill's or
  command's bash `!` command gets `$ARGUMENTS`, `$N` and `$name` as references to
  `SKILL_ARGUMENTS` / `SKILL_ARGUMENT_<n>`, the values in its environment, so an argument holding
  `; touch PWNED` or `$(…)` is data in every quoting; `ShellCall.command` has each value quoted
  where it lands. PowerShell stays pasted (judgment `shellArguments`).
- A plugin skill whose folder fixes its name but whose frontmatter `name` differs answers to that
  name too: `Skill.declaredCommand` (new, optional) is the command it gives (`alpha:fancy` for
  `skills/greet/SKILL.md` with `name: fancy`), and `session.expandSkill('alpha:fancy')`,
  `expandSkill('fancy')` and an agent's `skills: [fancy]` preload find the skill, which is still
  listed only as `alpha:greet` (oracle 2.1.322; tests/host/preload-skill-alias.test.ts).
- `readMemoryRule(path, text, scope)` (`./format`) reads a `.claude/rules/**/*.md` file (memory.md,
  "Rule frontmatter reference"); `ruleActivatesFor` and `ruleBase` (`./skills`) match its `paths` on
  the skill gate's matcher, relative to the folder holding its `.claude` or, for a user rule, the
  working directory (judgment `memoryRules`).
- `FILE_SCOPES`, `FileScope` and `isFileScope` (`./settings`); `scopeFilePath(scope, kind, folder,
  name)` and `ScopeFileKind` (`./skills`); `skillPlugin`, `skillScope`, `SkillScope`, `skillKeywords`
  (`./host`, `skillKeywords`); `sessionSkillFixture` and `catalogAgentFixture` (`./testing`), built
  through the kit's own readers.
- `session.recordSkillInvocation(name)`: a skill or command the host ran without `expandSkill`
  triggers its `on-skill-invoke` monitors.
- `session.skillContent(name, { signal }): Promise<SkillContent>` reads a skill or command for a
  host that pins it: the body as written with its absolute `path` and `dir`, through the same lookup
  as `expandSkill`, with no invocation step (`disable-model-invocation`, `skillOverrides`, `!`
  commands, substitution and the base-directory line do not apply); an unknown name gives
  `expandSkill`'s failure. `SkillContent` is exported. `preloadSkills` now hands the same content,
  with the absolute `path` and `dir`.
- `skillTriggerNames(pluginId, skill)` (`./loading`): the names an `on-skill-invoke:` trigger may
  use for a skill that ran. Only the plugin's own skill counts, written either namespaced
  (`ops:deploy`) or bare (`deploy`, the docs' example; judgment J-L11). Before this, the session's
  namespaced names could never match the docs' bare trigger.
- `SessionOptions.hostSkills?: () => readonly HostSkill[]`: the skills a host supplies itself, built
  in or registered at run time by its extensions (`HostSkill`: `name`, `frontmatter?`, `file?`, `body`
  as text or a `BodyReader`). They are Claude Code's bundled skills to the kit (origin
  `{ kind: 'bundled' }`): in the catalog, the model listing, the menu, name lookup, mentions,
  preload and `checkInvocation`, listed after the plugins and the folders; a folder skill of the
  name replaces one, a synced skill's short name yields to one, `disableBundledSkills` and
  `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` remove them, `skillOverrides` applies, and
  `disableSkillShellExecution`, `allowManagedPermissionRulesOnly` and the plugin-only lock leave them
  alone. A refused name or a second skill of one name is a `skillCatalog().issues` entry.
  `readBundledSkill(head, body)` and types `BundledSkillHead`, `BundledSkillRead` (`./format`).
- Until the first `reloadSkills` (or `addDirectory`, `moveTo`), `skillCatalog().issues` and
  `skills().issues` (new `SkillsListing.issues`) carry a warning that the skills folders are not
  read; until the first `reloadAgents`, `agentCatalog().issues` carries the same warning for the
  agents folders. A session without a folder port carries none.
- `session.messageMentions(message, { takesCommandArguments? }?): MessageMentions`: which skills a
  message names (`mentions`, `leading`, `arguments`, `permitted`) without expanding them; it is the
  read `expandMessage` makes, and `MessageExpansion` extends it.
- `readFileReferences(text, { cwd, locations })` and `attachesFileReferences(origin, isolated)`
  (`./skills`), type `FileReference` (root, `./skills`).
- `PluginHostOptions.extraScopeFolders` (and `extraScopeFolders` of a scan context): folders beside
  `.claude`, such as `.agents`, whose `skills/`, `commands/` and `agents/` load in every scope base;
  within a scope the `.claude` folders win a shared name, the scopes keep their documented order, and
  a skill folder there is never a skills-directory plugin.
- `skillLookup`, `SkillLookup`, `NamedInvocable`, `isLeading` and `LeadingMention` (`./skills`);
  `TouchedFile.activated` (the skills a touched file activated, which `skills()` then lists);
  `SessionOptions.permissionContext`; `ExpandRequest.commandEnvironment`;
  `ExpandOptions.runningForks`.
- Export `findInjections` and `runInjections` (with their context, port and result types), so a host that binds skill arguments itself, for hostile input, still finds and runs the documented `` !`command` `` placeholders through the kit.
- Export `substituteArgumentPieces` from the package root, for a host that renders a skill's
  injected commands itself and still needs the arguments counted over the authored text.
- Visibility, access, injection, lifecycle. `skills/visibility` holds the four `skillOverrides`
  states as one registry that the listing, the menu and the invocation check read (`overrideMenuLabel` is
  the `/skills` label); `skillNamesOf` gives the names a `Skill(...)` deny rule sees (nested unqualified
  name, synced and plugin forms, aliases); `stackSkills` expands the first skill plus five stacked after it;
  `invokeSkill`, `startTurn` and `reattachAfterCompaction` keep skill content, grants and the compaction
  budget (5,000 tokens each, 25,000 in all); `launchFork` says what a `context: fork` skill starts;
  `frontmatterIssues` gives the upload error for fields outside the Agent Skills spec. Injected commands
  now follow the Bash tool: output past the inline ceiling is saved through `ExpandPorts.scratch` and
  injected as a path and a preview (`bashOutputMaxChars`), a command moved to the background at its
  timeout renders the skill with a note, exit 1 is classified like Claude's own commands, and
  `disableSkillShellExecution` leaves managed skills alone. `Expansion.ignoredGrants` lists the grants
  the managed settings withheld.
- The skills and command files outside plugins. `scanFolders`, `scanNested` and
  `resolveFolderSkills` read `.claude/skills/<name>/SKILL.md` and `.claude/commands/**.md` of the managed
  directory, `~`, the project and its parents up to the repository root (a linked worktree stops at its
  top and may borrow the main checkout's), each added directory, the directories below the working
  directory a touched file is in, and the skills synced from claude.ai, through a new `FolderScan` port
  (`ports/folder-scan`, with the `folderScan` fake and the shared `foundation/folder-walk`). Names clash as
  skills.md says: enterprise over personal over project, a skill over a command file, a nested or
  added-directory skill under `<dir>:<name>`, a synced skill's short name yielding to any other command;
  a symlinked skill folder loads once. A skill folder holding a plugin manifest is reported as a
  `<name>@skills-dir` plugin. New `managed` skill origin.
- Commands: `readCommand` reads a flat command file (the older skill format: the skill frontmatter
  except `name` and `paths`; the name is the path below `commands/` without the extension, folders
  joined by `:`, after the plugin prefix) and `readCommandEntry` builds a command from an entry of
  the manifest's `commands` object map (`source` or inline `content`, `description`, `argumentHint`,
  `model`, `allowedTools`); `loadCommandEntries` reads each `source` through the `PluginFiles` port.
  A missing source file, an entry with both or neither of `source` and `content`, a refused name
  and a `source` outside the plugin folder are error issues for that entry only; an `allowedTools`
  rule that does not parse is dropped with a warning. The loaded commands expand through
  `expandSkill` and list through `menuEntries` like a skill.
- Dynamic context and `expandSkill`. `expandSkill` turns a skill or command into the text
  the model receives plus its grants (`allowed-tools` with `${CLAUDE_*}` substituted in the Bash
  rules, the docs' same-variable pattern), `disallowed-tools`, execution (inline or fork), model and
  effort overrides (and `${CLAUDE_EFFORT}` as the level the skill runs at) and hooks. `!`cmd`` and
  ```` ```! ```` placeholders are found in the original text and run through the `CommandRunner` port
  (the `shell` field picks the tool, exit 1 of search and comparison commands is a result, a failure
  or a refused permission check aborts the invocation, auto mode and forked skills as documented),
  `disableSkillShellExecution` and synced skills replace or keep them as literal text, and output is
  never re-scanned. `countSkillHooks`, `admitSkillHooks` and `hookSourceOf` apply the documented
  limits on skill hooks. `substituteArgumentPieces` backs the expansion.
- Invocation, listing and execution. `invocationPolicy` and `checkInvocation` give the
  default / `disable-model-invocation` / `user-invocable: false` matrix (who may run a skill, what
  the model is told, the `/` menu, subagent preloading, a scheduled-task prompt) and apply
  `skillOverrides` (not to plugin skills); `readSkillMentions` tells a leading `/name` from one
  named in plain text. `modelListing` and `menuEntries` build the skill listing (description plus
  `when_to_use` cut at 1,536 characters, `<` and `>` escaped, a budget that drops the least used
  descriptions first) and the official `SlashCommand` rows. `skillActivatesFor` matches `paths`
  (gitignore syntax and brace expansion, relative to the current directory, nothing outside it).
  `resolveExecution`, `resolveTurnOverrides` and `resolveShell` decide inline or fork (agent,
  background and the cases that wait for the result), the model and effort override of a turn or of
  the forked subagent, and the shell tool of injected commands. `Skill.shellDeclared` and
  `OriginTraits.honoursSkillOverrides` support them.
- Substitution in a skill's text. `substituteArguments` expands `$ARGUMENTS`,
  `$ARGUMENTS[N]`, `$N` and `$name` over the original text in one pass (shell-style quoting through
  `parseArguments`, `\$` escapes, an index with no argument stays as written, a named one becomes
  empty, an argument value is never expanded, `ARGUMENTS: <value>` is appended when nothing
  received the arguments). `buildVariables` and `substituteVariables` substitute `${CLAUDE_SESSION_ID}`,
  `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}` and
  `${CLAUDE_PLUGIN_DATA}` through `loading/resolve` (the plugin pair for plugin skills only), for the
  body and for the Bash rules of `allowed-tools`; `substitute` does both, arguments first.
  `ORIGIN_TRAITS.substitutesSessionVariables`.
- `readSkill` reads a `SKILL.md` into a `Skill` (the shared `InvocableFrontmatter` of
  skills and commands): `description` (else the first non-empty body line), `when_to_use`,
  `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`,
  `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks` (through the
  hooks reader), `paths`, `shell`, `metadata`, `license` and `compatibility`, with the documented
  defaults; a YAML error loads the skill with its body and no fields, an unknown key is ignored.
  `SKILL_FIELDS` and the `FIELD_READERS` registry, `ORIGIN_TRAITS`, `escapeAngleBrackets`.
- `resolveSkillName` gives a skill its command name: the directory or `name`, the plugin
  prefix (not doubled when `name` carries it, the plugin-root `SKILL.md` falls back to the plugin
  directory), `anthropic-skills:` for a synced skill, and the characters a name can't hold
  (refused outside a plugin, hyphens in a plugin skill folder); `readSkill` uses it.

#### agents

- `SavedWorkflow.description?`: the `meta.description`, always set by `scanSavedWorkflows`.
- `spawnRefusal(catalog, spawnTypes, subagentType)` (`./agents`): the refusal of one Agent call
  whose type the caller's `tools` does not allow, worded as `resolveSubagentType` over
  `spawnableAgents`. Types compare exactly; an omitted type is `general-purpose`.
- `modelFamily(model)` (`./agents`): the family alias a model ID embeds (`claude-opus-5-5` is
  `opus`), read as an `availableModels` family entry reads it, for `resolveSubagentModel`'s
  `mainFamily`. The allowlist and the family share one reading (`format/model-id.ts`).
- A plugin's default `agent` (its `settings.json`, plugins/components.md, "Default settings") runs
  as the session's main agent: `session.selectAgent({ flag }, overrides?)` takes the `agent` of the
  session's settings, else the default of the plugin loaded last that sets one, found by the same
  lookup (`--agent` over the setting over the plugin default; a user agent of the exact name wins
  over the plugin's own), and says `from: 'flag' | 'setting' | 'plugin'` with `plugin` (the id).
  `session.pluginDefaults(): PluginDefaults<DefaultsPlugin>` and
  `session.subagentStatusLine(facts?): SubagentLineRead<DefaultsPlugin>` (a settings source's
  `subagentStatusLine`, else the plugin default with its owner, under the trust and hook gates; a
  plugin value never runs under `allowManagedHooksOnly`). `readSubagentStatusLine`,
  `pluginDefaultsOf`, `valueWithPluginDefaults` and types `PluginDefaults`, `PluginWithDefaults`,
  `SettingWithDefault`, `SubagentLineRead` (`./settings`); `AgentSetting`, `SessionAgentSource`
  (`./agents`); `DefaultsPlugin`, `SessionPluginDefaults` (root).
- Types `PluginSource` (`{ kind: 'plugin'; pluginId }`) and `FolderSource<S>` (`{ kind: 'folder';
  scope }`) (root, `./format`): the one source shape of skills and agents; `SkillSource` is built
  from them.
- `catalogTier(source): CatalogTier` and types `CatalogTier` (`AgentSource | 'builtin'`) and
  `AgentFolderScope` (`./agents`); `catalogAgentOf(record, pluginId?)` takes the host's plugin id.
- `selectSessionAgent` and `session.selectAgent` give `candidates: readonly CatalogAgent[]` with a
  failure: the agents an ambiguous bare name could mean, scoped names in code-unit order (none for
  an unknown name).
- `session.agents({ overrides })`: the `AgentOverrides` of `agentCatalog(overrides)`, so agents a
  host registers at run time (the `--agents` flag, the SDK `agents` option) resolve with the rest.
- `session.preloadSkills(definition, { signal })` returns `{ preloaded, skipped }`: a subagent's
  preloaded skills found by every name, as `expandSkill` finds them.
- Sub-agents: the catalog. `scanAgents` reads the `.claude/agents/` folders of the managed directory, the
  project and its parents, the added directories and `~` through `FolderScan`, skipping the files Claude
  Code skips; `readFlagAgents` reads the `--agents` JSON; `builtinAgents` lists Explore, Plan, general-purpose
  and the other built-ins with the switches that remove them; `resolveAgents` picks one definition per name
  by the documented priority and applies `Agent(name)` deny rules; `resolveSubagentType`, `spawnableAgents`
  (the `Agent(types)` allowlist), `spawnDepthLimit`/`nestingAt`, `namedSubagent`, `agentMentions`,
  `selectSessionAgent` and `resumeSessionAgent` decide who runs, who may spawn whom and how a subagent is
  named. A session gets `reloadAgents`, `agentCatalog`, `SessionOptions.agents` and `permissionRules`, and
  `session.agents()` now lists every subagent (with `source`; `builtin: false` leaves the built-ins out).
  The working-directory-to-repository-root rule is shared with the skills scan (`foundation/project-directories`).
- Workflows: `readWorkflowMeta` and `rewriteWorkflowMeta` read and rewrite the literal `meta` block of a
  saved script without running it, `inspectWorkflowScript` reports the `phases` the body does not use,
  `Date.now()`, `Math.random()`, a no-argument `new Date()` and `import()`; `Plugin.workflows` holds the
  read `meta` and runs as `/<plugin>:<meta.name>`. Pure run decisions in `agents/workflow`: the six-attempt
  stall policy and its three errors, the 1,000-agent and 4,096-item caps, concurrency, which agents run
  again on a relaunch, leaving the session and `nothing to resume`, the usage-limit wait, the `args`
  global, and where a script is saved and which `/<name>` runs (`scanSavedWorkflows` over `FolderScan`).
- `planPreloadedSkills`, `resolveAgentMcpServers` and `planAgentMemory`: what a subagent starts
  with beyond its prompt. The `skills` field preloads the first 32 distinct names, skipping a
  missing or disabled skill and one with `disable-model-invocation: true`; `mcpServers` splits
  references from inline definitions, ignores the field for a plugin agent, skips the inline
  servers of a project or `--add-dir` agent file until its folder is trusted and any server the
  host's `McpPolicy` blocks (`--strict-mcp-config` does not filter an `--agents` definition,
  managed restrictions always apply); `memory` plans the directory of its scope, none when auto
  memory is off, the first 200 lines or 25KB of `MEMORY.md` (`truncateMemoryIndex`) and the Read,
  Write and Edit tools to add.
- `resolveSubagentModel` and `resolveSubagentEffort`: the model a subagent runs on (invocation
  parameter, then the definition with `inherit`, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main
  model; a family alias of the main model's family resolves to its exact model; the FORCE variable)
  and its effort (`CLAUDE_CODE_EFFORT_LEVEL`, then the invocation, then the field, then the session
  level only on the main model). `effectiveAutoCompactWindow` (the variable wins, the field only
  lowers, none for a main-session agent), `turnLimitOutcome` (`maxTurns` marks the output partial),
  `effectiveCacheTtl` (`experimental.cacheTtl`, `1h` ignored while on usage credits),
  `runsInBackground`, `claudeMdScopes` (`omitClaudeMd`), `worktreeDisposition` (`isolation`) and
  `mainSessionFirstTurn` (`initialPrompt`).
- `resolveSubagentPermissionMode`: the mode a subagent runs in from its `permissionMode` and the
  main conversation's (a main `bypassPermissions`, `acceptEdits` or `auto` forces its mode, `plan`
  is held and `dontAsk` then denies instead of asking, under `default` or `dontAsk` the set mode
  applies except `bypassPermissions` and an unavailable `auto`, `manual` is `default`, unset
  inherits); `PERMISSION_MODE_TRAITS` and `baselineDecision` for what each mode runs without asking
  (`allow`, `ask`, `deny` or `classify`), typed over the official `PermissionMode` union.
- `resolveSubagentTools`: the tools a subagent gets from `tools` and `disallowedTools` (inherit
  when omitted, `disallowedTools` first, a specifier removes the whole tool, `mcp__server`
  entries including servers whose name holds `__`, the always-removed list with `ExitPlanMode` kept
  for `plan`, the background built-in set, forks unfiltered, the `Agent(worker, researcher)`
  allowlist for the main thread with `Task(...)` as an alias) and the documented zero-tools
  refusal (`ToolRefusal`); `parseToolEntry` and `toolEntryMatches` for single entries.
- Agent frontmatter fields in `readAgent`: `model`, `effort`, `maxTurns`, `autoCompactWindow` (a
  string such as `200k` reads as 200 and is dropped with `invalid autoCompactWindow`),
  `background`, `omitClaudeMd`, `isolation`, `color`, `initialPrompt` and `experimental.cacheTtl`,
  through a field registry typed over the 19 documented names (`AGENT_FIELDS`,
  `AGENT_FIELD_NAMES`) with the plugin supported and ignored lists (`PLUGIN_IGNORED_FIELDS`); a
  plugin agent reports the fields it ignores in `ignored`; fields Claude Code does not recognize
  are named with a likely intended name in `unrecognized`.
- `readAgent` for agent files (`name` and `description`): the files Claude Code skips (no name is
  documentation, a bad name, no description or YAML that does not parse), the plugin fallbacks
  (file name, `Agent from <plugin> plugin`), `<plugin>:<subfolder>:<name>` scoped names
  (`scopedAgentName`), the name rules (`validAgentName`) and the `agent_type` hooks receive
  (`hookAgentType`).

#### marketplace

- `DependencyIssue.dependency` (the declared `name@marketplace` or `name`) and
  `DependencyIssue.cause` (`DependencyCause`: `'missing' | 'disabled' | 'out-of-range'`, new): a
  host that adds its own install hint reads the facts instead of parsing the message. The message
  stays `Dependency "<dep>" is not installed` with no `claude plugin install` suffix (judgment).
- `catalogDependencies(entry, marketplace, manifest)`, `CatalogPlugin.manifestUnread` and
  `InstallPlan.needs`: an install plan over a catalog whose remote plugins' `plugin.json` is not
  fetched yet names the plugins to fetch; a host fetches them and plans again until `needs` is empty,
  which gives the plan of the whole catalog (judgment `installNeeds`). `ok` is false while `needs`
  is not empty.
- `OFFICIAL_BUT_OFF` and `isOfficialButOff(name)` (`format/marketplace`): the one list of official
  marketplaces whose auto-update default is off, read by the registry's plan and the update pass
  (two copies before).
- Marketplaces:
  - `Registration.autoUpdateFrom` (`SettingsFile`) names the settings file that set `autoUpdate`.
  - `installsAt(records, { projectPath?, platform })` gives the install records that apply in one
    directory.
  - `precheckUpdate(subject, installed)` is the update check before a fetch: `loaded in place`,
    `isUpdate` over a claude.ai record, else `fetch`.
  - `fetchMarketplaceFile(plan, { http }, { signal, headers? })` runs an `http-file` plan.
  - `readMarketplaceText` and `readMarketplaceDirectory` (with `MARKETPLACE_FILE`) read a
    catalog.
  - `MarketplaceMetadata.extra` keeps unknown `metadata` keys.
  - The archive download and the marketplace file download now share one redirect loop
    (`src/marketplace/http-download.ts`).
  - The `headersHelper` runner doc now says the configuration directory must exist first (oracle
    2.1.322).
- `usableVersion`, `winningScope`, `effectiveEnabled`, `isEnabled` and `UpdateVerdict`
  (`./marketplace`); `InstalledRecord.defaultEnabled` and `CatalogPlugin.defaultEnabled`;
  `EnabledEntry` (`./cli`).
- `pluginDirDependencyIssues(plugins)` (`./marketplace`): the `--plugin-dir` plugins of a session
  that do not load because a dependency is not among them, a chain included; the example agent
  skips them and loads a folder of plugins as `--plugin-dir` does.
- Export `rangesOverlap(ranges)`: whether any version satisfies every range, so a host does not fetch a dependency at a combined range no version meets, and `combineRanges` reports the conflict.
- The install and cache lifecycle: `decideInstallMode` (in place, copied or linked, and the printed
  directory refusals), `planTreeCopy` (the symlink rule of a cache copy), `escapedPathIssue`,
  `planInstallStart` and `planInstallFinish` (fetch plan, cache folder, record change, orphaned
  version folders), the troubleshooting messages of a failed install (`install-failures`),
  `commitStagedPlugin`, `selectUninstall` (the Windows spelling rule), `readLfsPointer`, the
  session-only plugins (`readPluginDirectory`, `fetchSessionArchives`, `folderChanges`, `@inline`,
  `@skills-dir`) and the install commands per surface (`planInstallCommand`, `installSummary`).
  Ports: `ArchiveReader.scan` lists a zip's entries (the kit derives the totals and checks the paths
  and links itself, so `ArchiveReader.stats` is gone), `SourceFetcher` may return a staged directory,
  and the new `StagedDirectory` port moves it into the cache. Git fetch plans carry
  `lfs: 'pointer-files'`; an npm `package` refusal and an archive digest mismatch are the
  documented messages.
- Plugin versions and names: `resolvePluginVersion` (manifest, entry, then the source's commit,
  digest or `unknown`; command sources hashed, the entry's version ignored), `copyModeHash`,
  `linkModeHash`, `subdirectoryPathHash`, `unknownVersionSteps`, `pluginNames`, `lookupPlugin`,
  `folderCollisions` and `listingFields`, with the strict-mode and display-field merge rules proven.
- The Node.js package dependencies of a plugin: `planNodeDepsInstall` (a copied plugin with a
  `package.json` and `bun.lock`, `npm-shrinkwrap.json` or `package-lock.json` gets a frozen,
  script-free install in a separate folder under a 60-second timeout; in-place and link-mode plugins,
  unsupported or unreadable lockfiles, a missing package manager, overrides, patches, non-registry
  dependencies, `http` downloads and a `package.json` that differs from the lockfile skip it),
  `nodeDepsRun`, `readLockfile`, `readPackageJson`, `nodeDepsNote` (the `are not installed` and
  `were not installed, because ...` notes, a warning: the plugin loads), `installOutcome` and the
  registry-only rule (`classifySpecifier`, `dependencyRefusal`, `downloadLinkRefusal`) that the npm
  source's `package` check now shares.
- Marketplace dependencies: a pure dependency graph over plain facts. `installClosure` plans the
  transitive install of a plugin's dependencies (dependencies first, each step with who asked, every
  range, what the ranges resolve against and the shown `2.1.0-8713c5b11005` version; cycles end, a
  diamond combines its ranges, a conflict or an allowlist refusal installs nothing, a `command`
  source and a `headersHelper` entry are left to the user); `enablePlan` (missing, policy-blocked and
  higher-scope `false` dependencies), `disableDecision` (the dependents to disable first and the
  chained command), `orphanedAutoInstalled`, `planPrune` and `planUninstall` (`--prune`, the range
  released with the last constraining plugin); `checkDeclaredDependency` for the
  `--plugin-dir` copy. The dependencies guide is now proven section by section.
- Updates: a new `updates` module with the refresh before an install (`refreshBeforeInstall`: named
  and bare references, the five skips, the managed block that also refuses the install,
  `refreshFailed`), the auto-update precedence (`marketplaceAutoUpdate`, `autoUpdatePassAllowed`,
  `toggleDecision`, the plugins a pass skips, the first-pass delay on the `Clock`), the background
  check of a private marketplace, the re-runs of a `command` source and the Errors-tab entry of a
  changed command (`commandSourceRuns`, `afterCommandRun`), `Update plugins now` (`planUpdate`) and
  the version policy of Claude Code (`readVersionPolicy`, `pickAllowedVersion`, `startGate`,
  `channelSwitch`: `autoUpdatesChannel`, `minimumVersion`, `requiredMinimumVersion`,
  `requiredMaximumVersion`). `scripts/check-layers.ts` gives the module its layer.
- The version of a plugin as Claude Code computes it (`resolvePluginVersion`: manifest,
  then entry, then the source type's default, a command source from its hash), when a new copy is
  made (`isUpdate`, `checkForUpdate`, `loadsInPlace`: only a differing version, never for a plugin
  loaded in place, the claude.ai-recorded version for a synced plugin) and the check of a
  release-channel pair (`checkReleaseChannels`). The renames migration, `forceRemoveDeletedPlugins`,
  release tags and the `ref`/`sha`/`#ref` hold on a version are now proven against the pages that
  describe them (plugins/host-marketplace.md, plugins/publish.md, plugins/org.md).
- Install records: the state Claude Code keeps under the plugins root, and the texts it prints about it
  (plugins/loading.md, plugins/troubleshooting.md, plugins/install.md, plugins/cli-reference.md).
  `createStoreLayout` and `resolvePluginsRoot` name every path (`cache/<marketplace>/<plugin>/<version>`,
  `data/<id>`, `marketplaces/<name>`, `synced/`, `.trash/`, the JSON records, the dated copies);
  `parseInstalledPlugins` reads `installed_plugins.json` and decides what is rebuilt, set aside or
  left unwritten, `loadInstalledPlugins` carries it out through the new `PluginStateStore` port;
  `parseKnownMarketplaces` reads `known_marketplaces.json` (a source is `kind: 'directory'` or
  `'file'`, never `local`) with `installLocationFor` and `sameMarketplaceSource`; `stageReport` says
  how far a plugin got (declared, fetched, loaded) and `planMarketplaceStartup` what happens to
  marketplaces missing on disk at the start; `decideEnabledFetch` and `overriddenUserDisable` answer
  "enabled in project settings but not installed" and "disabled but still loads"; the exact
  troubleshooting texts (`pluginNotFound`, `notCached`, `ignoredLine`, `failedToInstall`,
  `refuseForUnreadableRecords`, ...); plans for the panel, marketplaces, plugins with dependencies
  (`planInstall`, `planEnable`, `planDisable`, `planUninstall`, `planPrune`), scopes (`scopeReach`,
  `defaultScope`), `/reload-plugins` (`reloadSummary`, `reloadGate`) and the 14-day orphan sweep
  (`orphanSweep`). Pure decisions; effects only through ports.

#### mods

- `MOD_SCAN_ISSUE_CODES`, `ModScanIssue`, `ModScanIssueCode`: every `ModScan.issues` item has a
  stable `code` (judgment `scanIssueCodes`), so a host need not match the message.
- `commandRunEnd(registeredBy, command, host)`: the one end of `command.run` for both doors
  (`ModsHost.runCommand` and `$.command.run`). A command a mod registered that no hook answered ends
  in `unansweredCommandReply` and never reaches the `commands.run` port, so a host port that
  dispatches back into `runCommand` can no longer run it twice (judgment `modCommandEnd`). The
  `ModCommands.run` doc states the contract: the command's body only.
- `ModsHost.endSession(reason, options?)` fires `session.end` with `sessionId` and `resume: { id }`
  from the session port's id (declarations 2.1.321, :12106; `sessionEndResume`). `SessionEndReason`.
- `command.run` carries `origin` and `presentation` (`CommandPresentation`, `commandPresentation`,
  `ModsApiOptions.presentation`); `ModsHost.runCommand(command, args, options)` takes
  `RunCommandOptions` (`FireOptions` and `origin?: CommandOrigin`, default `{ kind: 'unclassified' }`).
  The D9 difference `command.run`'s `presentation` is gone (`commandRunPins`).
- `$.command.list()` rows carry `source` and `plugin` (`CommandListing`, `CommandSource`); the
  optional port `commands.list()` gives the host's own commands, listed first.
- `$.ui.panes()` rows carry `isShown` and `isFocused`; `ModInterface.shownPane()` and
  `focusedPane()` (optional) say which (`panesShown`).
- JSX takes `key` on every tag; an element whose props declare none drops it (`jsxKey`).
- `$.http.fetch` `init.auth` and `init.socketPath`, passed as `FetchRequest.auth` and
  `FetchRequest.socketPath`; a relative `socketPath` or one with NUL is refused; `compress` changes
  nothing and a `{ base64 }` body stays refused (`httpInit`).
- The members of `$` and the engine event the declarations add over the reference page (2.1.321,
  spec/judgments.md D1, settled): `$.prompt.paint(request)` fires `prompt.paint` and answers
  `{ isPainted, text, cursor }`; `$.prompt.media({ id, offset? })` fires no event and answers the
  slice, `{ unreadable }` or `{ deny }`; `$.session.surface()` is the first of `surfaces()` or
  `null`; `$.session.identity()` fires `session.identity` for a mod of managed settings (tier
  `prepend` or `append`) and answers `{ deny }` to any other; `$.ui.cancelNotify(key)` fires
  `ui.cancelNotify { key }` and answers `{ isSent }`; the engine event `prompt.change`
  (`{ text, cursor, origin }`, answered `{ text }`, observe only). New optional ports with declared
  defaults (`ModOptionalPorts`): `account` (`identity()`, default `{ kind: 'none', isVerified:
  false }`), `promptBox` (`paint(request, plugin)`, default nothing painted; `media(request,
  plugin)`, default `{ deny }`) and `notifications` (`cancel(key, plugin)`, default `{ isSent:
  false }`); types `SessionIdentity`, `ModAccount`, `PromptPainted`, `PromptMedia`, `ModPromptBox`,
  `ModNotifications`. New names: `DECLARED_API_MEMBERS`, `MODS_API_REFERENCE`,
  `DECLARED_EVENT_NAMES`, `ENGINE_EVENT_NAMES`, `DeclaredEventName`, `EngineEventName`.
- `ModsHost.registered` (`ModsRegistered`): what mods registered, as a host reads it:
  `commands()`, `tools()`, `agents()` (frozen copies), `command(name)`, `tool(fullName)`,
  `agent(name)` and `onChange(listener)` → stop, told `'commands'`, `'tools'` or `'agents'` after
  each change. Also `registeredView(registries)`, `RegisteredKind`, and `ModRegistries.onChange`.
- The scan reads a `Client` written in JSX, `h(Client, { module })` (claude-code/index.d.ts:16450:
  JSX compiles to bare `h(...)` calls), as `Client({ module })`, spans included.
- The scan accepts every ES form that exports a top-level function of the entry as `register`:
  `export { register }`, `export { draw as register }`, `export { draw as 'register' }` (what a
  bundler emits), before or after the function, beside `export function` and `export const`.
- `./mods/elements` and `./mods/isolate` export `UI_SURFACES` and `UiSurface`; `./mods/isolate`
  re-exports every name of `./mods/elements`.
- `./mods/isolate` also exports `elementFn(name)` and `elementNameOf(value)` (the element
  constructors, one shared function per element, and the name of one), `h(tag, props, ...children)`
  and `Fragment` (a column `Box`, claude-code/index.d.ts:16469) for JSX, `matchesEvent(matcher, e)`
  and `acceptsField` (a hook's matcher, as the chain tests it), `isHookBody`, `deepFreeze`,
  `frozenCopy` and `plainDataProblem`; the same names are in `./mods`, and the import-walk test still
  shows nothing under the entry imports a `node:` or `bun` module or a package. Proven in
  tests/mods/ui/jsx.test.ts, tests/mods/chain/match-local.test.ts and tests/entry/mod-isolate.test.ts.
- `ModScan.surfaceModuleSpans`: `{ module, start, end }` per surface module a `Client` names, the
  offsets of its string literal (quotes included) in the hooks module, so a host can rewrite the
  path where it bundles. `surfaceModules` is unchanged. Proven in tests/mods/load/scan-client.test.ts.
- `createModsHost` takes `ModHostPortsInput`: the ports by group (`ModPlatformPorts`,
  `ModSessionPorts`, `ModOptionalPorts`), with `mcp`, `audio`, `theme` and `telemetry` optional. A
  missing one answers as the declarations say where the capability is missing
  (`OPTIONAL_PORT_DEFAULTS`, `withDefaultPorts`). `ModHostPorts` is the full set, as before. Proven in
  tests/mods/api/optional-ports.test.ts.
- `ApiMember.ownTime` (`describeApi`) and the export `OWN_TIME_CALLS`: `$.clock.sleep` is the one
  call whose time counts against the calling hook's budget (claude-code/index.d.ts:3641, :6589), for
  a host that routes calls from another realm through `HookCall.api`.
- `next.event`, `next.is(pattern, e)` and `next.trace` (`TraceEntry`, `TraceOutcome`), as declared;
  `HookCall.name` and `HookCall.trace()`; `selects`, `SKIP_TIERS`.
- `TIERS` and `INSTRUCTION_FILE_KINDS` in `claude-code` (`STATE_LIBRARY_SOURCE`, `./mods/isolate`).
- `describe(name, body)` in `claude-code/testing`; titles join with ` > `.
- `Text` takes `dir` (`ltr`, `rtl`).
- `StateListener`: `createStateStore` listeners get the member `id`; a family member's write redraws
  only what read that member.
- `splitHandlers` and `joinHandlers`: a drawn tree as JSON with its controls' callbacks apart by
  key, and back.
- `ModScan.surfaceModules`: the surface modules a hooks module's `Client` elements name, read off
  the source as Claude Code 2.1.322 reads them (a string literal, relative, inside the plugin);
  `validateMod` prints them and fails a missing one.
- `@rsaryev/llx-plugin/mods/isolate`: the `$.state` helpers, `STATE_LIBRARY_SOURCE` and the
  element checks for code inside an isolate, with no `node:`, `bun` or package import below it.
- `./mods/elements`: the element table of mods and the checks of a drawn tree, a leaf for a UI
  process (no host, no port, no `node:` import); the same names stay in `./mods`.
- `EVENT_RULES`, `API_RULES`, `uiRules`, `REGISTER_RULES`, `EventRule` and `EventRuleBook` (`./mods`).
- `ModsHostOptions.fetchPolicy` and `ModsApiOptions.fetchPolicy` (`FetchPolicyFacts`): `$.http.fetch`
  follows the organization's WebFetch policy and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`.
- The mobile app is a mods surface: `UI_SURFACES` holds `mobile` and the `Backdrop` site is raised
  in it (`backdropRender(backdrop, 'mobile')`, `e.surface` `mobile`). It draws what the Desktop app
  draws: `ELEMENT_COLUMN_OF` maps each surface to its column of the elements table (judgment).
- `$.theme.set({ backdrop: { id, colorScheme?, glass? } })` and `$.theme.clear()`, and the
  `Backdrop` render site: the session holds one backdrop whichever mod set it
  (`ModRegistries.backdrop`), the host says whether an app draws it and hears each change (the
  `theme` port, `ModTheme`), and `backdropRender` builds the site's event (`requestId` `backdrop`).
- `breakPromptCache`: `prompt.section` and `tool.describe` answers carry it, `$.ui.invalidate` takes
  `'prompt.section'` and `'tool.describe'` (the host runs those hooks again through
  `ModInterface.rerun`), and `nextTurnText` says what Claude reads on the next turn and whether the
  prompt cache starts over.
- `$.ui.place({ id })` and the `Placed` render site: the kit keeps each mod's rows (500 at most),
  resolves `{ isPlaced: true, requestId }` or `{ isPlaced: false, reason }`, and the host says
  whether it draws placed rows (`ModInterface.drawsPlacedRows`) and when rows go away
  (`ModsUi.placed.rewind`, `compact`, `end`). `$.ui.view(view)` passes to the host's
  `ModInterface.view`.
- Mods chain for a host that keeps one chain for many mods: `ModPluginInfo.position` (where a mod runs among the mods of its tier, whenever it registered), `DispatchOptions.only` takes a set of mod names, `ModChain.hears(event, only?)` says whether a mod has a hook for an event, and `DispatchOptions.trace` reports the hooks of a dispatch and what each did (`DispatchTrace`, `HookStep`), so a host registers each mod once and scopes an event to the mods of a project instead of building a chain for every event.
- `STATE_LIBRARY_SOURCE` is the JavaScript text of `atom`, `read` and `update` for a host that bundles them into an isolate; `atom` now returns a frozen value. `contextUsage({ tokens, window })` builds the `context` of `$.session.usage()` and `session.measure`.
- `settleModApi` and `runScopedModCall` share the built-in API's namespace lending and turn-start
  admission with hosts supplying their own API adapters; no second engine-create policy is needed.
- Enforce managed hook protection in the chain before user matchers/callbacks, retain original
  metadata across trusted rewrites, and expose the documented per-mod guarded-hook notes.
  Built-in and organization tiers keep access. Add lifecycle and readonly-origin regressions.
- Supply the canonical, fail-closed settings merge by default to the mods settings bridge.
  Add full-artifact agent skill preloads, output-style system-prompt parts, LSP process preflight
  plans and debug-only empty-command-directory diagnostics.
- Mods, `describeApi` and the guide of the mods API (reference.md, overview.md, interface.md, api.md).
  `describeApi(api)` describes a mod's `$` as plain data (namespace, member, kind, whether it answers
  later, the event a call fires) so a host that runs mods in another realm can rebuild it.
  `ModsHost.resetState()` resets every `$.state` value for `/clear`, `/resume` and `/branch` and redraws
  what read them; `ModsHost.input.notice(kind, deliver)` holds a subagent's finish notice and the notice
  that a monitor ended until the user's next input and drops a monitor's events while the session is
  stopped. A `$.store.set` or `delete` no longer loses a write of another session that was in flight: the
  changes of one plugin's store go one at a time. Tests prove the "Mods API calls" rule on the
  reference's own examples, the six things a mod can reach, the `$.state` declaration, manifest `types`
  field, atom rules, the load again after `/clear` of test.md, and the store sharing of interface.md.
- Mods, crash behaviour and refused calls (troubleshoot.md, api.md). `ModRuntime.onCrash` lets a
  runtime that shares one worker tell the host the worker stopped: the mod it traced the stop to is
  unloaded (`<mod> was unloaded: it crashed the hooks worker`), the others get a fresh copy of their
  module, and the third stop that cannot be traced unloads every mod that is not built in
  (`hooks: mods that run in the hooks worker are off for this session: it crashed 3 times`;
  `reload()` turns them back on). The `$.prompt.submit`, `$.command.run` and `$.agent.spawn` calls a
  fresh copy's `session.start` repeats resolve with the first copy's result and are not made again,
  with the line `its session.start ran again in a fresh copy`. A registration from a module that is
  no longer loaded rejects (`$.agent.register refused: the hooks module that made the call is no
  longer loaded`). `createRunGate` and `ModsHost.input` model the session's input (`interrupt`,
  `userInput`, `endInput`, `--max-turns`, `--max-budget-usd`): refused calls return what the page's
  table says, and a prompt or command still queued when the user stops the turn is dropped.
  `ModsHostOptions.onNotice` receives the lines that come outside a call to the host.
- Mods, per-mod load and unload, and where mods run. `createModsHost` keys a mod by its name: `load`
  of a plugin already loaded replaces it and no longer adds a second copy. New `loadMod(plugin)` loads
  one plugin among the loaded ones (tier from policy, last in its tier, a note when the policy would
  have put it earlier, the built-in guard first when policy needs it) and `unloadMod(name)` turns one
  off (idempotent, drops the mod from the approval ledger and the refusal book, and `reload` does not
  bring it back). `ModLoadReport.notices` carries the lines a person reads with where each is read
  (`modLineChannel`: transcript, stderr of `claude -p --plugin-dir`, debug log; a refusal by another
  mod in the debug log of a `claude -p` run and in the transcript of an interactive session that
  loads a plugin directory or hot-reloads; `hotReload` is a getter, read on every line). `whereModsRun` gives overview.md's table (hooks and drawing per place,
  the VS Code versions) and `decideModLoad` refuses an installed plugin in a WSL session of the Desktop
  app and, in the cloud, one that does not reach the session; `modsVersionProblem` names the first
  versions that load mods. `writtenModRefusal` says why a mod Claude wrote cannot load,
  `createHotReloadGate` is the hot-reloading question (off after three unanswered), and `changeNotice`
  words the transcript line of a change that did not load. Tests for the 29 requirements of the
  overview, create and troubleshoot pages on loading, enabling, refusals and where mods run.
- Mods, two seams of load. `ModCompiler.compile` returns `{ scan?, run?, issues }`: `scan` is an ES
  module the static scan reads (`claude plugin validate`, `plugin.register`'s `e.uses`), `run` is the
  code and format (`esm`, `cjs`, `iife`...) the host chose for its engine, which `ModRuntime.load` now
  receives with its `format`. A compiler whose run output is an ES module may return it alone; a CommonJS
  scan output is refused with a message that names both outputs. New `MatcherEngine` port
  (`createModChain({ matcherEngine, matcherMs })`, `createModsHost` likewise): the regular expressions of
  hook matchers are tested there, under a limit, instead of on the host thread, and a test the engine
  refuses or does not answer is no match plus a skipped-hook line. The lines of skipped hooks follow
  troubleshoot.md: the transcript or stderr gets the first of each mod, event and kind (`throw`,
  `timeout`, `wrong-shape`) until the mod reloads, the debug log gets every occurrence (`HookReport.kind`).
  A runtime or compiler that throws is a `hooks module did not load` line, a stack overflow the
  documented reason (`engineStackIssue`, `the engine ran out of stack linking the file and its imports`,
  `...loading the file (code nested too deep): <message>`), the parser's reason has no line number, and
  a `Client` error with no message is `the module failed without a message`. `DispatchOptions.before` is
  where the managed `PreToolUse` hooks run, ahead of the first mod. 19 requirements of the mods events,
  overview, create and troubleshoot pages are now proven (18: the linking reason is a judgment, see the
  review fixes).

#### host

- `docs/SECURITY.md`: where the kit is deliberately stricter than Claude Code (path variables in a
  `!` command, a plugin's `headersHelper` and a monitor `command`), with what Claude Code does, an
  input that shows the hole, the corpus cost and the `shellPaths: 'pasted'` option; the security
  fixes that are not deviations; and the risks the host owns (running hook commands, `$ARGUMENTS`
  and `${user_config.*}` in `!` commands, trust prompts, the ports). Linked from README.md and
  docs/API.md.
- `pluginsWithDependencies(plugins)` (root entry): the load-time dependency verdict a session
  applies, as a pure function for a host that starts plugins outside a session. Each plugin is given
  as `{ id, plugin, enabled }`; back come `plugins` (`{ id, name, enabled }`, as `session.plugins`)
  with every plugin whose dependency is not installed, disabled or outside its range off,
  transitively, and `issues`, one `DependencyIssue` per such plugin under its id, carrying the
  `errorType` (`dependency-unsatisfied`, `dependency-version-unsatisfied`) to match on instead of
  the text. The host state calls the same `withDependencies`, so the two cannot disagree
  (tests/host/plugin-dependencies.test.ts compares them).
- `SessionOptions.parentSession`: a subagent's session opened with its parent's shares the parent's
  monitor ledger (a plugin monitor "runs in the background for the whole session",
  components.md), so what the parent handed out is not started again, and a skill the subagent runs
  triggers its monitors once for both. A session the host did not open throws
  `parentSession: not a session this host opened`. Proven in tests/host/session-monitors.test.ts.
- `availableTools` reads host tool names: `ToolSession.names` (a `HostToolNames`) is read the same
  way `resolveSubagentTools` reads `ToolPool.names`. A host tool goes when a bare deny removes any of
  its Claude Code names. `SessionOptions.toolNames` now says, and a test shows, that an MCP tool
  called by its `mcp__<server>__<tool>` name needs no entry, a per-run server included.
- `mergeToolCheck` takes the verdict `{ tightenOnly }` in place of `{ mode }`, and
  `hookTightensOnly(mode)` gives it, for a host with no `PermissionMode` to hand.
- A host tool may stand for several Claude Code tools, and a call's Claude Code name may depend on
  its input: `HostToolNames.toClaude` takes a list (`Search: ['Grep', 'Glob']`), and
  `HostToolNames.callName(hostTool, input)` names one call. `ToolNames` gains `claudeNames(hostTool)`,
  and `claudeName(hostTool, input?)` reads the input. Every consumer reads the call's name the same
  way: a dispatched event's `tool_name` (from `tool_input`), `checkTool`'s rules (from the input that
  runs), `resolveSubagentTools` (an entry naming any of the names grants the host tool, a
  `disallowedTools` entry naming any of them removes it), and the mods tool events through the new
  `ModToolFlow.names` (`tool.call`/`tool.check` and their matchers see the Claude Code name, the
  host's callbacks its own).
- `session.monitorLedger()` and `SessionOptions.monitorLedger`: a session reopened over the same chat
  continues from the previous one's handed-out monitors and skill invocations, so nothing starts
  twice. `MonitorLedgerState` is exported.
- One monitor lifecycle in the session: `session.monitorsToStart(options?):
  Promise<Resolved<MonitorStart>>` returns each monitor of the enabled plugins once: the `always`
  ones (at open, and for a plugin an update enabled), and the `on-skill-invoke:<skill>` ones whose
  skill a successful `expandSkill` ran, which the session records itself. Each `MonitorStart` is
  `{ monitor, cwd, env }`: the session directory, and `subprocessEnvironment('monitor')` with the
  monitor's path variables. `session.monitorsToStop(event)` gives the `MonitorId`s
  (`{ pluginId, name }`) to stop: none for `'plugin-disabled'`, all for `'session-ended'`. Types
  `MonitorPart`, `MonitorStart`, `MonitorStartOptions`, `MonitorId` (root), `MonitorStopEvent`,
  `InvokedSkill` (`./loading`).
- `HostToolNames` (`{ toClaude?; missing? }`), `toolNamesOf(names): ToolNames` (`./rules`),
  `ToolPool.names` and `SessionOptions.toolNames`: a host whose tools carry other names states once
  how they correspond to Claude Code's; subagent tool resolution, hook matching (`tool_name`,
  `matcher`, `if`) and `checkTool`'s permission decision read the Claude Code name, and
  `resolveSubagentTools` returns the host's names.
- `SubagentModel.kind: 'inherit' | 'alias' | 'full-id'`: what `resolveSubagentModel`'s `model` is,
  for a host that routes models itself (`'inherit'` whenever it is the main model).
- `CLAUDE_CONFIG_DIR` moves every user-scope folder the kit reads (env-vars.md, claude-directory.md;
  probed against Claude Code 2.1.322): the personal skills, commands, synced skills and agents of a
  session follow it, read from the session's `Environment` port with the user and managed settings
  `env` over it. `ScopeRequest.configDir`, `MemoryContext.configDir`; a session's own
  `DecideContext` protects the configuration directory. `extraScopeFolders` stay below the home.
- `session.skillCatalog({ activated? }?): SkillCatalog` (`{ skills: readonly SessionSkill[]; issues }`):
  every skill and command the session can invoke, with every name it answers to, its source
  (`{ kind: 'plugin', pluginId }`, `{ kind: 'folder', scope }` or `{ kind: 'host' }`), its validated
  head, its `skillOverrides` state, `policy`, `listed`, `dormant`, and where it lives: `file` and
  `directory`, absolute for every source, `directory` being the value of `${CLAUDE_SKILL_DIR}`
  (`SkillPlace`; a command has no directory, an inline manifest command no file). `skills()` is
  built from these rows and `expandSkill` finds them by the same names; no port is called (a plugin
  root is asked once per host generation, when the entries are built). Types `SessionSkill`,
  `SkillCatalog`, `SkillSource`, `HostSource`, `SkillPlace`, `SkillCatalogOptions` (root, `./host`);
  `listedAs` and `isDormant` (`./skills`).
- `SessionOptions.settings?: PolicyView`: a session's own settings (its project's user, project and
  local layers, plus any `flagSettings` layer of the host), replacing the host's for that session:
  which plugins run and everything they expose. `PluginSession.plugins` lists the host's plugins
  with whether they run in the session.
- `readCatalog(plugin): PluginCatalog` is exported (root and `./host`).
- `SessionOptions.plugins?: readonly HostPlugin[]`: a session's own plugins (its project's installs,
  `--plugin-dir` plugins), beside the host's in that session only; one under a host plugin's id
  replaces it there. `SessionOptions.userConfig`: a session's saved values, replacing the host's.
  `PluginSession.issues`: the issues of the session's plugin set.
- Copies of one manifest name from different origins follow plugins/loading.md "Name conflicts"
  in the host and in each session (managed, `@inline`, installed, `@skills-dir`, `@synced`).
- `session.checkTool(call, { ..., resolver? })`: with a `PathResolver`, the symlink check runs over
  the input that runs (`prepareCall`, and `resolveRuleDirectories` when the context has no
  `realDirectories`); a path that cannot be resolved is `decision: { outcome: 'deny', reason:
  'unresolvable-path' }` with `ToolCheck.refused` holding the `PortFailure`. `DecisionReason` gains
  `unresolvable-path`.
- `SessionOptions.locations?: Locations`: a session's project folder and plugin folders, replacing
  the host's `ports.locations` for everything the session resolves (hooks, skills, agents, MCP and LSP
  servers, monitors, folder reads). Its `pluginRoot(id)` answers for the session's own plugins.
- `./package.json` is exported. Every other subpath has a `llx-plugin-source` condition (the
  `src` entry, for a path-linked host's tsc through `customConditions`) and a `default`.
- `@rsaryev/llx-plugin/sdk`: `sdkHooks(session)` gives the `hooks` option of a Claude Agent SDK query that runs the session's plugin hooks, and `toSdkHookOutput(outcome)` writes a merged outcome as one SDK callback's JSON.
- `session.checkTool(call, { toolUseId, permissionContext, signal })`: the `PreToolUse` hooks, then
  `decide` over the input they return, in one call (`{ hook, input, decision }`).
- `policyContext(facts)`: a `PolicyContext` whose missing facts grant the least.
- `structuredPatchOf(diff)` turns a unified diff into the `structuredPatch` hunks of an `Edit` or `Write` result, so a host that reports tool results to `PostToolUse` hooks does not parse diffs itself.
- `bashFileTargets(command, paths)` reads the files a Bash line names for `Read` and `Edit` rules (file commands and redirection targets), so a host does not keep its own list of them.
- `SessionOptions.ports`: a session binds its own hook ports (model evaluators, MCP caller, observer), so one `PluginHost` can serve many sessions; `withTurn({ ports })` binds those of one run.
- Interactive user-config dialog plans, the published default plugin trust warning, and monitor
  release gating and shutdown decisions. Add spec proofs for saved configuration, trust refusals,
  manifest prose and documented validator diagnostics without changing the requirement registry.
- Host: `HostPorts.folders`, `SessionOptions.addedDirectories`, `session.reloadSkills` (the first read and
  `/reload-skills`) and `session.touchFile`; `strictPluginOnlyCustomization` for skills is applied to the
  folders. A plugin skill is also typed by its frontmatter `name` without the prefix when no command uses
  it. `readSkillMentions` takes the listed `names`, so `/apps/web:deploy` is one word.
- Host: `SessionOptions.takenCommands` (the host's built-in commands, bundled skills and MCP prompts a
  synced skill's short name yields to); `session.addDirectory` (`/add-dir`) and `session.moveTo` (`/cd`),
  which read the folders again on a live session and keep its skill hooks, `once` keys and nested
  directories; `session.skillSources()` with each listed folder skill's scope, origin, names and the names
  it gave up (`yielded`, `heldBy`) and the `shadowed` ones, for the `claude.ai sync` group of `/skills`.
- Host: `session.withTurn(turn)` returns the same session for one turn. A turn replaces only the
  `permissionMode`, `effort`, `cwd`, `additionalDirectories`, `permissions` (the shell answer),
  `promptId`, `scratchpadDir`, `agent`, `folderTrustAccepted` and `interactive` it names, and shares
  what must outlive a turn: the skills' registered hooks, the `once` keys already consumed and the
  limits on skill hooks. The session it is called on does not change.
- Host: `SessionOptions` carries `promptId`, `scratchpadDir`, `agent` (`id`, `type`) and
  `folderTrustAccepted` into the hook input (`prompt_id`, `scratchpad_dir`, `agent_id`,
  `agent_type`) and the workspace-trust gate of a project subagent's hooks.
- Host: `expandSkill` registers a skill's frontmatter hooks into the session (they keep running for
  the rest of it, `once` removes one after its first successful run, a skill past 1,024 hooks or
  16,384 matcher characters for its source "registers none of its hooks"); a manifest command's
  invalid `allowedTools` rule is reported as `loadCommandEntries` reports it; `allowManagedPermissionRulesOnly`
  in a managed layer takes away the `allowed-tools` grant of project, personal, synced and
  skills-directory skills.
- Host: `createPluginHost({ plugins, ports, settings?, userConfig? })` and `host.openSession(...)`,
  the public entry that composes the loaded plugins, the skills, hooks, agents, settings and ports. A
  session lists skills and commands as `<plugin>:<name>` (invocation flags, budget), expands them
  (`$ARGUMENTS`, `${CLAUDE_PLUGIN_ROOT}`, shell placeholders through the runner, the shell policy of
  the settings), dispatches any hook event typed per event over every enabled plugin and the
  settings files (matchers, `if` through the rules module, `disableAllHooks`, `allowManagedHooksOnly`,
  the `hooks` lock, the HTTP allowlists), and resolves agents, MCP and LSP servers, monitors and
  output styles with the plugin variables and saved options. Enablement follows the host, then
  `enabledPlugins`, with managed settings that turn a plugin off winning.
- Testing: `@rsaryev/llx-plugin/testing` publishes the fakes of the ports (`memoryFiles`,
  `scriptedRunner`, `recordingHttp`, `fakeModel`, `fakeMcp`, `fixedClock`, `locations`,
  `fakeEnvironment`, `memoryScratch`); `tests/support/ports.ts` re-exports them, one copy.
- Official types re-exported from `@anthropic-ai/claude-agent-sdk`, with `HOOK_EVENTS` and
  `HOOK_HANDLER_TYPES` asserted equal to the SDK's unions.
- The ports a host implements (`PluginFiles`, `CommandRunner`, `HttpClient`, `ModelRunner`,
  `McpCaller`, `Locations`, `Environment`, `Clock`, `ScratchFiles`), type-only, and in-memory fakes
  of each for tests.
- `EFFORT_LEVELS`, asserted equal to the SDK's `EffortLevel`, and the official `EffortLevel`,
  `SlashCommand` and `ResolvedSettingSource` types re-exported.
- Permission rules (`rules`): `parseRule` and `formatRule` for `Tool` and `Tool(specifier)` (literal
  parentheses, `Bash(*)` as bare, `domain:` and `Tool(param:value)` specifiers, the malformed-rule
  message), `matchRule` for bare rules, tool-name globs (with the allow-glob anchoring rule) and
  input-parameter rules, `evaluateRules` in deny, ask, allow order, and `ruleIssues` for the
  matches-no-tool warning. `PERMISSION_MODES`, `PERMISSION_BEHAVIORS`, `normalizePermissionMode`
  (`manual` is `default`), `DOCUMENTED_TOOLS`, and the SDK's tool input and output types.
- Bash and PowerShell rules: the wildcard patterns of permissions.md (the `*` anywhere, the bare
  command before a trailing ` *`, the `:*` suffix), compound commands (every subcommand for an
  allow rule, any for deny and ask, including `$()`, backticks, subshells and loop bodies),
  the fixed wrapper list and safe environment assignments, exec wrappers and `find` actions that
  a prefix rule cannot approve, PowerShell aliases and case-insensitive matching, the
  wildcard-before-subcommand startup warning, and `evaluateIf` for the `if` field of hooks.
  `splitCommand`, `stripWrappers`, `matchBashPattern` and `requiresPromptDespitePrefixRule` are
  exported.
- Path rules (`rules/path`): `Read(...)` and `Edit(...)` patterns with the four anchors (`//`, `~/`,
  `/` per settings source, `path` and `./path`), gitignore matching through `ignore`, the allow versus
  deny/ask depth rule for a single directory segment, `!` negation within one source, Windows POSIX
  paths, routing (Edit covers Write and NotebookEdit, Read covers Grep and Glob, an Edit allow implies
  read, a Read deny covers Edit and Write, Write/Glob/Grep/NotebookEdit path rules never match), the
  symlink two-path rule through a new `PathResolver` port (`prepareCall`, `resolveRuleDirectories`,
  `PathContext.realDirectories`), `readsNetworkPath` and `matchCdRule`.
- Target rules (`rules/target`): `WebFetch(domain:...)` against the hostname of the call's `url`
  (case-insensitive, trailing dot stripped, `*.`, bare `*`, a `*` elsewhere limited to one label,
  bracketed IPv6), `matchDomainPattern`, and the sandbox domain list a `domain:` rule adds to as data
  (`sandboxDomainEntry`, `sandboxDomainLists`; a bare `WebFetch` adds nothing); `Agent(Name)`
  against `subagent_type`; `Skill(name)` and `Skill(name *)` with the namespace rule and the names a
  deny rule sees; MCP rule forms (`mcp__server`, `mcp__server__*`, `mcp__server__tool`) with the
  deny-or-ask versus allow difference for a server whose name holds `__`, `normalizeMcpServerName`,
  `pluginMcpServerName`, `mcpToolName`, `mcpToolRuleMatches`, and the Cowork tools a bare `Bash` or
  `WebFetch` deny rule also blocks.

#### cli

- Plugin release-tag planning and completion reporting, including validation, version agreement,
  force, dry-run, annotated messages, remote selection and local-tag preservation after a failed push.
- CLI lifecycle commands: `claude plugin install`, `update`, `enable`, `disable`, `prune`,
  `uninstall` and `configure` as plans over ports. `startInstall`/`planInstall` run the install
  ladder (already installed at that scope exits 0 with the exact line, a command-source or
  `headersHelper` entry prints its command and needs `-y` or the `--accept-command` sha256, `Aborted.`
  and `Aborted — the command was not run.`, `-y` ignored inside a session, the `shownCommand` of a
  refused `--json` run, `--config` and `<server>.<key>` validated against `userConfig`, the
  `--marketplace` source added first, the refresh before the install and the dependency closure);
  `decideAcceptance` counts a sha256 only for the exact command, plugin and the catalog the run read
  after its own refresh. `planPluginUpdate` detects the scope (local, project, user, managed), matches
  a bare name and refuses an ambiguous one, reports `already at the latest version` and retries an
  unfinished dependency install in the cached copy. `planEnable`/`planDisable` write the scope the
  first mention or an override names, cascade to dependencies and refuse for dependents, a blocked or
  higher-scope-false dependency or a required synced plugin. `planPruneCommand` covers `--dry-run`,
  the terminal and `-y` matrix. `startUninstall`/`concludeUninstall` add G8: from the last scope the
  plugin's options, secrets and data directory go, except with `--keep-data`, for another plugin on the
  same folder, or when the install records cannot be read back (`savedKept`), with `keptData`,
  `settings_still_on` and `--prune`. `planConfigure` lists options without saved values, saves
  `--values-stdin` whole or not at all, and never prints a sensitive value. 27 requirements are proven
  and the choices the docs leave open are in `spec/judgments.md`.
- CLI: a new `cli` module (layer 5) that models the plugin and marketplace commands as plans over
  ports. `renderCommand` gives the human line, the exit code and the last-line JSON object of a
  command (`command`, `outcome`, `message`, `failureCode`, a usage error that prints no result line);
  `chooseScope` and `writeScope` the scope grammar; `resolveCommand` the command table with its
  aliases; `startMarketplaceAdd`/`concludeMarketplaceAdd`, `planMarketplaceList`,
  `planMarketplaceRemove` and `planMarketplaceUpdate` the four marketplace commands; and
  `planSessionFlags` the 20 session flags of `claude` (`--plugin-dir`, `--plugin-url`, `--bare`,
  `--safe-mode`, `--restricted`, `--setting-sources`, `--settings`, `--disable-slash-commands`,
  `--add-dir`, `--agent`, `--agents`, the subagent-prompt flags, `--channels`, the development
  channels, `--mcp-config`, `--strict-mcp-config`, `--permission-mode`, `--tools`) with the refusals
  that exit `1` without starting. `scripts/check-layers.ts` gives the module its layer.

#### repository

- The package declares Node.js 22 or later (`engines`): the built `dist` calls
  `Promise.withResolvers`. Getting started says how long `--omit=optional` keeps the Agent SDK's
  binary out, that the SDK peers missing under `skipLibCheck` read as `any`, and that a registry
  install reads the declarations rather than the source condition.
- The declarations check covers every declared call of `$` (88): its arguments against the declared
  parameters, the op event it fires against the declared input, and its result against the declared
  result (docs/API.md, "Mods declarations").
- The mods declarations as evidence (AGENTS.md, E2a): `bun run types:pull` gets the
  `claude-code` declarations of the pinned release in a private `HOME`, `bun run types:extract`
  reads them with the TypeScript checker into `spec/mods-declarations.json`, `check:spec` (SP8)
  holds the snapshot to the release, and `tests/mods/declarations/surface.test.ts` fails on any
  difference between the kit and the declarations not judged in `spec/judgments.md` (D1 to D5).
- Reach 100% of the in-scope requirements (2713 of 2713): host switches (`CLAUDE_CODE_*` variables,
  telemetry opt-out), channel contract and permission relay, shell redirection checks, marketplace
  add failures, name conflicts, relevance hints and telemetry names, `plugin list`/`details`/`validate`
  builders, mods keyboard and VS Code rules, managed-settings limits, seed registry and the managed
  approval-dialog list. Judgments are recorded in `spec/judgments.md`.
- Audit the owner-approved plugin-host scope separately from native Claude Code UI, services,
  scheduling/model runtime and SDK-client behavior; publish every filtered table row in the
  generated exclusion log and regression-test that new plugin sections stay in scope.
- `bun run oracle:runtime`: what a Claude Code session registers from a plugin (`init` event of
  `claude -p --plugin-dir`, no model call) against the kit's session, for 32 fixtures
  (`tests/fixtures/runtime`); each fixture's `expected.json` is committed, so `bun test` checks it
  without `claude`.
- `bun run corpus:load`: the kit's loading compared with Claude Code's own (`claude plugin
  details` over `--plugin-dir`) on every corpus plugin, per component.
- `bun run mutation <module>`: StrykerJS mutation testing of one module against its own tests,
  with a JSON report in `.cache/mutation/`.
- `bun run bench`: times `loadPlugin` (from disk and from memory), host assembly, the skill
  listing and `PreToolUse` dispatch over the real plugins of the corpus.
- Spec: the same-name table of skills.md names its rows by phrase (`PageScope.phrases`), which adds six
  requirements (bundled skill, built-in command, added directory, two added directories, plugin skill,
  synced short name).
- Spec: every page of the docs is classified (SP7). The 24 pages that document hooks, memory,
  worktrees, status lines, headless runs, model settings, server-managed settings, agent teams,
  goals, scheduling, auto mode, tools, the error catalogue and the Agent SDK's plugin, hook, skill,
  subagent, permission and MCP behaviour are audited section by section, and the other 156 are
  listed in `spec/out-of-scope-pages.json` with a reason docs/SPEC.md explains. A page that
  appears in a new release fails `check:spec` until it is classified.
- Spec: the requirement set now counts the docs' prose, not only their tables. Every heading of
  the plugin, mods, skills, subagents, hooks, MCP, managed MCP, settings, managed settings,
  permissions, environment, CLI, workflows, themes, output styles and channels pages is either
  read as requirements (one per section, one per listed rule) or listed in
  `spec/out-of-scope.json` with a reason (docs/SPEC.md, "Sections and scope"). New categories:
  `install`, `updates`, `trust`, `policy`, `settings-merge`, `mcp-settings`, `themes`,
  `workflows`, `cli`. The compatibility percentage drops accordingly: the new requirements are
  unproven until a test names them.
- Evidence: the oracle (the official CLI of the same release, run as a black box) is a recognised
  source in docs/SPEC.md and AGENTS.md (E5a) for message wording and validator-only checks; every
  behaviour taken from it is a row `oracle 2.1.319` in spec/judgments.md with an input of its own.
- Corpus: `bun run corpus` compares the oracle with `validatePlugin` (verdict agreement, findings
  with the same severity and message, findings at the same file and path, what the kit misses or
  adds) and prints `loadPlugin`'s verdict on a separate line.
- The corpus: `corpus:fetch` fetches every plugin of the official and community marketplaces
  through the kit's own marketplace reader and fetch plans; `corpus` compares the kit with
  `claude plugin validate --json` plugin by plugin.
- The evidence pipeline: `docs:pull` mirrors the official Claude Code docs, `spec:extract` turns
  them into `spec/requirements.json`, and `compat` reports the share each test run proves.
- `docs/api/`: one table per public entry (`docs/api/root.md`, `docs/api/loading.md`, ...) with every export, its kind and one line, linked from docs/API.md. The docs gate's DOC3 (`scripts/docs/export-tables.ts`, over `scripts/lib/public-exports.ts`, which resolves each entry through its barrels with `oxc-parser`) fails when an export has no row, a row names no export or the wrong kind, or a doc imports a name an entry does not export.

### Changed

#### format

- **BREAKING** `loadPlugin` and `collectMcpServers` `bundleSettings` → gone. Bundle settings are read when a server is resolved, not at load: `loadPlugin` and
  `collectMcpServers` take no `bundleSettings`; a bundled server's values come from the scope's
  `userConfig.values` under `<server>.<key>` (a session fills them from `pluginConfigs.<id>.mcpServers`
  and `userConfig`), and `Bundled MCP server "<name>" was not started: it needs configuration` is an
  issue of `resolveMcpServers` / `resolveChannel` / `session.mcpServers()`.
- **BREAKING** `McpBundleSetting` and `McpbOption` → gone. `McpBundle.userConfig` is the bundle's raw `user_config` block; `McpBundleSetting` and
  `McpbOption` are removed (`McpbManifest.options` is `Record<string, UserConfigOption>`).
- **BREAKING** `resolveChannel` over a servers map → over a `Plugin` (`{ mcpServers, mcpBundles }`). `resolveChannel(channel, plugin, scope)` takes `{ mcpServers, mcpBundles }` (a `Plugin`) in place
  of the servers map.
- **BREAKING** `fillBundleSettings` → gone. `bundleServerOf` leaves a bundle's `${user_config.<key>}` as written (no `<server>.<key>` rewrite);
  `fillBundleSettings` is removed: the kit answers the references when it resolves the server.
- **BREAKING** `headersHelperEnvironment` → `planHeadersHelper(resolved.headersHelper, origin, trust, context)`. An MCP server's `headersHelper` resolves to a `HelperServer`; plan its run with
  `planHeadersHelper(resolved.headersHelper, origin, trust, context)` instead of reading
  `headersHelperEnvironment`.
- The `headersHelper` refusal line names `$CLAUDE_CONFIG_DIR/.claude.json` when the variable is set.
- `requiredBundleSettings` takes `{ name, options }` (an `McpbManifest` still does).
- `Plugin.mcpBundles` (new, required): each bundled server's own settings (`McpBundleConfig`, `{ userConfig }`). `resolveMcpServers` and `resolveProcesses` read it.
- `resolveProcesses(plugin, scope)` needs the plugin's `manifest`; a server bound by a channel takes
  that channel's `userConfig`. Issue paths are indexed (`lspServers.go.args[0]`).
- `exportedEnvironment(component, scope, substitution?)` takes an optional
  `Pick<Substituter, 'variable'>` to answer the variables.
- A host release written `v2.1.319`, `2.1.320-beta` or with trailing text satisfies the v2.1.310
  flag-free monitor minimum.

#### settings

- **BREAKING** `SCOPE_PRECEDENCE` → `SCOPES_BY_PRECEDENCE`. `SCOPE_PRECEDENCE` is renamed `SCOPES_BY_PRECEDENCE` (`['managed', 'local', 'project', 'user']`).
- **BREAKING** `createHookPolicy(view, locks, context)` → `createHookPolicy(view, context)`. `createHookPolicy(view, context)` (`./settings`) takes no `locks`: the `hooks` surface of
  `strictPluginOnlyCustomization` is read from the view.
- **BREAKING** `NotAppliedVariable.reason` → `.why`; `envIgnored` → `ignoredBecause(...) !== undefined`. `resolveSettingsEnv(...).ignored` entries are `NotAppliedVariable` `{ name, scope, why }`, `why` a
  `NotApplied` (an `IgnoreReason` such as `storage`, `identity` or `launch-only`, or
  `launch-environment`, `shell-keeps-it`, `awaiting-trust`). Read `.why` instead of
  `.reason`; `ignoredBecause(scope, name, value) !== undefined` replaces `envIgnored`.
- **BREAKING** `resolveSettingsEnv(...).issues` → gone. `resolveSettingsEnv` no longer returns `issues`; an `env` value that is not a string reaches the
  environment as its text (`String(value)`, as Claude Code sets it) instead of being left out.
- `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` with surrounding blanks turns the scrub on.
- Settings (changed): `unionArrays` drops duplicate entries, as managed-settings.md says of combined
  lists; a user, project, local or `--settings` source that is not a JSON object is an error issue
  ("Settings Error: ...") rather than a warning, and still skipped.

#### hooks

- **BREAKING** `SkipKind` → also `'linger'`. `SkipKind` gains `'linger'`: a hook still running `HookBudget.lingerMs` (5000 ms,
  claude-code/index.d.ts:5435) after its `next.signal` aborted is reported once, `<mod>: <event> hook
  lingering: still running 5000 ms after next.signal aborted`. `MOD_LIMITS.lingerMs` is new.
- **BREAKING** `<mod>: <event> hook threw <error>` → `<mod>: <event> hook skipped: next(e) rejected and the hook did not catch it: <error>`. A hook that does not catch a rejected `next(e)` is reported `<mod>: <event> hook
  skipped: next(e) rejected and the hook did not catch it: <error>` instead of `threw <error>`, which
  read as the hook's own fault (a refusal by Claude Code's gate, for one). It is still a `throw`
  report and a `.catch` handler still answers.
- **BREAKING** `HookEngineOptions.shellPaths`, `DispatchConfig.shellPaths` and `RunContext.shellPaths` → gone. A bash shell-form hook always keeps `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`
  and `${CLAUDE_PROJECT_DIR}` as braced references with the paths in its environment, as Claude Code
  2.1.322 does; `shellPaths: 'pasted'` pastes only where Claude Code pastes (a monitor `command`, an
  MCP `headersHelper`, a skill's `!` command). `HookEngineOptions.shellPaths`,
  `DispatchConfig.shellPaths` and `RunContext.shellPaths` are removed, and the `hook-shell` surface
  is no longer one `shellPaths` sets.
- A PowerShell hook reports every bare `$CLAUDE_*` path variable once, not only the first.

#### skills

- **BREAKING** `SkillOrigin` → also `{ kind: 'bundled' }`. `SkillOrigin` gains `{ kind: 'bundled' }`, so a registry over `SkillOriginKind` needs the
  key. `SessionOptions.takenCommands` no longer needs the host's bundled skills when they are given
  as `hostSkills`.
- **BREAKING** `stackSkills` over rows → over a `SkillLookup`, returning `{ skills, arguments, mentions }`. `stackSkills(message, lookup, options?)` takes a `SkillLookup` (`skillLookup(rows)`) and returns
  `{ skills, arguments, mentions }`; `StackOptions.takesCommandArguments` names the host commands
  (`/loop`) that end a stack.
- **BREAKING** `Invocable` with its body → `InvocableHead` and a `BodyReader`. The folder scan is metadata-first: `ScannedEntry` and `ResolvedFolderSkill` hold the skill or command
  without its body (`SkillHead`, `CommandHead`, `InvocableHead`) and a `BodyReader` (`readBody(signal?)`)
  that reads the body through the host's `FolderScan` port when the skill runs, fresh each time. A port
  that refuses a file now skips that file with a warning instead of failing the scan, and a session
  expands an edited folder skill without a reload. `Invocable` is `InvocableHead`, and `stackSkills` keeps
  the caller's skill type.
- `${CLAUDE_SKILL_DIR}` keeps a skill directory that is already absolute: a session expands a skill
  with the row's `directory`, so the plugin root is asked once per host generation instead of at
  each expansion.
- A skill's `!` command is decided by the session's permission rules plus the skill's
  `allowed-tools` (`SessionOptions.permissionContext`) instead of always asking, and runs with the
  session's Bash or PowerShell subprocess environment.
- `session.expandMessage(message, { signal, invoker?, takesCommandArguments? })` finds skills by
  aliases and declared names, as `expandSkill` does; `permitted` holds the listed commands.
- `paths` globs of a skill are compiled once per skill.

#### agents

- **BREAKING** `session.selectAgent` also took the `agent` setting → `{ flag }` only; `selectSessionAgent` `setting` text → `AgentSetting`. `session.selectAgent` takes `{ flag }` only; the `agent` setting comes from the
  session's settings and the plugin defaults. `selectSessionAgent`'s `setting` is an
  `AgentSetting` (`{ name; plugin? }`), not a string. `valueWithPluginDefaults` returns
  `{ value, plugin? }` (or `undefined`), and `pluginDefaultsOf` gives `owners` by key.
- **BREAKING** `CatalogAgent.source` tier string → `CatalogSource` object. `CatalogAgent.source` (`CatalogSource`) is an object, `{ kind: 'plugin', pluginId }`,
  `{ kind: 'folder', scope }`, `{ kind: 'flag' }` or `{ kind: 'builtin' }`, not the tier string;
  `catalogTier(source)` gives the old value. `SessionAgent.source` follows.
- **BREAKING** `ScopeRule.bases` and `AgentFolder.bases` → `places`, `SCOPE_BASES.home` → `SCOPE_PLACES.user`. The skills scan's `ScopeRule.bases` and the agents scan's `AgentFolder.bases` are
  `places` (`ScopePlaces`: each base with its folder), and `SCOPE_BASES.home` is gone: the user
  scope is `SCOPE_PLACES.user`. `SavedScanRequest.configDir` is the inherited
  `ScopeRequest.configDir`.
- `session.preloadSkills(definition, { signal, source })`: with the agent's `CatalogAgent.source`, a
  bare name in a plugin agent's `skills` finds its own plugin's `<plugin>:<name>` first, else the
  first plugin's in load order (oracle 2.1.322). Without `source`, the agent is read as one of no plugin.
- `AgentToolFields` reads `tools` and `disallowedTools` as readonly lists, so a host's readonly agent record is accepted as it is.
- `readFlagAgents` loads a `--agents` name with `:` and one over 256 characters, as Claude Code
  2.1.322 does; its bare name is the part after the last `:` (`--agent name` finds `ns:name`). Only
  an empty name is refused beside the documented `-`.

#### marketplace

- **BREAKING** a plugin with unmet `dependencies` ran → it is off (`enabled: false`). A plugin whose `dependencies` are not met no longer runs: `enabled: false`
  with `Dependency "<dep>" is not installed`, `... is disabled — enable it or remove the dependency`
  or `Requires "<dep>" <range>, installed <version>` under its id, and what needs it stops too
  (plugins/troubleshooting.md, "Dependency errors"; oracle 2.1.322). Give every installed plugin,
  the disabled ones with `enabled: false`.
- **BREAKING** `UninstallStart.remove` → also `requiredBy`, and the success line ends `— warning: required by …`. `UninstallStart` `remove` gains `requiredBy` (the names of the enabled
  plugins that depend on it), and the success line ends `— warning: required by a, c` (oracle
  2.1.322; the uninstall is not refused).
- **BREAKING** `InstallRun` → also `{ before, needs }`. `InstallRun` (`planInstall`) gains `{ before, needs }`, returned when a
  dependency's `plugin.json` must be fetched before the plan is final.
- **BREAKING** `checkForUpdate` returned the outcome string → async, returns `UpdateVerdict` `{ check, version }`. `checkForUpdate(subject, installed, sha256)` (`./marketplace`) is async and returns an
  `UpdateVerdict` `{ check, version }` (`check` is `new copy`, `unchanged` or `loaded in place`); it
  computes the version itself through `resolvePluginVersion`. Pass the `Sha256` port and read
  `.check` where the old call returned the outcome string.

#### mods

- **BREAKING** `HookFailure` loses `cause` and gains `budget`; `REENTRY_CAUSES`, `ReentryCause` and the `'re-entry'` skip kind → gone. A mod's `.catch` handler sees only the failures the declarations
  give it (claude-code/index.d.ts 2.1.321; oracle 2.1.322 agrees). `HookFailure` is
  `{ kind: 'throw' | 'timeout'; message?: string; budget: number }`: `cause` is removed, `message`
  is absent on a timeout unless a `next()` rejected first, and `budget` (the handler's 1000 ms) is
  new. `HOOK_FAILURE_KINDS` is `['throw', 'timeout']`; `REENTRY_CAUSES` and `ReentryCause` are
  removed; `ReentryInfo` loses `rewritten` and `lent`; `SkipKind` loses `'re-entry'`. A hook skipped
  on re-entry runs no `.catch` handler and is not reported: Claude Code's behaviour runs in its place.
- **BREAKING** `ModRegistries.commandRuns` optional → required. `ModRegistries.commandRuns` is required (the `CommandRunDepth` of `runCommand`): a
  `core` or `ModCommands.run` that calls `runCommand` for the same command again runs its core with
  no second `command.run` (claude-code/index.d.ts:1834, "one slash command about to run"); a third
  nesting rejects `/<name>: its body ran runCommand for itself again; refused`. Needs
  `ModsHostOptions.asyncContext`.
- **BREAKING** `RenderEvent.requestId` optional → required. A `ui.render` event always has a `requestId` (`RenderEvent.requestId` optional →
  required): a site of one instance gets the host's or the site's name.
- **BREAKING** a `command.run` hook's rewritten `e.command` was looked up → refused. A `command.run` hook that rewrites `e.command` or changes `e.presentation` is refused,
  and the host's core gets the event's `origin` and `presentation`; the lookup of a rewritten command
  is gone (claude-code/index.d.ts:1836: "A rewrite is refused").
- **BREAKING** an aborted dispatch ran the core → rejects with the abort's reason. A dispatch whose signal aborted rejects with the abort's reason instead of running the
  core (`abortedCore`).
- **BREAKING** `$.ui.panes()` listed every mod's panes → only the calling mod's. `$.ui.panes()` lists only the calling mod's panes, and `title` is the id when the pane
  was opened without one.
- **BREAKING** the scan accepted `export let register`, re-exports and `export *` → refuses them. The scan refuses `export let register`, `export var register`, a class or variable
  exported as `register`, a re-export and `export *`, each with its own line, and an
  `h(Client, ...)` whose props are no object literal or name no `module`: Claude Code 2.1.321
  refuses them (oracle, `registerExport`, `clientProps`). The line of a file with no `register`
  reads `no export named register (export function register(on, options) {...})`.
- **BREAKING** op events without the declared facts → with `origin`, `wait`, `door`, `trigger`, `previous` and `provider`. Op events carry the declared facts the kit has (spec/judgments.md D9): `origin`
  (`{ kind: 'plugin', name }`) on `prompt.submit`, `prompt.fill`, `prompt.suggest`, `session.send`,
  `session.append`, `command.run`, `config.set`, `ui.focus` and `ui.scroll`; `wait: false` on
  `prompt.submit`; `door: 'note'` on `session.append`; `trigger: 'plugin'` on `session.compact`;
  `previous` and `provider` on `config.set`, which now reads `config.list()` first (a host's
  `config` port must answer `list` for `$.config.set`). Each is removed before the port is called.
- **BREAKING** `ModHostPorts` `account`, `promptBox`, `notifications` optional → required. `ModHostPorts` (the filled type) requires `account`, `promptBox` and `notifications`; a
  host that builds it directly adds them or uses `withDefaultPorts` (`ModHostPortsInput` leaves
  them optional). `MODS_API` lists the declared members after the reference page's
  (`MODS_API_REFERENCE` is the page alone); `ModRegistries` has `onChange`, and
  `createRegistries()` builds listeners for it.
- **BREAKING** the calls of `$` in the kit's own forms → the declared forms. The calls of `$` take and answer what the declarations (2.1.321) give, found by the
  declarations check of every call's parameters, op event and result:
  - `$.mcp.call(server, tool, args?)` positional (was `{ server, tool, input }`); event
    `{ server, tool, args }`; it answers `{ content, isError, structuredContent? }`.
    `$.mcp.connect` resolves `{ isConnected: false, reason: 'unlisted' | 'failed', message }` (was a
    throw for an unlisted server) and `{ isConnected: true, server }`.
  - `$.model.classify(text, labels, options?)` positional (was one object); at least 2 labels.
  - `$.audio.play(clip, options?)`: `clip` is `{ asset } | { url } | { base64, mime }`, options
    `{ shouldLoop?, gain? (0 to 4), signal? }` (a loop needs the signal); event `{ clip,
    shouldLoop, gain? }`; port `ModAudio.play(request, signal)`.
  - `$.http.fetch(url, init?)`: event `{ url, init: { method, headers, body? } }` (was flat).
  - `$.process.run(argv, init?)` takes `env` and `stdin`; `$.process.spawn({ argv, cwd?, env?,
    input? })` (was `(argv, init)`), whose end is `{ code, signal }`; a child ended by a signal
    reads `exitCode: 1` (was a throw). Port: `ModSpawner.spawn` takes `input` and may answer
    `signal`.
  - `$.fs.read(path, { as? })`: `as: 'bytes'` answers `{ base64 }` (port `read(path, signal,
    as?)`, `base64` on its answer); `$.fs.stat(path, { resolve? })` gives `mtimeMs` and, with
    `resolve`, `realPath`; `$.fs.list` entries give `mtimeMs`; `$.fs.ancestors` answers the
    instruction files (`FsAncestor`) from the optional port `ModFs.instructions` or a walk.
  - `$.env.set(name, value?)`: `undefined` unsets; it answers `{}`. Port `env.set(name, value:
    string | undefined)`.
  - `$.turn.abort({ turnId })`; port `turns.abort(turnId?)`.
  - `$.telemetry.log(entry)` takes `{ event, props?, to? }` (`to` `anthropic` when left out);
    `$.telemetry.mark({ feature, kind, reason?, props? })` (was a string); port
    `telemetry.mark(feature, mark?)` (`TelemetryMark`).
  - `$.session.version()` answers `{ version, base? }`; `$.session.authorize()` takes nothing;
    `$.session.append({ message, agentId? })`; `$.session.compact()`, `session.append` and
    `config.set` ports may answer an object, which is the call's result.
  - `$.prompt.submit` takes `context` and answers `{ ..., text, context? }`; `$.prompt.fill(text
    | { text, mode?, decorations?, cursor? })`, port `prompts.fill(text, fill?)` answering
    `{ isFilled, refusal?, text?, cursor? }`.
  - `$.ui.log(text, { to? })` (`debug` goes to the debug log); `$.ui.copy({ text, surface? })`
    answers `{ isCopied, reason? }` (`no-clipboard` when the host gives none); `$.ui.selection()`
    answers `{ text, requestId? }` (port may answer `UiSelection`); `$.ui.notice(tool_use_id,
    text?)`; `$.ui.blit`, `$.ui.focus`, `$.ui.scroll` answer `{}` when the host gives nothing;
    `$.ui.invalidate` also takes `prompt.context`, `prompt.attachment`, `command.describe` and
    `config.describe` (`ModInterface.rerun(event: RerunEvent)`).
  - `$.agent.register`, `$.command.register` and `$.tool.register` answer `{ agent }`, `{ command }`
    and `{ tool }`; `$.tool.register`'s `inputSchema` defaults to `{ type: 'object' }`;
    `$.theme.set` answers `requestId` when drawn; `$.config.set`'s value is a string, number,
    boolean or string array; a hook's `{ deny }` resolves `session.append`, `config.set` and
    `session.identity`.
  - `McpToolResult` takes `content` (`McpContentBlock`) and `structuredContent`.
- **BREAKING** `$.ui.notice`, `invalidate`, `log`, `toast` and `status` returned a promise → `undefined` at once. `$.ui.notice`, `$.ui.invalidate`, `$.ui.log`, `$.ui.toast` and `$.ui.status` return
  `undefined` at once, as declared (`=> void`, claude-code/index.d.ts:2400, :2416, :2470, :2503,
  :2550; was D3). A misused argument throws where the call is made; a `{ deny }` or a failure of the
  event goes to the debug log (`<mod>: $.ui.log failed: ...`). New: `FIRED_CALLS`, `AT_ONCE_CALLS`,
  `ModsFiredMember`, `FiredEventName`; `describeApi` gives them `kind: 'sync'`; a nesting problem in
  the argument of any call that answers at once (`ui.resolve` and the timers too) now throws instead
  of returning a rejected promise. In the test kit an unstubbed `$.ui.toast`, `log` or `status` no
  longer rejects with `no implementation for <name>`; the line goes to the debug log.
- **BREAKING** a hook that returned `undefined` passed → fails as `wrong-shape`, and `next()` with no argument rejects. What a hook returns follows the declarations (`Next`, claude-code/index.d.ts:6963;
  `StreamHookBody`, :13444). A function hook that returns `undefined` now fails as `wrong-shape`
  (`it returned nothing: return next(e) or a result`): its `.catch` handler answers, else its latest
  `next`'s result stands, else it is skipped. `next()` with no argument rejects, naming the hook and
  the mod; `next(undefined)` passes `undefined` on. On a streaming event `next(e)` is a
  `ModHookStream` (`NextOutput` changed): an async generator with a `result` promise that settles at
  the stream's end and rejects when it is closed early. Proven in
  tests/mods/chain/declared-next.test.ts.
- **BREAKING** a mod's call skipped the whole mod → only the calling hook. Who a mod's call reaches. Only the calling hook is skipped as `re-entry`; the mod's other
  hooks see the call, and a call from the mod's code outside its hooks skips every hook of the mod
  (before, the whole mod was skipped). One of the engine's own events (`EventCalls`, :5011) now
  reaches every mod's hooks, not only those at or above the caller; a call the host serves
  (`OpEventOf`, :7292) still reaches only those. New export `isEngineOwnEvent(name)`. Proven in
  tests/mods/chain/caller-reach.test.ts.
- **BREAKING** `ModNext.event`, `is`, `trace`, `HookCall.name`, `trace` and `TestKit.describe` optional → required. `ModNext` requires `event`, `is` and `trace`, `HookCall` requires `name` and `trace`,
  and `TestKit` requires `describe`; `SkipTier` takes `user`, so `next.to('user')` runs from a
  `prepend` hook (declarations 2.1.321).
- **BREAKING** the results of `prompt.fill`, `prompt.suggest` and `prompt.mention` → the declared shapes. The results of `prompt.fill` (`{ isFilled?, refusal? }`), `prompt.suggest`
  (`{ isShown? }`) and `prompt.mention` (`{ deny?, type?, context? }`) are the declared ones.
- **BREAKING** `Box` `flexBasis` accepted → refused. `Box` refuses `flexBasis`, which is not declared.
- **BREAKING** `$.state.get` answered the value → `{ value, version }`, and `atom(...)` → `{ ref, initial, shape? }`. `$.state` values are versioned, as Claude Code 2.1.322 answers them: `$.state.get`
  answers `{ value, version }` (`{ version: 0 }` while unwritten), `$.state.set(ref, value, {
  ifVersion })` answers `{ isSet, version }` and writes nothing on a stale version, and a reference
  may carry `id` for a family's member. `StateStore.get(ref)` and `set(ref, value, ifVersion?)` take
  a `StateRef`; `atom(...)` is now `{ ref, initial, shape? }`. The state helpers gain `derive` and
  `memberOf` and the `shape` option, in both the kit and `STATE_LIBRARY_SOURCE`; `update` answers
  the new value.
- **BREAKING** `createEventRules()`, `withApiRules`, `withUiRules`, `withRegisterRules` → `EVENT_RULES`, `API_RULES`, `uiRules()`, `REGISTER_RULES`. Mods rules are books: `createModChain({ clock, rules: [EVENT_RULES, API_RULES, uiRules()] })`.
  `EVENT_RULES`, `API_RULES`, `uiRules()` and `REGISTER_RULES` replace `createEventRules()`,
  `withApiRules(rules)`, `withUiRules(rules)` and `withRegisterRules(rules)`; an event named in two
  books throws. The rule type is `EventRule` (one per event) in an `EventRuleBook`.
- Deviation: `require()` in a hooks module stays refused at load although Claude Code 2.1.321
  validates and loads it (oracle: `claude plugin validate` and a `--plugin-dir` load agree). On Bun a
  written `require` reaches any file or package past the import rules. Recorded in docs/SECURITY.md
  ("`require()` in a hooks module"), spec/judgments.md (`requireCall`) and
  tests/mods/load/scan-require.test.ts; 0 mods of the corpus are affected; no option. A dynamic
  `import()` is refused by both. docs/SECURITY.md also says the scan is no sandbox (`Running a mod's
  code` under "Risks the host owns").
- `$.http.fetch` `auth` is https only, is dropped on a redirect to another origin, and counts as
  carrying the session's credentials under `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`.
- `ModsHostOptions.asyncContext` (new, optional; `() => new AsyncLocalStorage()` on Node or Bun):
  a mod's call skips only the calling hook (claude-code/index.d.ts:7298, "The calling hook alone is
  skipped"). Without it every running hook of the mod is skipped, as before.
- `ModsHost.dispose()` also forgets the plugins it was given: a disposed host still referenced held
  every plugin's files. Run one mods host per session (claude-code/index.d.ts:4606, :10174).
- `ModsHostOptions` moved to `src/mods/load/host-options.ts`; it is exported where it was.
- `fakePorts().appended` rows leave out `door` and `origin`, as the port receives them.
- `on` takes every pattern the declarations do (`Glob`, claude-code/index.d.ts:5346; `Namespace`,
  :6893; `Negation`, :6955): `*`, `ns.*` over any namespace of the events (`ui.*`, `tool.*`,
  `telemetry.*`, not only `classic.*`), and `!` before a name or a glob (`!*` is refused). `*` and a
  negation select no telemetry event, and a hook on `telemetry.*` needs the telemetry filter as one on
  a telemetry event does. `next.is` uses the same rule. Proven in
  tests/mods/chain/patterns.test.ts.
- An element's `children` are flattened at any depth; `false`, `null`, `undefined` and `true` are
  dropped, and a number becomes its string (`RenderChildren`, :10224).
- `update` writes through `$.state.set(ref, value, { ifVersion })` and applies its change again when
  another write beat it; an atom keeps a reference's `id`.
- `MOD_TIERS` lives in `src/protocol/mods-tiers.ts` (still exported from `mods-events`).
- `./mods` re-exports only `createBudget`, `deepFreeze`, `plainDataProblem`, `jsonChars`, `jsonBytes`
  and their types from the foundation.
- `resolveTypesPath` returns `undefined` when there is no types path.

#### host

- **BREAKING** `SubstitutionScope.monitorPaths` → `shellPaths`, `MonitorPaths` → `ShellPaths`, `PluginHostOptions.hookExecution.shellPaths` and `HookCommandOptions.shellPaths` → `PluginHostOptions.shellPaths`. One option, `PluginHostOptions.shellPaths?: 'environment-reference' | 'pasted'`
  (default `'environment-reference'`), sets the path form of every shell-parsed string a session
  resolves. `SubstitutionScope.monitorPaths` is now `SubstitutionScope.shellPaths` and covers bash
  hooks, monitors and `headersHelper`. `PluginHostOptions.hookExecution.shellPaths` and
  `HookCommandOptions.shellPaths` are removed (see the bash hook entry). A host that needs the docs' literal text passes `shellPaths: 'pasted'`. Type
  `MonitorPaths` is now `ShellPaths`.
- **BREAKING** `monitorsToStop` over `MonitorStart` → generic over what the host keeps. `monitorsToStop(started, event)` is generic over what the host keeps
  (`<T>(started: Iterable<T>, event: MonitorStopEvent) => T[]`).
- **BREAKING** `SessionOptions.hookPorts` and `TurnOptions.hookPorts` → `ports`. `SessionOptions.hookPorts` and `TurnOptions.hookPorts` are renamed `ports` (same type,
  `Partial<Omit<HookPorts, 'locations'>>`): they now feed everything the session resolves, not only
  its hooks.
- **BREAKING** `EnvFileStore.path` and `clear` without the session → with the session id first; `createEnvFiles` requires `sessionId`. `EnvFileStore.path(sessionId, kind, signal)` and `clear(sessionId, kind, signal)` take the session
  id, and `createEnvFiles(store, { sessionId, launchScript? })` requires it: one store serves every
  session of a host, keyed by `SessionOptions.sessionId`. Key the files by the id (for example
  `<dir>/<sessionId>/<kind>-env.sh`).
- **BREAKING** `SessionOptions.permissions` and `TurnOptions.permissions` → `shellPermission`; `session.checkTool` `permissions` → `permissionContext`. Renamed: `SessionOptions.permissions` and `TurnOptions.permissions` are `shellPermission` (the
  answer for a skill's `!` command, a `ShellPermission`); the `permissions` option of
  `session.checkTool` is `permissionContext` (`startPermissions(...).context`).
- **BREAKING** `folderTrusted`, `parentTrusted`, `nonInteractive` → one `trust` (`TrustSituation`). Workspace trust is one `TrustSituation` (`trusted`, `parent-trusted`, `non-interactive`,
  `dialog`): `workspaceTrustState(trust, facts, { nonInteractive?, signal? })` returns it,
  `settingsHooksMayRun(situation)` takes it, and `decideRepositoryPlugin` and `LocalSettingsFacts`
  take `trust` instead of `folderTrusted`, `parentTrusted` and `nonInteractive`.
- **BREAKING** `session.dispatch` options → `SessionDispatchOptions`. `session.dispatch(event, facts, options)` takes `SessionDispatchOptions`: `{ signal, interrupt?,
  taskCompletedBy?, sourcesOnly? }`.
- **BREAKING** the output-style helpers in `./skills` → `./format`; elicitation names → `./elicitation` only; layout names → `./layout` only. The output-style helpers (`resolveOutputStyle`, `includeCodingInstructions`, `listOutputStyles`,
  `outputStyleSystem`, `BUILTIN_OUTPUT_STYLES`, `DEFAULT_OUTPUT_STYLE_ID` and their types) moved from
  `./skills` to `./format`. The elicitation names are exported by `./elicitation` only, the layout
  names (`STANDARD_LAYOUT`, `COMPONENT_KINDS`, `declaredKey`...) by `./layout` only, `MatcherValue`
  by `./hooks` only (`./mods` has `ModMatcherValue`), and `ModelCall` by `./mods` only (`./testing`
  has `RecordedModelCall`). `PreloadedSkills` is the root's session type.
- **BREAKING** `isRecord` from `format/validate/received.ts` and the marketplace schema → `protocol/is-record.ts`. `isRecord` has one home, `protocol/is-record.ts`; `format/validate/received.ts` and the
  marketplace schema no longer export it.
- **BREAKING** `@rsaryev/claude-plugin-kit` → `@rsaryev/llx-plugin`. The project is renamed `llx-plugin`: the package is `@rsaryev/llx-plugin` and the repository
  `github.com/rsaryev/llx-plugin`. Import from the new name; the subpaths are unchanged.
- **BREAKING** 1609 root values → 27; every domain at its subpath. The root exports what a host loop calls (27 values, down from 1609); every domain has its whole
  surface at a subpath: `./loading`, `./format`, `./skills`, `./hooks`, `./rules`, `./settings`,
  `./marketplace`, `./agents`, `./mods`, `./cli` (docs/API.md, "Entry points").
- **BREAKING** the four `SURFACES` → `POLICY_SURFACES`, `LAUNCH_SURFACES`, `SUBSTITUTION_SURFACES`, `UI_SURFACES`. Names that meant different things are named by meaning: `POLICY_SURFACES`, `LAUNCH_SURFACES`,
  `SUBSTITUTION_SURFACES` and `UI_SURFACES` for the four `SURFACES`; `readAgentSetting`,
  `readThemeSetting` and `readOutputStyleSetting` for the general setting readers;
  `PLUGIN_TELEMETRY_EVENTS` for the plugin telemetry names.
- **BREAKING** a cancellable function's `signal` anywhere → `{ signal }` as its last argument. Every kit function that can be cancelled takes `{ signal }` as its last argument
  (`loadSettingsLayers(sources, { signal, scopes })`, `fetchArchive(plan, ports, { signal })` and 20 more);
  port methods keep the signal as their last parameter.
- `SAFE_ENVIRONMENT_VARIABLES` is replaced by `src/rules/bash/safe-env.ts`
  (`isSafeAssignment`, `assignedVariable`), and `redirectFacts` and `fileTargetFacts` by
  `targetFacts(commandTargets(command), ctx, resolvedPaths)`; `Target.tee` is `Target.source`.
- An empty `CLAUDE_CONFIG_DIR` counts as unset everywhere (`settingsLocations`, saved workflows,
  agent memory), as it already did for the plugin store and `headersHelper`.
- `session.onBackground` listeners get a second argument, `BackgroundSource`
  `{ sessionId, handlerId, outcome, exitCode? }`, `outcome` being `completed`, `cancelled`,
  `timed-out` or `failed`.
- `withTurn(turn)`: a `TurnOptions` field given as `undefined` is ignored, as in `HostUpdate`.
- Two plugins given to the host under one id: the first is kept and the other is an error issue,
  `A plugin with this id was given before: this one is not loaded`.
- The root entry exports the types its functions name (`Expansion`, `FolderScan`, `ShellPermission`,
  `HookPorts`, `SessionLimits`, `BackgroundSource` and the rest listed in docs/API.md).
- The optional peers: `@anthropic-ai/claude-agent-sdk` and `@modelcontextprotocol/sdk` are marked
  optional (`peerDependenciesMeta`), so a host that uses neither need not install them.

#### cli

- **BREAKING** `planCli*` aliases → `planInstall`, `planEnable`, `planDisable`, `planMarketplaceUpdate` of `./cli`. `planInstall`, `planEnable`, `planDisable`, `planMarketplaceUpdate` and `MarketplaceUpdatePlan`
  are exported by `./cli` only; the `planCli*` aliases are gone, so import the plain names from
  `./cli`. `planMarketplaceUpdate` takes `UpdateArguments.surface: 'session'` for the
  `✔ Updated N marketplace(s)` line, and `planMarketplaceRemove` also returns `dropEnabledEntries`,
  the `enabledPlugins` entries of the removed marketplace (from `facts.enabledEntries`).
- **BREAKING** `pluginFoldersOf` over a listing (`pluginDirFolders`, `PluginDirListing`) → over what `readPluginDirectory` read. `pluginFoldersOf(request, reading, hostVersion?)` (`./cli`) takes what `readPluginDirectory` read
  instead of a listing; `pluginDirFolders` and `PluginDirListing` are gone, so one rule decides
  whether a folder is a plugin or holds plugins.
- `claude plugin validate` prints the `calls`, `env` and `state` lines as Claude Code 2.1.321 does:
  sorted, writes before reads, `nothing` on an unused side, `calls: nothing on $`; `derive` and
  `memberOf` count as the atoms they read (oracle 2.1.321).
- `planInstall` (`./cli`): `InstallEffects.enable` is false for a plugin already installed and
  follows `defaultEnabled` otherwise; the success line lists the dependencies it installed
  (` (+ N dependencies: a@m, b@m)`).

#### repository

- One definition per repeated text: the three settings file paths are `SETTINGS_FILE`
  (`src/format/settings-files.ts`), read by the install scopes, the enablement notes, the settings
  file locations, the session's settings locations and the wildcard warning; the two load failures
  of a marketplace source are `SOURCE_FAILURE` (`src/format/marketplace/source-failures.ts`), read by
  the load status, the policy-list notice and the fetch plan; a marketplace value of the wrong type
  is reported by one `mismatch`. The two glob engines are named for their dialect:
  `gitignoreMatches` (path rules, skill `paths`) and `relevanceGlobMatches` (plugin relevance).
  spec/judgments.md records that the launch-only variables are dropped from every settings file.

### Fixed

#### format

- MCP bundles: a bundled server's `${user_config.KEY}` is answered from that bundle's saved settings
  (`bundleSettings`), else the setting's default, in the one substitution pass, so a saved value
  holding `${HOME}` or `${user_config.other}` is never expanded again; one with neither stays as
  written with a warning, as a plugin option does. It no longer resolves against the plugin's own
  `userConfig`.
- MCP bundles: a required bundle setting saved as empty text keeps the server from starting, the
  same rule (`missingBundleSettings`) the host's dialog uses.
- MCP sources: a declared `./.mcp.json`, or a file listed twice, loads once.
- `readPluginDirectory` (now at the root) classifies a folder with the one folder-of-plugins rule.
- Reading frontmatter no longer writes YAML parser warnings to the host's process (a key that is a
  collection, as in `{ SKILL_NAME }: x`); the key is read as its text, as before.
- An abort stops: `loadPlugin` and `validatePlugin` reject with the signal's reason and call the port no
  more once it aborts (before, a port that ignored the signal was read to the end, and one that honoured
  it was still called by the other branches); a command hook whose signal is aborted is `cancelled`
  instead of a non-blocking error, and one aborted before the start spawns nothing.
- One containment check for every plugin path: `locate` moved to `format/locate.ts`, and the MCP
  sources (`.mcp.json`, a declared `.json` file, a bundle path) now go through it. An absolute or
  backslash `mcpServers` path, or one that is a symlink leading outside the plugin, is rejected as
  `path escapes plugin directory` instead of being read; `rootRelative` drops `.` and empty segments,
  so `.//x` is read as `x` and no port is handed an absolute path. `collectMcpServers` takes
  `platform` and `roots`, and `loadPlugin` passes them.
- Declare the MCP SDK as a peer: the public protocol declarations reference its official types,
  so consumer projects must not depend on this checkout's development dependencies to find them.
- A remote MCP server's `url` and `headers` read as empty the credential names Claude Code empties (61 names and 5 name families, without regard to case), not only the five the docs give as examples; `bun run oracle:remote-mcp-env` re-observes them.
- Loading, as Claude Code 2.1.319 does (`bun run corpus:load`, whole-inventory agreement from
  82.7% to 96%): a guard hook that cannot be read, or an unreadable inline `mcpServers` entry of
  the manifest, keeps the plugin from loading; a plugin's hooks do not load an unknown event; a
  skill folder reached twice loads once; a skill folder named by a manifest path or the plugin
  root takes its frontmatter `name`; a `SKILL.md` directly in `skills/` is no skill.
- MCP contracts review: `claude mcp add` and `add-json` refuse a name already stored at the scope
  (`McpAddOptions.existing`, `readMcpAdd`'s third argument, `mcpAddKey`) with `MCP server <name> already
  exists in <scope> config`; the session-token-rejected state of a connector is for a `401` only, a
  `403` flags it; the shapes of a tool, a prompt and the elicitation capability are the MCP SDK's
  (`Tool`, `Prompt`, `PromptArgument`, `ClientCapabilities`, re-exported by `protocol/official.ts`) and
  `prepareMcpTool` takes an input schema of any type (`McpListedTool`); result limits read the SDK's
  content parts directly; `as` casts are gone from the add readers and the tests. The tests assert what
  their titles claim: the elicitation form validation moved out of `spec(...)`, titles that claimed
  more than they checked were trimmed, the `/cd` and `https://` echoes were removed with judgments
  recording what is the host's, and the 11,001-character error boundary is covered.
- MCP `headersHelper` review: a project or local server with no helper in an untrusted folder no
  longer gets the `headersHelper not run` notice (an agent file's server stays unloaded);
  `CLAUDE_CODE_MCP_SERVER_URL` redacts only the removed variables the URL expanded
  (`HelperServer.expandedVariables`), so a short unrelated value such as `8` no longer corrupts it;
  `attemptWithHeadersHelper` takes the server name and reports errors.md's `Server rejected the
  Authorization header minted by the configured headersHelper (HTTP <status>)` when a connection is
  rejected after the helper supplied `Authorization`, and `produce` now gives the helper's headers
  alone (`send` merges the static ones); the origin rules carry `providesPluginRoot` instead of a
  comparison with `'plugin'`; the monitor opt-in tests moved out of `spec(...)`, the PowerShell path
  test asserts the native exported path, and the helper tests assert the per-cause messages, the
  re-plan on a re-run and that every settings scope is an origin; the `docs/API.md` snippet narrows
  its union.
- MCP allow and deny lists review: `PolicyEnv` is exported once and replaces the three hand-declared
  environment types; `createMcpServerPolicy` documents that it reads the lists at creation and a host
  rebuilds it when settings change before a reconnect. The tests no longer claim the reconnect line, the
  managed-set requirement is proven by its own denylist and `managed-mcp.json` tests, and the judgments
  on layered `env` filling, `headersHelper`, empty `serverUrl` entries, per-source `serverName` rules and
  an empty managed allowlist under the lock now have tests.
- MCP settings review: `managedServerEntries(layers, { desktopManaged })` reads no managed entry in the
  Claude Desktop Code tab on a third-party deployment or in Cowork sessions and warns that the key is
  not read there; the rank of a managed server is proven under "How provided servers load" with a
  negative case; the approval and rejection of parent and `--add-dir` settings, the `listed in`
  commands and the enterprise-blocked status are recorded as judgments; the tests of toggles, user
  scope and plugin or connector duplicates by command now assert what they claim.
- MCP: `displayHeaders(server, scope)` gives the header names `claude mcp get` shows for a server
  the organization provides (managed-mcp.md, "What users can see and change"), and the tests of
  `displayReference`, the credential debug line and the endpoint key now assert what they claim.
- Format: Claude Code's own leniency about frontmatter and hooks, found by running `claude plugin
  validate` on real plugins. A block plain YAML refuses is retried with the value of each top-level
  line quoted when it holds a character plain YAML cannot (`description: Does X: then Y`,
  `argument-hint: [a] [b]`, `tools: *`), a duplicate key loads with the later value, and plugin
  hooks drop an entry they cannot read with a warning (an error under `PreToolUse` and
  `PermissionRequest`, where a missing guard fails the file) instead of failing the whole file;
  `settings.json` hooks keep failing whole, as settings.md says.
- The entries are read and reported beside an unsound top level; the "no description"
  and "no plugins" warnings and the entry version cross-check are made only when the schema passes
  (a reserved name does not stop the cross-check); unknown-field hints skip the keys the validator
  only lets through and never suggest a key more than half the misspelling's length away.
- Validator wording: the messages of a reserved or non-kebab plugin name, a name Claude Desktop
  rejects, a missing required field and a version mismatch are the official CLI's, not shortened
  ones; the docs-quoted part of each is still asserted under `spec()`.
- `listOutputStyles` marks one row current: a custom style that reuses a built-in id or an earlier
  style's id is no longer listed, matching what `resolveOutputStyle` selects.
- LSP servers of a plugin: `readLspConfig` and `readLspServer` (the 14 fields of manifest-reference's
  `lspServers` table as a strict object; `command` without spaces unless it starts with `/`,
  `extensionToLanguage` with dot-prefixed keys, positive and zero-or-more integers; one invalid entry
  skips the whole map with `Invalid LSP server config for ".lsp.json"`), `mergeLspSources` (a later
  server replaces an earlier one), `resolveLspServer` (`command`, `args`, `env` and `workspaceFolder`
  substituted, the three path variables exported, defaults `requestTimeout` 60000, `restartOnCrash`
  and `diagnostics` true, `transport` always `stdio`), and the runtime decisions the host reads:
  `lspRestartDecision`, `languageIdFor`, `lspExtensionConflicts`, `initializeOptionsOf` and
  `didChangeConfigurationOf`.
- Monitors of a plugin: `readMonitors` (the four fields of manifest-reference's `monitors` table as a
  strict entry; unique names; `when` read as `always` or `on-skill-invoke:<skill>`, anything else an
  error), `resolveMonitor` (path variables and `${ENV_VAR}` in `command`, `${user_config.*}` refused
  with the errors.md message, nothing exported) and `monitorsToStart`, the pure engine that says which
  monitors an event starts: `always` on session start and plugin reload, a skill monitor the first
  time its skill runs, none in non-interactive mode.
- `loadPlugin`: a plugin folder through `PluginFiles` to a typed `Plugin`, with the optional
  manifest, every component found by the standard layout registry (`STANDARD_LAYOUT`), the
  `replace`, `add` and `merge` rule of each manifest key (`COMBINE`), the `Default <folder>/ folder
  is ignored` warning, containment and existence checks (`<component> path escapes plugin
  directory`, `<component> path not found`), `settings.json` over the manifest `settings`
  (`readPluginSettings`), the `bin/` decisions (`binPathEntries`, `pathWithPluginBins`,
  `distribution`), the `COMPONENT_READERS` seam, and `resolveProcesses` for MCP servers, language
  servers and monitors.
- Layout discovery: a `skills` entry that is a file and an `agents` entry that is a directory are
  now errors instead of being dropped or scanned silently (manifest-reference, "Path-only fields");
  a manifest `hooks` path that names `hooks/hooks.json` no longer loads the file twice, so its hooks
  run once; the symlinked-folder, duplicate-file and path-shape decisions are recorded in
  `spec/judgments.md`. New tests cover the `bin/` decisions, the depth cap with a really looping
  folder, single-file `workflows` and `experimental.themes`, the symlink escape of default
  `monitors/monitors.json`, `settings.json` and a root `SKILL.md`, and exact issues for invalid LSP,
  monitor and settings files.
- Skill, command and agent content: the `user_config` policy applied to a command body is now
  recorded as the kit's reading (the page words it for skill and agent content and lists commands
  only in the one table row) in `spec/judgments.md` and the `substituteContent` doc comment.
- Monitors: the duplicate-name error and the first-wins rule, the error for any other `when` string,
  and the host-owned `description` display and `command` process behaviour are recorded in
  `spec/judgments.md` (the docs say only "Identifier unique within the plugin"); the `description`
  test no longer claims the task panel, and the option-variable test now checks the
  `CLAUDE_PLUGIN_OPTION_` prefix against a scope with configured options.
- LSP: a refused `extensionToLanguage` now names the keys that lack a dot; `languageIdFor` and
  `lspExtensionConflicts` document a plugin-qualified key (`plugin:server`) so two plugins with the
  same server name stay apart; the integer-like-name ordering limit and the host-owned timeouts are
  recorded in `spec/judgments.md`.
- MCP servers: an entry with `type: "streamable-http"` now reads as `http` (mcp.md, "Option 2");
  an entry with a `url` and no `type` is dropped with the message mcp.md quotes instead of an
  unrelated stdio error (and no longer reads as stdio when it also has a `command`, so a stray `url`
  can no longer reach the resolver and throw); a `type: "sdk"` entry is skipped with the quoted
  message; `isRemoteMcpServer` follows the transport and not the presence of a `url`.
- `readFlag` no longer reads `constructor` or `__proto__` as a flag, and `readList` no longer splits
  a glob such as `src/**/*.{ts,tsx}` or a path with a space.
- Variable substitution: a remote MCP server now reads the documented credential variables
  (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `AWS_BEARER_TOKEN_BEDROCK`, `HTTPS_PROXY`,
  `NPM_TOKEN`) as empty in `url` and `headers`; `UserConfigValue` is derived from the SDK's
  `Settings`; `substituteDeep` returns `unknown` instead of an unchecked cast; the table "Where each
  variable resolves" is asserted row by row, and the path variables are checked against the port
  calls they make.
- Marketplace entries and the strict-mode merge (`marketplace`): `createEntryReader` and `readEntry`
  read each `plugins[i]` of `marketplace.json` alone (`name` as an install id with the documented
  messages, `source` handed to the plugin source parser, `description`, `version`, `category`,
  `tags`, `strict`, `dependencies`, `defaultEnabled`, `displayName`, `metadata`, every other
  `plugin.json` field, unknown keys, the archive-only `headers` and `headersHelper` reports, the
  version-versus-plugin.json warning, duplicate names, the quoted `relevance`, `metadata` and
  `experimental` warnings, and the typed `relevance` model with its limits and the `signals.hosts`
  rule); `mergeEntryWithManifest` combines an entry with the plugin's `plugin.json` as the strict-mode
  table says (the entry is the manifest without one; strict appends the component fields and the
  entry's hooks replace the manifest's per event; strict false with components is the
  `has conflicting manifests` error; the entry-only fields are ignored beside a `plugin.json`;
  `defaultEnabled` and the display fields come from the entry, `version` from the manifest, the
  entry name is the install id and the manifest name the namespace; a root-source entry that lists
  skills does not scan the default `skills/`; hooks as a path or an array are reported as not yet
  supported in a marketplace entry). `EntrySlot.mode`, `ReadMode` and duplicate-name detection join
  the marketplace assembly.

#### settings

- `resolveChannel` for a channel bound to a bundled server reads that bundle's settings.
- Security: a settings file could set `CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS`,
  `CLAUDE_CODE_WARN_DISK_FREE_GIB` and `CLAUDE_CODE_WARN_MEMORY_FREE_GIB` through
  `resolveSettingsEnv`, and so through the host. The exported resolver was a second one
  (`settings/env.ts`) with its own `HOST_OWNED` list, which lacked these three of the variables
  Claude Code reads from the launch environment only; the `launch-only` list of `settings/env`
  had them. There is now one resolver and one list: every launch-only name is dropped from every
  file, managed included, as `launch-only`.
- Managed approval and agent-key environment flags are read trimmed and in any casing
  (`isTruthyEnv` / `isFalsyEnv`), as the other on/off variables are.
- A parent-settings key that is removed no longer leaves an empty block.
- An `env` value that is not a string is read as the text claude sets (`{"PORT": 8080}` is `"8080"`,
  `null` is `"null"`) with a warning, instead of being dropped (oracle 2.1.321).
- Managed MCP review: the startup exits follow the page's order (`--mcp-config` before
  `--strict-mcp-config`, a judgment when both apply); `/mcp` toggles no longer reach the servers of
  `managed-mcp.json` (the page documents them for provided servers only); an entry that fails several
  checks gets the notice of the first in the page's order; `reconcileManagedServers` and the hooks
  merge share one `canonical` helper (plain key sort, no locale); the plan-level tests now cover the
  allowlist split between file and provided servers, same-name precedence, `desktopManaged`, an empty
  map with connectors or Chrome allowed, and the connectors switch together with `allowAllClaudeAiMcps`.
- Managed-only and fail-closed key classes (managed-settings.md, "Keys only a managed source can
  set", "Keys that fail closed", "Invalid values inside `sandbox`"). Sixteen more keys have rows
  (`allowedMcpServers`, `allowedProviders`, `availableModelsMatch`, `deniedModels`,
  `forceLoginOrgUUID`, `gatewayInternalNetworks`, `disableSideloadFlags` and the control keys among
  them); a managed-only key in a user, project, local or `--settings` file is dropped with a warning.
  In the policy tier an unreadable value reads as the table's fallback: an empty allowlist for the
  MCP, provider, model, channel, marketplace and hook lists, `exact` for `availableModelsMatch`,
  `refuse` for `crossSessionInbound`, no organization for `forceLoginOrgUUID`, `true` for a lock; a
  `sandbox` block is repaired field by field and `sandbox.credentials` entry by entry; `permissions`
  and `autoMode` withhold their grants while a deny list cannot be read (`gatewaySignInRefused`,
  `PolicyLayer.invalid`). An unrecognized `crossSessionInbound` in a user, project, local or
  `--settings` file holds inbound messages even under a source that says `accept`, with the warning
  of errors.md. New `sideloadVerdict` and `addPluginsRefusal` for `disableSideloadFlags`. A `null`
  removes a general key as it removes a policy key.
- Managed key classes, review of the fail-closed findings. A managed `forceLoginOrgUUID` list with
  one non-text entry is unreadable whole and admits no organization. `gatewayInternalNetworks`
  refuses the ranges claude-apps-gateway.md names (loopback, link-local, CGNAT, the VPN and NAT64
  ranges, the three documentation ranges, `0.0.0.0/8`, `192.88.99.0/24`, multicast). `disableAutoMode`
  and `skipDangerousModePermissionPrompt` fail closed (`"disable"` and `false`), `forceRemoteSettingsRefresh`
  reads as `true` when unreadable, every restrictive lock of `permissions` is repaired in a managed
  source, and `worktree` and `attribution` are repaired per field. `sandbox.credentials` enforces the
  `name` rule and the per-list mask field rules, the warning of a degraded `files` entry notes the
  unenforced read block, and `sandbox.filesystem.disabled` is pinned to managed settings by a
  `deny` entry or a `sandbox.filesystem` block; `allowManagedMcpServersOnly` makes only the managed
  `allowedMcpServers` count. An empty list in a managed `sandbox` block stays. `merged()` carries the
  hold of an unrecognized `crossSessionInbound`. `sideloadRefusal` and `pluginDirsOf` delegate to
  `sideloadVerdict`, so `--agents`, `--mcp-config` and `CLAUDE_CODE_PLUGIN_DIRS` exit at startup as the
  docs say; new `midSessionMcpUpdates` for cloud sessions.
- Managed sources, review of the composition findings. An unreadable source now carries the
  underlying error (`{ unreadable: 'denied' | 'failed', reason }`), and the exit message names the
  failed path or registry value in its `Detail:` line as errors.md shows it. An unlistable
  `managed-settings.d/` reports `Managed settings drop-in directory could not be read: <reason>`, a
  warning when the operating system denied the read and an error otherwise; a failure that exits
  outranks a denial elsewhere in the file source. The helper's `forceRemoteSettingsRefresh` is no
  longer left in the helper layer, and `PolicyHelper` and `ManagedBehavior` take their types from the
  SDK. Tests prove every cross-source key, every key of the merge table rows and the login-key gateway
  rules; the delivery and applicability stubs that echoed constants are now recorded as judgments.
  `docs/API.md` states the order in which a host wires the policy helper.
- Settings merge core, review of the permission, effort, source and file-location findings. The
  local file's allow rules and directories wait for trust only when it is tracked in git or `.claude`
  is a symlink (`permissionRuleLists(view, trusted, local)`); a host's parent `Read(!...)` and
  `Edit(!...)` deny and ask rules are dropped with and without the lock. A managed document that does
  not parse is fatal (`loadSettingsLayers` returns `fatal` and no layer, and `SettingsSources.label`
  names the source in the message). `effortLevel` and `modelSettings` take low, medium, high and xhigh
  only (from the SDK type, no `max`); new `effectiveCap` and `capEffort` apply `maxEffortLevel` with
  its per-model entry. General keys are value-checked (a wrong type, a malformed permission rule,
  the telemetry export variables of a repository's `env`); `--permission-mode`, `--effort` for
  `modelSettings` and the `availableModels` gate on `--model` join the session overrides;
  `managedChangeAdvice` answers "A managed change hasn't reached you". New `permissionRulesOf`
  (host) parses the lists with the source of each file.
- Permissions: the settings keys and the starting mode. `permissions`, `allowManagedPermissionRulesOnly`,
  `autoMode`, `disableAutoMode`, `skipAutoPermissionPrompt`, `skipDangerousModePermissionPrompt` and
  `useAutoModeDuringPlan` are policy keys (per-field repair, fail-closed in the policy tier, the merge and
  scope of each) behind `resolvePolicy(...).permissions`, with `startingMode` (flag, `defaultMode`, built-in
  default, the locks, the background bypass notice), `settingsLocations`, and `startPermissions`, which
  builds the `DecideContext`. `decide` gains `cannotPrompt` (a `-p` run denies what would prompt),
  `connectorToolsSetToAsk`, `preapprovedFetchDomain` and `repositoryDirectories`; `approvalMemory` tabulates
  "don't ask again".
- `resolveSettingsEnv` and `applySettingsEnv`, the `env` block (merge per variable, trust, the
  variables project and local files cannot set, the host-owned identity variables).
- Settings layers (`settings`): `readSettingsLayer` turns the JSON of one source (managed, parent,
  `--settings`, local, project, `--add-dir`, user) into a layer: marketplace key aliases read as
  their canonical key, a key its Scope line does not allow dropped with a warning, an unreadable
  value repaired as managed-settings.md says (empty allowlists, `true` locks, `strictPluginOnlyCustomization`
  as `true`, invalid entries stripped). `createPolicyView` answers `get`, `winner` and
  `eachFromHighest` over the ordered layers with one merge rule per key (`KEY_SPECS`), and
  `loadSettingsLayers` reads layers from a host's `SettingsSources`. `mergeHooks` combines the
  `hooks` of every file without letting a file remove a managed hook, and runs a handler defined in
  two files once. `POLICY_KEYS`, `PLUGIN_ONLY_SURFACES`, `SKILL_OVERRIDE_STATES`, `WORKFLOW_SIZES`,
  `MARKETPLACE_SOURCE_KINDS` and `MarketplaceSource` are asserted equal to the SDK's types.
- The plugin keys of the settings (`settings/plugins`): `enabledPlugin` and `forceEnabledByManaged`
  (`enabledPlugins` precedence, managed block and hide, `defaultEnabled`, `@synced`), `pluginConfig`
  (`pluginConfigs`, user and managed only, the `@builtin` id aliases), `modOrder` (`prependPlugins`
  and `appendPlugins`, the built-in guard), `syncDecision` (`syncClaudeAiPlugins`), `trustWarning`
  (`pluginTrustMessage`) and `createPluginSettingsPolicy`.
- Hook policy (`settings/hooks`): `createHookPolicy(view, locks, context)` answers `disableAllHooks`
  and `allowManagedHooksOnly` as `runs(origin)` for every origin of a hook (managed settings, SDK
  callbacks, user, project, local and `--settings` files, plugins and their mods, frontmatter), with
  the value left after precedence deciding the reach, force-enabled plugins matched by their full
  `plugin@marketplace` id, command-sourced plugins and built-in mods; `commandsDisabled`,
  `commandSettingsNarrowedToManaged`, `monitorsRun` and `goalCommandAvailable` give what follows the
  hooks. `httpHook(url, allowedEnvVars)` applies `allowedHttpHookUrls` (`matchUrlPattern`: `*`,
  host case and trailing dot) and `httpHookAllowedEnvVars` (the outer limit on a hook's list), both
  merged across files. The Agent SDK's `managedSettings` rules (ignored beside an administrator
  unless `parentSettingsBehavior` is `merge`; an empty allowlist ignored when the administrator ships
  hooks or enables a plugin) are applied before any decision.
- Channel keys (`settings/channels`): `createChannelSettingsPolicy(view, context)` answers
  `channelsEnabled` as `gate()` (blocked on Team and Enterprise, and on Console with managed
  settings, until managed `true`; open on Console without managed settings and on Pro, Max and
  Ultra; `false` is unset; users cannot lift it) and `allowedChannelPlugins` as `allowlist()` and
  `allowed(entry)` (the managed list replaces the host's default and is taken whole, an
  empty list blocks every plugin, an invalid value is an empty list, the string form equals the
  object; an entry carries the flag it came from, and the development flag skips the list for its own
  entries only, a bare `server:<name>` included, never for a closed gate, and only in an interactive
  session).
- Customization lock and the composed policy (`settings/customization`, `settings/resolve`):
  `createCustomizationPolicy(view, context)` reads `strictPluginOnlyCustomization` (`true` locks all
  four kinds, an array the kinds it names, an unreadable value `true`, an unknown name locks nothing
  and is counted) and answers `loads(surface, origin)` for skills, agents, hooks and MCP servers from
  the origins each sub-key entry lists, `skillsDirPlugins()` (stopped by a lock on any kind or the
  marketplace lists), `skillAllowedToolsPreapproved(skill)` and the documented `claude mcp add`
  refusal. `suggestionMarketplaces(view, registered)` answers `pluginSuggestionMarketplaces` (managed
  only, registered, source declared in the same managed settings, the official name alone).
  `resolvePolicy({ layers, context })` and `PolicyContext` compose every area over one view and feed
  the customization lock into the hook policy.
- Settings, customization lock: `McpOrigin` has `localConfig` beside `userConfig`, since local-scope MCP
  servers live in `~/.claude.json`, which the `mcp` lock stops loading from (the judgment that put the
  local scope in no table was wrong); tests now build the frontmatter hooks of a skills-directory plugin,
  the `--settings` and SDK-option hooks under a hooks lock, a parent's `strictKnownMarketplaces` as a
  non-declaration of a suggestion source, and the parent-lock composition; two tests that restated the
  origin table or cited a plain-skill fallback the kit does not implement are removed or renamed, and the
  fallback is recorded as a host decision.
- Settings, channel keys: `allowed(entry)` takes the flag each entry came from (`channels` or
  `development`), so a session with both kinds bypasses the list for the development entries only;
  a bare `server:<name>` development entry needs no plugin or marketplace; the closed gate carries
  `serverConnects: true` (the MCP server stays connected, only channel messages stop); `ChannelPluginRef`
  is the SDK's `allowedChannelPlugins` element type, declared once in `protocol/official.ts` and shared
  with the settings repair; the host's duty to refuse a channel server that negotiates protocol
  revision 2026-07-28 is recorded as a judgment; `null` and unreadable `channelsEnabled` and
  `allowedChannelPlugins` values are tested.
- Settings, hook policy: `allowedHttpHookUrls` pattern `http://localhost:*` now also matches
  `http://localhost/x` (a wildcard port also stands for no port), as the docs example says; a
  `disableAllHooks: true` in the SDK's `managedSettings` is a lock that binds as
  `allowManagedHooksOnly: true` (an administrator's `false` no longer lifts it, plugin monitors and
  agent frontmatter follow it, command sources stay enabled), and a non-Boolean value there other than
  `false` and `"false"` binds the same way with a warning instead of being dropped; `monitorsRun`
  takes the plugin id and matches managed `enabledPlugins` on the whole `plugin@marketplace`; tests
  cover `--settings` and SDK-option hooks and `--add-dir` and synced frontmatter under the `hooks`
  lock, `disableCommandPluginSources: true` alone, and the managed origin under the HTTP allowlists.
- Settings, plugin keys: a `--add-dir` directory now ranks below user settings and only its `true`
  `enabledPlugins` entry counts (plugins/loading.md), so it neither turns a plugin off nor overrides
  another file; the built-in guard's `pluginConfigs` options are read from managed settings only;
  `modOrder` reports the organization's mods that no list names (`unlisted`); a `pluginConfigs`
  entry that is not an object is dropped with a warning instead of shadowing a lower file; the
  option value types come from the SDK; tests no longer restate a constant or a neighbour.
- The policy view returns each key's value through a merge strategy typed over the key,
  with no cast; the `hooks` of a user, project, local or `--settings` file drop only the entries
  that fail (a bad handler, group or event) and keep the rest, while a managed source still ignores
  the whole field; the same handler under two matchers is recorded as an open requirement of the
  hooks engine instead of being presented as proven; the unused `PolicyContext` type is removed
  until the resolvers need it; one shared `isRecord` guard.
- ResolveEnv resolves settings environment values with scope, trust and launch-environment rules; envChange and envAfterCd model later application without unsetting removed variables. General readers cover agent view, theme, teammate mode, worktree settings, processWrapper argv parsing, command-line hook gates and plugin defaults. The host supplies the startup-safe variable classification and performs process execution.

#### hooks

- `CLAUDE_ENV_FILE`: two sessions of one host no longer share one file; each session's hooks write,
  clear and run the files of its own session id.
- Security: a hook whose run port throws no longer drops a sibling hook's deny or block. It is read
  as a hook that could not start (`not-started`, `Hook could not run: <message>`) through the
  on-failure table, and the other hooks' decisions stand.
- Security: the Stop block cap now holds in a session. The session built a new engine, with a fresh
  counter, for each dispatch, so a Stop hook could keep the turn going forever; the session now keeps
  one counter (and one set of `once` claims) for its whole life.
- A `once` hook is held while a dispatch runs it, so a concurrent dispatch leaves it out, and is
  dropped only after its first successful run (a background one when its process ends).
- Background `additionalContext` and `systemMessage` get the 10,000-character cap (spilled to
  `ScratchFiles`, else cut with a marker), and `additionalContext` the `<system-reminder>` escape.
- `addHooks`, or a skill registering hooks, for a plugin that no longer runs or that the plugin-only
  lock silences registers nothing.
- A winning `defer` drops every hook's `updatedInput`; prompt and agent hooks still waiting for a
  slot when the signal aborts report `cancelled`; an observer callback that throws is dropped.
- One subprocess scrub, proven against claude 2.1.321: hooks used a second copy that read only `=1` as on
  and kept `MY_AUTH`, `FOO_KEY`, `SSH_AUTH_SOCK`, JWT values and lower-case GitHub tokens wrongly; the
  other copy removed `MONKEY`, `TOKENIZER`, `AUTHOR` by substring and kept PEM keys. Both now go through
  `scrubAction` (whole words of the name in any case, URL passwords, PEM private keys and JWTs by value,
  `YARN_REGISTRY` among the registry URLs), 72 of 72 probed variables as claude leaves them.
  `scrubHookEnvironment` and `scrubRequested` are removed: `scrubEnvironment(env)` and
  `subprocessScrubEnabled(env)` serve every kind; `ScrubOptions.version` is optional.
- The warning for a hook type an event does not support reads `A hook of type http is not supported
  on …` (was `A http hook …`).
- Background hook deliveries carry their command's exit code, so hosts can keep a failed `once`
  hook registered instead of consuming it as a success.
- Command hooks and `subprocessEnvironment` for Bash set `CLAUDE_EFFORT` to the session's effort level.
- Hooks: the per-event contracts. Every `<Event> input` section, the decision-control table, the
  response schema of prompt hooks and the context, interaction, elicitation, defer and terminal sections
  of hooks.md are proven by tests against the docs' own examples and scripts. New: `resolveWorktreePath`
  (the path of a `WorktreeCreate` hook: last non-empty line, ANSI stripped, relative resolution, `.`/`..`
  and symlink refusals), `resolveDefer`, `preToolUseHookOutcome`, `DispatchRequest.taskCompletedBy` and
  `effects.stopCondition` for `TaskCompleted`; a `terminalSequence` is dropped outside an interactive
  session and a `PermissionDenied` `retry` when the classifier produced no verdict.
- Hooks: `CLAUDE_ENV_FILE`. The `EnvFileStore` port and `createEnvFiles` give `SessionStart` and `Setup`
  hooks the file that lasts the session and `CwdChanged` and `FileChanged` hooks the file a `CwdChanged`
  event clears, never a hook that runs PowerShell nor another event; `readPowershellVariables` reads the
  plain `export`, `declare -x` and `NAME=value` lines PowerShell commands receive (none, with the
  `Session environment is not all plain assignments` issue, when a line is another kind; on Windows
  without a value that holds `/` or `\`). A host session takes `envFiles` and `processId` and reads
  `session.hookEnvironment`.
- Hooks: the process environment. `CLAUDE_CODE_SESSION_ID` (the input's `session_id`), `CLAUDECODE`,
  `CLAUDE_CODE_CHILD_SESSION` and `CLAUDE_PID` are set; the settings files' `env` is written over the
  inherited environment; `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` removes credentials by the docs' table
  (`scrubEnvironment`) before the `OTEL_*` removal.
- Hooks: a shell-form hook that PowerShell runs by default whose command is only quoted strings fails with
  `PowerShell started no program` and the fixes instead of printing it.
- Hooks: runtime outcomes of a run. `UserPromptSubmit` block messages end with `Original prompt:` unless
  `suppressOriginalPrompt`; `DispatchRequest.interrupt` (`esc`, `enter`, `ctrl-enter` on `PostToolUse`)
  and `HookOutcome.interrupted` (an interrupted prompt check); the `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`
  cap on consecutive `Stop` and `SubagentStop` holds (`createStopBlockCap`); `refusing to honor the
  suspect capture` for a runner that reports `outputHeldOpen`; `This hook comes from the <plugin>
  plugin.` on a plugin's exit-2 block; `checkPluginDirectories`; `BackgroundDelivery.outcome`.
- Hooks (review of the per-event contracts): `effects.deferCondition` is removed, `resolveDefer` is the
  one way to know whether a `defer` applies; `effects.stopCondition` of a `TaskCompleted` now comes from
  its own merger and the teammate-stop rule of an `ok: false` hook from `EXIT2_RULES`, not from an event
  name; the tests no longer assert echoes of their own input, claims the host owns (`hook_response`,
  the debug log, the pasted-text expansion) or titles that overstate what they check; added tests for
  `ElicitationResult` `mode` and `elicitation_id`, the value sets of `PreModelSwitch` and
  `PostModelSwitch`, `UserPromptExpansion.command_source`, the `PreToolUse` exit-2 path through
  `decide`, and the `WorktreeCreate` path reading; the judgments for these are in `spec/judgments.md`.
- Hooks (review of the runtime outcomes): the `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` count resets when
  Claude calls a tool (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, with or without a hook) and
  when a Stop holds nothing, no longer on `stop_hook_active`; `StopBlockCap.reset` and
  `HookEngineOptions.stopCap` let a host that rebuilds its engine keep the counter; `Ctrl+Enter`'s
  10-second cap kills command hooks only; `HookObserver.finished` carries `exitCode`; `HeldOpenResult`
  types a runner's `outputHeldOpen`; `checkPluginDirectories` is on by default; the plugin sentence is
  left off a block whose stderr is not the message, and a plugin is named by its manifest name, else
  its id, everywhere.
- Hooks: `onFailure: "block"` blocked on a failure of a hook with only `asyncRewake` set, which is a
  background hook like one with `async`.
- Hooks and settings (review of the exec stream): the scrub keeps `http_proxy` and `https_proxy` in lower
  case as it keeps `HTTP_PROXY` and `HTTPS_PROXY`; `subprocessEnvironment` and
  `session.subprocessEnvironment(kind)` build the environment of a hook, Bash, PowerShell, stdio MCP or
  Monitor process, and `scrubEnvironment` and `scrubRequested` are exported as `docs/API.md` says; on a
  Windows host the settings `env` reads off values and the launch environment without regard to case;
  the judgments of the scrub, the managed layer order, the `CLAUDE_ENV_FILE` of exec-form hooks and the
  PowerShell reader are recorded and tested outside `spec(...)`.
- Hook output tests (`SubagentStart.additionalContext`): the title no longer claims `continue` is
  dropped (it is carried); the matcher, the `<system-reminder>` escape, the cap boundary, the
  2,000-character preview, the independence of hooks under the cap and the `hookEventName` failure
  are now asserted.
- Hook verdict and engine: a block now says who is shown its text (`BlockInfo.to`: `claude`, `user`,
  `user-and-claude` or `none`), and on the events whose docs show it to no one (`ConfigChange`,
  `Elicitation`, `ElicitationResult`, `WorktreeCreate`, `WorktreeRemove`) `reason` and `message` are
  empty, the debug-log events keeping the hook's line in `debug`; a `PostToolBatch` stop leaves a
  notice for the transcript and feedback for Claude; on `Elicitation` and `ElicitationResult` only
  `hookSpecificOutput` is dropped from a run that did not exit 0 (`systemMessage` and `continue`
  still count); a `UserPromptSubmit` command, HTTP or MCP tool hook that times out leaves a notice
  with the timeout and the discarded output; a `continue: false` block no longer replaces an exit-2
  reason; tests assert the route per event against the docs, the `<Event> hook error` notice of
  `SessionStart`, `SubagentStart` and `PostModelSwitch`, and the judgments of assembling blocks.
- Hook output: a `Stop` or `SubagentStop` hook that returns `continue: false` with
  `additionalContext` stops instead of keeping the turn going; `decision` is `block` on every event,
  and the deprecated `approve` is valid on `PreToolUse` only (any other value fails validation); a
  `PreToolUse` `deny` from one hook drops another hook's `updatedInput`, as an exit-2 deny does; the
  10,000-character cap no longer spills a `systemMessage` or specific field the event discards; the
  merge and the cap use the checked output instead of parsing it again; the tool output mirrors and
  `GateEffects` are bound to more of the official types; tests assert where a block's text goes
  (`block.to`) per event, the `WorktreeCreate` path, the `PreCompact`, `TaskCreated` and
  `PostToolUseFailure` blocks, the `TeammateIdle`, `TaskCompleted` and `SubagentStart` rows, and the
  control characters in an OSC body; the judgments behind those rules are recorded.
- Remote hook handlers: an `http` hook now honours the two settings allowlists through
  `RunContext.httpPolicy` (`allowedHttpHookUrls` skips a hook whose URL matches no `*` pattern, with a
  warning at `hooks.<Event>.url`; `httpHookAllowedEnvVars` narrows `allowedEnvVars` to the names on
  both lists); an `mcp_tool` hook returns `cancelled` when the session aborts while it waits for the
  server, instead of a "not connected" error, and with the optional `ports.clock` the wait and the
  call share one hook `timeout` (`timed-out` when the wait used it up); tests assert all 33 values
  of `WAITS_FOR_SERVER`, the exact appended prompt, malformed and reason-less replies for agent hooks
  too, and keep judgment tests out of the `spec(...)` blocks of other ids.
- Agent hooks: a Monitor command (matcher input `Monitor`) is also matched as `Bash` on
  `PreToolUse` and `PermissionRequest`, never on `PostToolUse` (hooks.md, "Match Monitor
  commands"); the `--agents` (flag) trust exemption, the `FileChanged` and `StopFailure` narrow
  grammar and the ignored matcher of events without matcher support are now proven under their
  `hooks.matcher.*` ids, and `spec/judgments.md` keeps only the managed-agent exemption there.
- `readHooksFile` accepts a mod-only file (`modules` with no `hooks`), `readHooksSettings` keeps a
  JSON-parsed `__proto__` event as an own key, a matcher that does not compile is no longer
  warned about on an event without matcher support, and a non-finite `timeout` reports "expected a
  positive, finite number of seconds".
- Hook selection (`hooks/select`): `createHookRegistry` and `selectHandlers` pick the handlers an
  event runs: the event catalog (cadence, supported handler types per event, `EndConversation`
  skipping both tool events), the field each event's matcher filters on (`MATCHER_TARGETS`, with
  the narrow grammar of `FileChanged` and `StopFailure`, the canonical model of a model switch, and
  the events that ignore a matcher), the documented matcher values tied to the SDK unions, `if`
  evaluated on tool events only, Monitor commands matched by a `Bash` matcher, settings-handler
  dedupe, `disableAllHooks` with managed precedence, workspace and folder trust, plugin enablement,
  `once` for skill frontmatter, and the `FileChanged` watch list.
- Hook selection (`hooks/select`): an `mcp_tool` hook on `Setup`, and on `SessionStart` at launch
  (startup, resume, fork), is skipped and reported as a warning, because the MCP servers are not
  available yet, and it runs after `/clear` or a compaction; an `if` of `Edit(src/**)` matches only
  the `src` directory in the working directory (`Edit(**/src/**)` for any depth) instead of any
  depth, and two rules joined with `&&` or `||` are reported as one rule that cannot match;
  `allowManagedHooksOnly` and the `strictPluginOnlyCustomization` hooks lock gate handlers by
  source (`allowManagedHooksOnly`, `forceEnabledPlugins` and `pluginOnlyHooks` on the session); the
  `FileChanged` watch list (`fileChangedWatchList(entries, session)`) skips handlers that cannot
  run; the session's `effort` takes the SDK type.
- Hook input (`hooks/input`): `HookSession.permissionMode` takes the host's own text, so the
  Manual label (sent as `"default"`) and a text that names no mode (warned, not sent) are reachable
  through the typed API; `duration_ms`, `seconds_since_last_response` and
  `estimated_cache_write_usd` accept any number, as the docs type them, while `context_tokens` and
  `index` stay whole numbers (a judgment); issue paths write an array index as `[n]`
  (`hooks.Stop.input.background_tasks[0].id`), as the warnings and the select stage do; the input
  build no longer relies on casts beyond one commented join, and tests now cover `mcp_server`,
  `permission_suggestions`, `tool_calls`, the optional titles and the Elicitation and ConfigChange
  enums.
- Command handler: an `asyncRewake` hook that exits with code 2 and writes only blank output no
  longer wakes Claude with an empty reminder; the `OTEL_` exporter variables are removed in any
  case on a Windows host; the handler registry dispatches without a type assertion; the PowerShell
  rewrite of a settings hook's plugin placeholders, the override of inherited variables, and the
  host-chosen default shell are recorded as judgments. Tests: judgments moved out of `spec(...)`,
  and added for `${user_config.*}` in `command`, Git Bash path normalization and Windows exported
  paths.
- Command hooks and Markdown content of a plugin: `resolveHookCommand` (exec form substitutes
  `command` and each `args` element including `${user_config.*}`; shell form through bash or
  PowerShell refuses `${user_config.*}` with the documented error, `${env:NAME}` placeholders for
  PowerShell, the path and option variables the process receives) and `substituteContent` (path
  variables and non-sensitive options in a skill, command or agent body, a placeholder for a
  sensitive one), with the `HOOK_GUARD` message.
- Hook output exposes classifierContext with its shared 2,000-character cap and classifierTrust; notes for unrecorded read-only lookups are discarded. reviewHookRewrite decides whether a changed call applies, is denied, or drops a further rewrite on a repeat. afterHandbackDenial counts the three retry notices; the host delivers them.

#### skills

- A skill's or command's `!` command pasted `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}`,
  `${CLAUDE_PLUGIN_DATA}` and `${CLAUDE_PROJECT_DIR}` into the text the shell runs, so a plugin or
  project folder named `x$(touch PWNED)` ran `touch` once the command was allowed (Claude Code 2.1.322
  does the same). Under the default `shellPaths` the shell now gets the braced references
  (PowerShell `${env:NAME}`) and the process environment the paths the command names; `'pasted'`
  keeps the old text. The refusal check, the permission check, the `allowed-tools` grants and auto
  mode's instruction still read the command with the paths written in, so permission decisions do
  not change. `$ARGUMENTS` is still pasted. Proven through the public session in
  tests/host/skill-shell-paths.test.ts. API changes: `PlannedCommand` gains `shellCommand` and
  `environment` (what `CommandRunner` gets), and `PlannedCommand.command` and `ShellCall.command` are
  the text that is checked; `SkillSession.shellPaths`, and `ExpandSession` takes `shellPaths`;
  `SubstitutionScope.extraPaths`, the names in `extra` that are paths; the substitution surfaces
  `skill-bash` and `skill-powershell`; `shellExports(referenced, scope, ask)` reads `extra` and
  `extraPaths` of `scope` too, and is exported from `loading/resolve` with `surfacePolicy`;
  `renderPluginVariable` takes any variable name.
- `Expansion.references`: the files a local skill's or command's expanded text names with `@`,
  which Claude Code attaches (skills.md, "How Claude Code handles the body of a synced skill"). The
  kit reported none, so a host attached nothing; a synced skill's stay literal outside an isolated
  session. `expandMessage` reads a workflow's name as no skill, as `skillCatalog` lists it, and
  `skills()` no longer lists a row whose command reaches another row.
- A skill's `!` command gets `CLAUDE_EFFORT`, and skill expansion and the workflow switch use the
  turn's `hookPorts` instead of the session's.
- A `commands` path naming `./skills/` loads each skill folder once.
- A folder with a `SKILL.md` inside a `commands` folder is a skill named by its folder, not a
  `folder:SKILL` command, and it is listed ahead of `skills/` (Claude Code 2.1.319).
- A skill named by its own frontmatter (a root `SKILL.md`, a listed skill folder) drops the plugin's
  own prefix and turns every character outside `[A-Za-z0-9_-]` into `-`, as Claude Code does.
- A skill with neither `description` nor `when_to_use` is not listed to the model; it stays a `/`
  command and the Skill tool still runs it.
- The model's skill listing joins `description` and `when_to_use` with ` - `, as Claude Code does.
- The kit sorts every folder listing itself (`format/listing.ts`, by code unit): a port whose `list`
  is unsorted or locale-sorted no longer changes the order of skills, commands and agents, which
  duplicate wins, or which skills keep their description in the listing budget. `PluginFiles.list`
  may return entries in any order.
- An expanded skill's text opens with `Base directory for this skill: <folder>`, and a sensitive option in skill or command content reads `[sensitive option '<key>' not available in skill content]` whether or not it is saved, as Claude Code sends the model (`bun run oracle:model-content`).
- Of a file or skill folder and a link to it, the entry itself stays whatever their name order (a
  skill folder no longer keeps folder order); of links only, the first in folder order.
- A symlinked folder inside `commands/` or `agents/` is no longer entered, as in Claude Code
  2.1.322; a skills scan still follows a linked skill folder, with the containment check.
- Session registration, as Claude Code 2.1.319 does (`bun run oracle:runtime`): a plugin skill a scan
  finds is named after its folder, not its frontmatter `name`; two agents with one `name` register
  once; a skill and a command with one name are one menu entry, the command; a plugin whose manifest
  sets `defaultEnabled: false` is off until `enabledPlugins` turns it on.
- Skills review: a `Skill(name)` allow or ask rule matches the invoked name and the skill's own name (a
  deny rule still sees every name); the file an injected command's oversized output is saved to is cut at
  64 MiB, between two UTF-8 characters, and the note says so; judgments record the host mapping of Claude's
  `args`, the SDK command lists, and how `&` and entities in a description are handled.
- Commands: review fixes. The judgments the kit makes about commands (blank entry fields, a source
  that is never read, `${CLAUDE_PLUGIN_ROOT}` in an entry's `allowedTools`, `name` and `paths`
  dropped silently, trimming, only a `.md` extension stripped from a file name, no extension rule
  for a `source`) are recorded in spec/judgments.md and tested outside `spec()`, so they no longer
  count toward the compatibility percentage; the "exactly one of `source` or `content`" message is
  shared between the manifest schema and `readCommandEntry`.
- Review fixes for invocation, listing and execution. A skill named after plain text now
  permits the model's run of a `disable-model-invocation` skill (`permittedByMention`);
  `readSkillMentions` stacks up to six skills at the start of a message with the shared trailing
  arguments (`stacked`, the host's `stackable` stop rule, `interactive: false` for `-p`); the
  listing budget falls back to 8,000 characters instead of no limit, and a path-scoped skill is
  listed by name until its paths activate it; `paths` brace expansion shares the documented budget of
  1,000 patterns and 4 MiB (a pattern over it is used unexpanded) and an uncompilable pattern matches
  nothing instead of throwing; `TurnSession.supportedEfforts` clamps the effort to the highest
  supported level at or below; a scheduled fire and a preload get their own refusal text.
- A refused name or folder is reported once by field (`folder name has ...`, not `folder
  folder name has ...`); outside a plugin a name or folder `anthropic-skills` or
  `anthropic-skills:<name>`, and a user or project folder `synced` (any case), refuse the skill.
- `substituteArguments` no longer expands a `$` inside a declared argument name a second
  time (`$a$b $b` with `a$b` and `b` declared gave `xy y`, now `x y`). `substituteAllowedTools`
  substitutes the Bash rules of `allowed-tools` (the docs' "same variable in both places"), where
  `substituteVariables` was only documented to; the judgments record the escaped-placeholder
  append, three backslashes, `$ARGUMENTS[x]` and `${user_config.*}` in typed arguments.
- Review fixes for `expandSkill`. A skill that declares hooks under the hooks lock keeps
  its `allowed-tools` pre-approval when it runs through `context: fork`; the plugin sources the
  managed settings treat like folders are modelled (`ExpandSession.pluginSource`:
  `skills-directory` loses hooks under the lock and its grant under `allowManagedPermissionRulesOnly`,
  `inline-managed-session` loses its grant); an injected command's timeout is
  `BASH_DEFAULT_TIMEOUT_MS` (default 2 minutes) and the timeout message names it; the permission
  check receives the same CRLF-normalised command the shell runs. The judgments record who owns
  `EndConversation` in `disallowed`, output past the inline ceiling, and the bundled and managed
  skills `disableSkillShellExecution` leaves alone.
- Skill keys (`settings/skills`): `createSkillSettingsPolicy(view, context)` answers
  `skillOverrides` as `visibility(name, subject)` (the four states over what Claude sees, the `/`
  menu and the Remote Control and SDK command lists, the `skillOverrides` error for an `off` skill,
  plugin skills untouched, bundled-skill alias entries from managed settings and `--settings` files
  that can only restrict further), `disableBundledSkills` with `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`
  (neither undoes the other), `disableSkillShellExecution` as a per-origin verdict with the
  `[shell command execution disabled by policy]` replacement (a managed `true` is never overridden),
  and `syncClaudeAiSkills` as the same decision `syncClaudeAiPlugins` gives.
- An unquoted `argument-hint: [topic: foo | bar]` is written back as that text instead of
  being dropped; the unknown-event warning of a skill's `hooks` no longer repeats the `hooks.`
  prefix; the shell list is checked against the host's `ShellKind`; the judgments cover an
  unbalanced list delimiter, an unknown hook event kept with a warning, the comma split of
  `arguments` and the skill folder of a Windows path.
- Memory index: `truncateMemoryIndex` strips a block-level HTML comment only when it opens a line
  and ends on the line of its own first `-->`, and not inside fenced code, so text between two
  comments is no longer dropped and `truncated` stays honest; the `skills` tests prove `Skill` in
  `tools` is no preload, and the comma-separated `skills` string is a recorded judgment.
- Settings, skills: the `disableBundledSkills` decision now says built-in commands and `/doctor` stay
  typable (`builtInCommandsTypable`); tests cover a `--settings` own-name entry that does not beat an
  alias, the same alias set in managed and `--settings` files, a parent `true` against a lower
  `false`, and a parent `false` under a managed `true`; the repair of an unknown `skillOverrides`
  state is recorded in `spec/judgments.md`, and the non-Boolean managed
  `disableSkillShellExecution` test sits with the judgments.

#### agents

- A saved workflow, agent or command file the host refuses to read is skipped with a warning
  instead of rejecting the whole scan.
- A plugin's workflows are `/<plugin>:<meta.name>` rows of `session.skills().menu` and of the model
  listing, ahead of the skills, unless workflows are off; `session.skills().workflows` names them
  for the host to run, and `PluginHostOptions.workflows` gives the plan and organization switch.
- A link inside a plugin to another agent, command or skill folder of the same plugin registers it once, as Claude Code does (runtime fixture `symlinked-duplicates`).
- Sub-agent catalog review: a `Task(...)` deny rule works as an alias of `Agent(...)`; `readFlagAgents`
  reports the schema problems of every definition before the `-` names and cuts more than 20 lines to
  `…and N more`; `resolveSubagentModel` takes `builtin: { name, connection }` and runs Explore on the `opus`
  alias for a Fable main model over a subscription, Console or LLM gateway; `AgentOverrides` let a host pass
  its deny rules, `--agents` value and `interactive` per call to `agentCatalog` and `reloadAgents`, and
  `session.selectAgent` picks the session agent; the judgments file keeps all its earlier rows again.
- Workflows and themes (review findings): `stallWindowMs` takes the host's risen default as `defaultMs`, which
  loses to `stallMs` and to `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`; a lexical problem in the body of a script
  (an unterminated string, template or comment) no longer discards a valid `meta`, and a rewrite of such a
  script works; a rewrite adds a field with the line ending of a CRLF block; `rewriteWorkflowMeta` lives in
  `workflow-meta-rewrite` and `MetaPatch.phases` takes object entries; `WorkflowMeta` gains `phaseEntries`
  and `whenToUse`; `Theme.extraOverrides` keeps the tokens the reference omits, so a copy of a plugin theme or
  a rewrite loses none; `PluginTheme.qualifiedName` is gone (a theme has no `<plugin>:` name);
  `planReplay`/`replayAgent` compare an options fingerprint too (`AgentCall`, `options-differ`); a
  schema that contradicts itself (`checkAgentSchema`) and the validation attempts (`afterInvalidOutput`,
  `structuredOutputAttempts`); `themeColorToHex`; the order of two same-named workflows in one folder no
  longer depends on the host locale; the literal reader returns a result instead of throwing;
  `relaunchAfter` replaces the constant `continuesOnItsOwn`, and `startsNewAgents` is gone from the usage-limit
  decision. Tests assert behaviour instead of reading constants back; the unrecorded judgments have rows.
- Agents: one subagent tool resolution. `resolveCatalogSubagentTools` is gone; `resolveSubagentTools`
  keeps what it did that the other did not (`ExitWorktree` withheld from a subagent in its own working
  directory, the `Glob` and `Grep` a `tools` list names without `Bash`), and the `tools.tool.*` tests
  that proved the tools table through it now run on `resolveSubagentTools`.
- Workflow keys (`settings/workflows`): `createWorkflowSettingsPolicy(view, context)` answers
  `disableWorkflows` and `enableWorkflows` as `enablement()` (off by `disableWorkflows` in any file,
  `CLAUDE_CODE_DISABLE_WORKFLOWS=1` or the organization's toggle, none undone by `enableWorkflows:
  true`; on by default except on Pro; what goes with workflows; the `/config` row),
  `workflowKeywordTriggerEnabled` as `keyword(prompt)` (the `ultracode` keyword triggers only in a
  prompt a person typed, never for `-p`, a scheduled task, an unstamped SDK prompt or a relayed
  event) and `workflowSizeGuideline` as `size()` (agent count advice, precedence over the `/config`
  choice, the `Large workflow` threshold).
- Settings, workflow keys: the decision no longer carries `inProgressRunsContinue`, a constant that
  described no run state (the duty to let a run finish is recorded as a host duty); the size
  decision returns `largeWorkflowThreshold` and the new `largeWorkflowTokens` (1.5 million) as
  `undefined` while the host says `ultracode` is on, as the docs say the `Large workflow` warning
  does not show then; tests table every prompt surface and every non-human SDK origin with its
  expected verdict and reason, and show that `workflowKeywordTriggerEnabled: false` leaves
  `/effort ultracode` and the workflow surfaces as they are.
- Agent launch: `worktreeDisposition` takes `{ isolation, hasChanges }` and returns `none` for an
  agent without `isolation: worktree`; `ClaudeMdScopes` gains `nested` (a subdirectory's CLAUDE.md
  and path-scoped rules still load with `omitClaudeMd`); the model, effort, background and
  auto-compact tests now prove what the docs say (resolved model per value, documented-only
  cases), the judgments sit in their own blocks, and `spec/judgments.md` records the
  `CLAUDE_CODE_EFFORT_LEVEL=auto` effect on subagents, the host-side `k`/`M` suffixes of
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, the `agent.spawn` model and the Explore and Plan subagents.
- `resolveSubagentTools`: a `tools` list naming `SubagentHandback` is no longer refused when the
  host grants it (`handback`), in the foreground or the background; `SubagentRun.teammate` keeps
  the task and cron tools in a background run; `AgentToolFields` derives from the SDK's
  `AgentDefinition`; the tests state their expected lists, cover `Task` and `Agent(type)` in
  `disallowedTools`, and the Glob/Grep grant is recorded as the host's.
- Agent fields: a quoted fraction such as `autoCompactWindow: "200000.5"` is dropped with
  `invalid autoCompactWindow` instead of truncating to 200000; `background` and `omitClaudeMd`
  accept a YAML boolean or the text `true` or `false` only (not `yes`, `on`, `1`); an empty
  inline `mcpServers` definition (`- {}`) is dropped; a plugin agent now has a test for each of
  `tools`, `disallowedTools`, `skills` and `memory`; the judgments say why plugin-ignored fields
  are not "unrecognized".
- Agent files: a project, user or managed file with a name that breaks a rule now has each rule's
  own wording tested; a plugin agent in a file named `.md` is named `.md`, not an empty string; a
  `--add-dir` directory reads as `project`, and `flag` is no source of a file read (`readAgent`).
- Split subagent context by responsibility: persistent memory, preloaded skills and scoped MCP servers; add folder trust diagnostics and model allowlist substitution. The host still owns provider resolution, connections and prompt assembly.

#### marketplace

- Security: `isBlockedHost` refuses the whole 0.0.0.0/8 block (it refused only `0.0.0.0`) and
  ignores any number of trailing dots on a host (it ignored one), so `0.1.2.3` and `localhost..`
  are blocked like `0.0.0.0` and `localhost`.
- Security: `unsafeEntryIssue` (and so `fetchArchive`) finds a link of an archive by its name
  without regard to letter case, Unicode normalization or trailing dots and spaces, and refuses a
  link that shares such a name with another entry. On a file system that folds names (APFS, NTFS)
  a zip with a link `A` and an entry `a/B` was accepted and then written through the link, outside
  the plugin directory. A host that unzips still checks the real path of the folder it writes
  into (docs/SECURITY.md, "Risks the host owns").
- `fetchArchive` finds the plugin root of a zip macOS Finder made: the `__MACOSX` folder beside the
  one wrapping directory is not counted, so the root is that directory (it was refused with "no
  plugin root").
- Security: an npm plugin source can no longer smuggle another source through its version. The
  version appended to `package` and the `version` field must be a semver version, a range or a
  URL-safe dist-tag; a git address, folder, `file:` path, alias or tarball there is refused with its
  reason, and the package name must follow npm's naming rule.
- Security: an `archive` source can no longer escape the plugin directory through a chain of
  symbolic links. A link target is resolved through the archive's other link entries (at most 40
  hops; a loop or an absolute target is refused), and an entry written through a link entry is
  refused (`The archive entry "<path>" is written through the symbolic link "<link>"`).
- `MARKETPLACE_SOURCE_KINDS` has one definition (`format/marketplace` re-exports the settings list).
- Node.js package dependencies (review fixes): a lockfile download link that does not use `https`
  (`ftp:`, another scheme, none) is refused, not only `http`; a `bun.lock` id with a link is a
  tarball dependency and so no registry package; a registry package that is not pinned to an exact
  version in the lockfile gets no install (`unpinned-dependency`); the install-folder guard compares
  Windows paths and ignores case; a `package.json` that is not a JSON object is its own reason
  (`package-json-unreadable`). A skip is now a union over its reason with typed fields instead of a
  `detail` list, `skipReasonText` gives its clause, `LOCKFILE_NAMES` and `UNSUPPORTED_LOCKFILES` are
  exported, and `stage.moveBack.replaceExisting` says an existing `node_modules` is replaced. Tests
  assert the documented link-mode and npm-source sentences, every reason's whole clause, and the
  plan-level cases for workspace, linked and git dependencies.
- Install and cache lifecycle (review fixes): an install of a source kind the kit cannot fetch is
  refused with `This plugin uses a source type your Claude Code version does not support...`; a
  link-mode install without the printed directory or its entries, or with an entry name that is
  empty, `.`, `..` or holds a `/`, plans nothing, and a plan reports `copy` and `mustStayAt`; a
  version that cannot name a folder no longer refuses a plugin loaded in place; two spellings of one
  project folder on Windows are one install (`planInstallFinish` takes `platform`); `dirsToOrphan`
  and `orphanSweep` take the store layout and skip folders outside the cache, and `selectUninstall`
  (now taking `plugin` and `layout`) returns the `orphaned` folders and the not-installed issue and
  removes nothing at project or local scope without a folder; `planTreeCopy` skips a link that
  closes a cycle (`copying`), and its too-large message names the limit given; the loader's
  `locate` now decides every declared path through `escapedPathIssue` (moved to `format/path-escape`;
  a backslash on macOS and Linux, a drive path, and links between plugins of one marketplace;
  `loadPlugin` and `discoverComponents` take `platform` and `roots`); `lfsPointerIssues` warns for
  each pointer file of a cloned plugin and CRLF pointers are read; `StagedDirectory.commit` takes
  a `StagedCommit` with the `TreePlan`; the host surfaces gained the desktop app and VS Code, what
  `/plugin` opens, the scope choices, when an install applies and the official marketplace at the
  first interactive start (`planPluginCommand`, `planPluginApply`, `scopeChoices`,
  `marketplacesAddedAtStart`; `INSTALL_HOSTS` is no longer public).
- Plugin versions (review fixes): a stated or computed version that is not one folder name (`../x`,
  `a/b`) no longer reaches the cache path (`isVersionSegment`; it is skipped for the next source of a
  version, else `unknown`); a `git-subdir` input always carries its `subdir`; `inGitMarketplace` is
  now `inGitRepository` (the plugin directory or its marketplace); `unknownVersionSteps` takes
  `{ name, marketplace }` and reruns each scope once; the SP2 gate reads ids that hold quotes, so the
  folder-collision section is proven; links, empty directories, `strict` and same-event hook
  replacement gained tests.
- Install records and plans (review fixes): a `__proto__` key in `installed_plugins.json` or
  `known_marketplaces.json` is kept like any other (it was dropped); the default plugins root honours
  `CLAUDE_CONFIG_DIR`; a session prints `✔ Updated N marketplaces` where a shell prints `Successfully
  updated ...`, and a shell `marketplace remove` needs its name; dependency plans work per scope (a
  dependency installed only at another scope is installed at the target scope, a plugin already
  installed there says `is already installed (scope: ...)`, `defaultEnabled: false` stays off) and
  `planEnable` fails for a dependency the organization's policy blocks or that is `false` above the
  target scope; an install decides `Plugin is now active.` or `Run /reload-plugins to apply.` from
  the prompt-cache and activation facts, and closing the panel queues the reload while a response
  streams; the untrusted-source and refused-name cases of an ignored marketplace come from
  `loadNameIssues` with the entry's source; an empty `known_marketplaces.json` reports the documented
  `JSON Parse error: Unexpected EOF`; the dated copies age out on `cleanupPeriodDays` (`PluginStateStore`
  gains `modifiedAt` and `remove`; the host serialises rewrites of the records); the tests that echoed
  constants now assert the documented decisions (a real SHA-256, failing writes, the `--json` line).
- CLI plugin lifecycle: `plugin install --marketplace` runs the name checks of `marketplace add` on the
  marketplace it just added (an impersonating or reserved name, the `claudeai-` prefix, the
  download-folder rule) and refuses with `invalid_name` (`InstallFound.addedMarketplace.registered`);
  a bundled MCP server whose bundle is referenced by URL is `InstallOptions.unreadServers`: its keys
  are not listed and the not-applied line says to configure it in `/plugin`; the `invalid_config`
  failure lists its keys in `invalidKeys`, not `refused`; `plugin configure --values-stdin --json`
  leaves `unconfigured` out when `ConfigureFacts.readBack` is `false`; `uninstall --keep-data` keeps
  the data folder of a plugin `--prune` removes too; the unused `json` field of `ToggleArguments` and
  `DisableArguments` is gone. The accept-command, configure, `--prune`, scope and enable-dependency
  tests assert the refusal, the shown command, the pruned cleanup and each missing dependency; the
  codes and usage errors the docs do not quote, and the deferral of `install_records_unreadable`, are
  recorded in spec/judgments.md.
- Marketplace dependencies: `installClosure` no longer reports a false conflict when an installed
  root's marketplace entry changed a range (the root's installed range is replaced by its new one,
  and so is that of any plugin the walk reads from the catalog); a dependency already installed and
  enabled still has its own missing dependencies planned; an `--plugin-dir` copy meets an entry that
  names a marketplace only from Claude Code 2.1.242 (`InstallRequest.hostVersion`,
  `DeclaredDependency.namesMarketplace`); the allowlist bypass and the met check read the plugin's
  `enabledPlugins` at the install scope, not the winning scope's. The five install operations plan
  identically (recorded in `spec/judgments.md`) and the tests assert that through the facts, the
  bundle test runs under `auto-update` and `reload-plugins`, the force-moved tag, `=2.1.0` and
  no-version tests assert the decision the docs describe, and `Create a release tag` is no longer
  counted as proven until `claude plugin tag` exists. `docs/API.md` has one
  `resolveDependencyVersion` row.
- Marketplace updates: `checkForUpdate` now derives `loaded in place` from `loadsInPlace(source,
  origin)` instead of trusting the host, and its claude.ai subject has no manifest version field;
  `upToDateMessage` gives the `already at the latest version` wording; the SHA-256 of a downloaded
  archive is computed through the `Sha256` port (`archiveFacts`); `sourceFactsOf` and
  `versionCacheSegment` replace per-host switches; the blank-version rule is one helper. The
  version, release-channel, renames and release tests assert what each docs section adds, and the
  host-side messages and negatives are recorded in `spec/judgments.md`.
- Updates: the version policy ignores `autoUpdatesChannel` and `minimumVersion` from a `--add-dir`
  directory (`scopeCarries`); `channelSwitch` takes `from` and asks only for `latest` to `stable`;
  a command source's install or changed-command update is held until the user accepts
  (`runsAfterAnswer`) and an in-place reload carries the reload notice; `backgroundCheckResult`
  maps credentials and the remote to a check result, and a provider token never authenticates;
  `toggleLabel` derives from `AutoUpdateFacts`; `planUpdate` updates only an installed plugin;
  `KnownMarketplace.seeded` is optional. The tests assert each skip for both install commands, the
  fleet-wide `DISABLE_AUTOUPDATER` against command sources, and the disabled-plugin runs, and
  `spec/judgments.md` records the whitespace-tolerant flags and the failing-open start gate.
- Marketplace contracts: the `Marketplace`, `MarketplaceEntry`, `PluginSource` and
  `MarketplaceSource` shapes (with the closed `PLUGIN_SOURCE_KINDS` and `MARKETPLACE_SOURCE_KINDS`
  lists), the fetch plans (`FetchPlan`, `MarketplaceFetchPlan`, `ArchiveLimits`), the ports only
  marketplaces need (`Sha256`, `ArchiveReader`, `GitTags`, `SourceFetcher`), and the plugin id
  grammar shared by names, rename targets and dependencies (`PLUGIN_ID_PART`, `pluginIdIssues` with
  the documented "Claude Code cannot install plugin" and "cannot contain spaces" messages,
  `desktopNameIssues` for the Claude Desktop warnings).
- Plugin sources and their fetch plans (`marketplace`): `parsePluginSource` reads an entry's
  `source` (a relative path, `"."`, a bare name under `metadata.pluginRoot`, and the `github`,
  `url`, `git-subdir`, `npm`, `archive` and `command` objects with the documented field rules and
  messages: `Invalid string: must start with "./"`, `Path contains ".."`, the `unsupported`
  placeholder, `sha` of 40 lowercase hex, `sha256` of 64 hex, a command of printable ASCII, 500
  characters at most, with no run of four spaces, `timeout` 1 to 600 and `mode`); `planPluginFetch`
  turns a source into a `FetchPlan` (a relative path resolves from the marketplace root and not
  for a `url` or `settings` marketplace, `sha` wins over `ref`, `git-subdir` is a sparse and, over
  https or SSH, partial clone, npm never runs install scripts or installs dependencies, the npm
  refusals for git addresses, folders, `npm:` aliases, tarball links and http registries, an archive
  over https that is not a loopback, link-local or cloud-metadata host with its download and
  extraction limits, a command through `sh` or `cmd.exe` from the home directory, link mode refused
  on Windows); `runCommandSource` and `fetchArchive` run the two engines through `CommandRunner`,
  `HttpClient`, `Sha256`, `ArchiveReader` and the new `PluginDirectories` port and refuse every
  failure the docs list.
- Archive download headers (`marketplace`): `archiveDownloadHeaders` and `resolveHeaders` merge a
  marketplace `url` source's `headers` (sent to its own origin only) with an entry's (replacing by
  name), command output over `headers` within a place, and drop `Host`, `Cookie` and `X-Forwarded-*`
  from catalog and project entries; `helperAllowed` decides whether a `headersHelper` runs
  (`https://` marketplace URL, settings file and trust, `--add-dir`, `disableCommandPluginSources`
  and `allowManagedHooksOnly`, single install or update the user accepted); `runHeadersHelper` runs
  it through `CommandRunner` (10 seconds, JSON object of strings, no credential variables for a
  catalog or project command) and `helperCache` reuses a `url` source's output for 60 seconds. Entry
  validation also warns about routing headers and a `headersHelper` without a `sha256` pin.
- Marketplace sources (`marketplace`): `parseMarketplaceSource` reads the `source` object of
  `extraKnownMarketplaces` or an entry of `strictKnownMarketplaces` and `blockedMarketplaces`
  (`url`, `github`, `git`, `npm`, `file`, `directory`, `settings`, and the policy-only `skills-dir`,
  `hostPattern`, `pathPattern`) with every field (`path` defaulting to
  `.claude-plugin/marketplace.json`, `ref`, `sparsePaths`, the no-op `skipLfs`, a settings source's
  `name` equal to its key and not reserved, its inline `plugins` as remote entries, the `owner/*`
  wildcard in policy lists only) and the `loadStatus` `extraKnownMarketplaces` gives it;
  `planMarketplaceFetch` turns a source into a git clone, a 5 MiB and 10 second file download, an
  in-place read with the root two levels up, or an inline catalog; `parseMarketplaceInput` builds
  the source `claude plugin marketplace add` builds from what you type, with `--sparse`.
- Marketplace renames and removal (`marketplace`): `validateRenames` (also run by
  `validateMarketplace`) rejects a `renames` chain that cycles or ends outside `plugins` and a target
  that is not a plugin name; `resolveRename`, `renameNotice`, `migrateSettingsKeys` and
  `migrateSettingsScopes` follow the chain from the oldest name and rewrite or drop the old keys of
  `enabledPlugins` and `pluginConfigs` (managed settings are left and their notice recurs);
  `removedPlugins` decides what `forceRemoveDeletedPlugins` uninstalls and flags.
- Marketplace dependencies (`marketplace`): `normalizeDependency` reads a `dependencies` item
  (`"name"`, `"name@marketplace"` or an object with `name`, `marketplace` and a node-semver
  `version`), `releaseTag`, `parseReleaseTag`, `selectTag` and `combineRanges` resolve ranges against
  `<name>--v<version>` tags (pre-releases only with `^2.0.0-0`, conflicts reported as `has
  conflicting version requirements`), `resolveDependencyVersion` applies the source-kind rules (own
  repository fails with `has no git tag satisfying`, relative path falls back to the current copy,
  `npm`, `archive` and `command` check the plugin.json version), `checkInstalledDependency` and
  `checkDependency` give the quoted `is not installed`, `is disabled` and `Requires "<dep>" <range>,
  installed <version>` messages (local copies skip the range; claude.ai plugins meet a dependency
  only for `@synced` plugins), and `crossMarketplaceDecision` applies the root marketplace's
  `allowCrossMarketplaceDependenciesOn`. Adds the `semver` dependency.
- `readMarketplace` and `validateMarketplace` read every entry by default (the entry reader over
  `parsePluginSource`), so a marketplace file loads end to end and its entries feed `planPluginFetch`,
  `resolveRename`, `normalizeDependency` and `crossMarketplaceDecision`; `unreadEntry` is removed.
- Marketplace dependencies (`marketplace`): a dependency `name` and `marketplace` must satisfy the
  plugin id grammar (`a@b@c` and blank names are errors); the `@synced` note is added only for an
  enabled claude.ai plugin; `combineRanges` takes the dependency and names it by id; the new
  `autoUpdateDecision` skips an update whose current copy falls outside any installed range or whose
  ranges conflict; dependency issues carry the `errorType` of `claude plugin list --json`
  (`DependencyIssue`); `crossMarketplaceDecision` accepts the declaring plugin's marketplace and
  ignores its list; weak and misfiled dependency tests are replaced or moved outside `spec(...)`.
- Marketplace renames and removal (`marketplace`): `migrateSettingsKeys` and `migrateSettingsScopes`
  keep the type of the values they carry; `InstallScope` derives from the SDK's setting sources;
  `Renames` is the one type of the map; tests now prove the notice appears once, managed settings
  are left as given, a registered name that differs from the file's is used, and the first of two
  old keys rewritten to one new key wins; the judgments record these, the host's **Flagged**
  heading, and that renames chains are checked only by `validate`.
- Archive download headers: a `headersHelper` command runs only for the command and archive URL
  the user accepted (`AcceptedCommand`, replacing a bare flag; a change in the query string alone
  does not count unless the host sets `queryCounts`); an empty `CLAUDE_CONFIG_DIR` is unset;
  concurrent downloads on one origin share one command run; the entry and `url` source header
  types are taken from `MarketplaceEntry` and `MarketplaceSource`.
- Plugin sources and fetch plans: the archive compression ratio is judged against the length of
  the zip the kit downloaded and not against a size the host reports; a local plan carries a
  `submodules` rule (`none`, `plugin-subtree`, `whole-repository`) with `selectSubmodules` and
  `submodulePaths` for the git submodules a marketplace clone fetches; a `git-subdir` path with a
  drive letter or a UNC prefix is refused as absolute; the object source parsers read each field
  with a typed reader instead of a cast; the relative path tests assert the backslash message
  (also for a trailing backslash), a symlink counts as one entry at exactly 20,000 and 20,001, and
  a tarball link outside the default registry's path prefix is refused; the `sha256` lower casing
  and the placeholder `headers` of an archive plan are recorded as judgments.
- Marketplace entries: the `source` spec block proves only the entry-level behaviour (the parser's
  messages belong to the plugin source parser); `headers` and `headersHelper` count under their own
  ids, with a non-string helper dropping the entry; `effectiveTopic` gives the `relevance.topic`
  default and `effectiveDisplayName` the name users see; `dependencies` has negative cases for a
  non-string `version` and `marketplace`; the entry reserved-name check no longer filters the
  manifest's advice by its wording (`nameReservedIssues` is separate from the kebab-case advice); the
  version and no-effect headers warnings are recorded as reported when loading too.
- Marketplace file and names: a name with a non-ASCII character impersonates an official
  marketplace even when it spells a reserved name (`claude–code–plugins` with en dashes);
  `renames` keeps a `"__proto__"` entry from parsed JSON instead of dropping it; the name tests
  assert the exact reserved-name, Claude Desktop and non-anthropics `git` messages, and
  `metadata.pluginRoot` has its own spec block.
- Marketplace contracts: `ArchiveReader.stats` and `GitTags.list` report a corrupt zip, an
  unreachable git host or a fired signal as a `PortFailure` instead of a rejection (`stats` now
  takes a required `signal`); `MarketplaceSource` carries `skipLfs` on `github` and `git` and
  `version` and `registry` on `npm`, and a type-level test ties its kinds and fields to the SDK's.
- Marketplace sources: a source object that does not parse (a missing or mistyped required field,
  a `settings` name that differs from its key) reports the load status `Unsupported marketplace
  source type` instead of `loads`; `marketplace add` clones a `/_git/` URL even with a query string;
  the `http-file` plan carries the redirect rule of a `url` source (a different origin must use
  `https`, blocked hosts are refused, no configured header is sent); a relative `file` path has a
  root (`.` for fewer than two directories, the drive for `C:\m.json`); issue paths of a source
  plan are relative to the source object; one GitHub `owner/repo` rule serves plugin sources,
  marketplace sources and `marketplace add`; `--sparse`, `owner/*` and the `url` source's
  relative-path refusal count under their requirement ids, and the settings duplicate, `strict`,
  `npm` `version` and `registry`, and policy-warning tests assert their paths and messages.
- Marketplace gate (`settings/marketplaces`): `createMarketplaceGate(view)` answers
  `strictKnownMarketplaces` and `blockedMarketplaces` as verdicts (add, install, update, refresh,
  auto-update, session start, a marketplace that cannot be found, `skills-dir`), and
  `matchMarketplaceSource` is the shared matcher: exact entries, owner wildcards (case-sensitive on
  the allowlist, case-insensitive on the blocklist), `hostPattern` host extraction, `pathPattern`,
  canonical git URLs and `url` entries on the blocklist, `[]` as a lockdown, and the blocklist
  checked first.
- Marketplace registry and command sources (`settings/marketplaces`):
  `createMarketplaceRegistry(view, context).registrations()` plans `extraKnownMarketplaces` (whole-entry
  replacement across files, workspace trust for project, local and `--add-dir` entries, the allowlist
  and blocklist checked on the entry that wins, `settings` source rules, `headersHelper` ignored from
  `--add-dir`, `autoUpdate` defaults, the official marketplace implied by `enabledPlugins`), and
  `createCommandSourcePolicy(view)` answers `disableCommandPluginSources` (falling back to
  `allowManagedHooksOnly`) for command-sourced plugins and marketplace `headersHelper` commands.
- Settings, marketplace registry: `autoUpdate` defaults off for `knowledge-work-plugins` and
  `first-party-plugins` whatever the host lists as official; routing and identity headers (`Host`,
  `Cookie`, `X-Forwarded-*`) are dropped from an inline plugin entry's `headers` in a project, local
  or `--add-dir` file, `Authorization` kept; a `url` source that does not start with `https://`
  loses its `headersHelper`; `autoUpdateFixed` is set only for a registered managed entry; the
  inline plugin source kinds are typed over the SDK's union so a new kind fails to compile.
- Settings, marketplace gate: the blocked-source message quotes the source (`Marketplace source
  '<source>' is blocked by enterprise policy`); an empty allowlist ends it with `No external
  marketplaces are allowed.`; the load-time messages carry the docs' guidance line; a `github`
  shorthand refused by an allowlist that admits a host by hostname adds the `Tip:`;
  `skillsDirectoryPlugins()` reports `strictPluginOnlyCustomization` as the reason when any
  customization type is locked; tests assert whole messages and cover a pinned `ref` or `path` and
  both lists set.
- Marketplace file and names (`marketplace`): `readMarketplace` and `validateMarketplace` read the
  top level of `marketplace.json` (`name`, `owner`, `plugins`, `$schema`, `description`, `version`,
  `metadata`, the removal and rename keys) as Claude Code loads it and as `claude plugin validate`
  reports it, hand each entry to an `EntryReader` alone, and report unknown keys; the reserved-name
  rules (`marketplaceNameIssues`: official, community and directory names with the
  `github.com/anthropics/` exemption, impersonation, another spelling, `inline`, `npm`, JavaScript
  member names, `claudeai-`, the download-folder clash); `effectiveDescription` and
  `effectiveVersion`.

#### mods

- A mods dispatch whose `signal` aborted ran Claude Code's own behaviour when its hook failed
  after the abort (the hook was skipped and the core ran), when a `.catch` handler passed the event
  on, or when a hook called `next(e)` late. It now rejects with the abort's reason and no core runs
  (claude-code/index.d.ts:6999, :10821; spec/judgments.md `abortedCore`). A hook that fails while the
  call is live is still skipped, as declared.
- Mods `cutOutput` cuts by bytes, so a real trailing U+FFFD stays and `isTruncated` is true only
  when the text got shorter.
- A mod's `types` file or hooks module linked out of the plugin is refused, not read.
- A pre-release mods minimum version (`1.2.0-beta`) comes before its release.
- The host's event object is no longer frozen in place; a pass-through hook is no longer
  reported for an inner mod's drop; a reload keeps the mods' order; a RegExp matcher from another
  realm no longer matches everything; junk children of a box and non-http redirects are refused;
  host dispose aborts work under a host-given signal; a failing `onLoaded` no longer leaves hooks
  registered; `command.run` uses the rewritten command.
- Mods tool orchestration now compares rewritten frames with the model's original input, skips
  prompts after decisive permission results, and never reports a failed tool as successful.
- Mods, the events prose, the reference fields and the settings hook. `toolReadOnlyReport` gives
  `e.isReadOnly` of `tool.check` (`true` or absent, never `false`); `inputChangedDenial` denies a call
  whose input a hook changed after auto mode's review (`a hook changed this call's input after the model
  wrote it`); `withheldResultText` and `promptDroppedText` word what Claude and the user read of a
  withheld result and a dropped prompt; `settingsLayersForMods` builds `e.layers` (`plugin`, `user`,
  `project`, `local`, `flag`, `policy`, lowest first) and `readEngineSettings` forwards the chain's debug
  lines (`answered settings.read without next()`); a `settings.read` hook must answer `{ value }` or
  `{ deny }`; `ModsHost.runCommand` answers a registered command no `command.run` hook answered
  (`<mod> registered /tally but no command.run hook answered it`); a call a stopped session refuses
  raises the toast `Stopped: type a message to continue; a mod cannot resume work after Stop`; the
  built-in guard names a mod that tried to lift a deny rule once, in the debug log and the transcript;
  `turn.step` carries `turnId`; the test kit fires `settings.read` with empty `layers`. 48 requirements
  of events.md, reference.md and troubleshoot.md are proven, each with the docs' own example.
- Mods, review of `describeApi`, state reset and the mods API guide tests. `RunGate.userInput()` and
  `StateStore.reset()` deliver to every held notice and every write listener even when one throws,
  then report the failure (the error as thrown, several as an `AggregateError`); `runEach` in the
  foundation does it. `docs/API.md` says a `value` member of `describeApi` carries no value (the host
  copies it from the live `$`) and no arity. The test kit types `$.ui.mount` (`TestDollar`) and exports
  `MountHandle` and `MountSpec`. Tests: every one of the 79 calls of the table gets `next(e)`,
  `{ value }` and `{ deny }` from sample arguments (a call without a sample fails), a hook of a mod
  that runs after the caller never sees its call, `$.prompt.submit` without `asUser` reaches the port
  without it, `$.model.complete` asks no question and uses the Claude API's usage fields, the Add one
  button of hello-tabs runs through the pane, `types` left out or pointing at a missing file, and a
  write inside `ui.render` and the unchecked type of a declared value are recorded as judgments.
- Mods, review of crash behaviour and refused calls. `ModSession.send` receives the reason the
  session refuses new work (`send(to, text, signal, refusal?)`) and `unsentReason.subagent` /
  `unsentReason.teammate` word the `{ isDelivered: false, reason }` of the page's table. `ModTools.call`
  receives `held()` and `HELD_AT_TIMEOUT` words the line of a foreground Bash or PowerShell command
  ended at its timeout while input is held. `ModsHost.input.setLimits(limits)` changes
  `--max-turns` and `--max-budget-usd` for the next run of a long-lived host. Changes to the mod set
  (`load`, `reload`, a stop of the worker...) run one at a time, so a stop during `reload()` or two
  stops in a row no longer rewrite the loaded mods together; a mod that is unloaded or unloaded for
  a crash is forgotten by the replay ledger; a fresh copy the loader has no record of says so instead
  of vanishing. Judgments record the latest-release-only model of the version-gated behaviour, the
  host's part of "Work your mod started before the interruption" and the order of a replayed call
  among the mods before it. Tests: a spawned subagent's turns reach the `--max-turns` count, a stop
  traced to a built-in mod is untraced, and casts and a stray comment left the test support.
- Mods, review of per-mod load and where mods run. A refusal by another mod reaches the transcript of
  an interactive session that loads a plugin directory or hot-reloads (it was the debug log in every
  session). `ModsHostOptions.hotReload` is a getter, so the answer to the hot-reloading question moves
  later lines to the transcript at once. `modsVersionProblem` words an unreadable version as `this is
  an unreadable version (latest)`. Tests: the page's own `register.js` runs and its redraw is seen,
  edits take effect only in a watched directory, the whole change-notice lines, the hot-reloading
  answers and their state, the refused mod stays off the `mods active` line, and the WSL and
  feature-flag defaults.
- Mods, review fixes of the load seams. `createModsHost(...).fire` and `fireStream` take `before` (where
  managed `PreToolUse` hooks run, ahead of the first mod), which only the raw chain could set. A
  stack overflow is a `RangeError` or a message in an engine's words (`maximum call stack size
  exceeded`, `too much recursion`, `stack overflow`, `not enough stack space`), no longer any error
  that mentions a stack. `claude plugin validate` reports the scan problem of a compiler output, not an
  unrelated compiler issue. Tests: the order of managed, other settings and plugin `PreToolUse` hooks
  is driven through the host with the hook engine; `prependPlugins`, the built-in guard's run order,
  the filter with every field matching, deep freezing of events, the `my-mod:` log line through the
  real `$.ui.log`, the six `$` and import rules (each with its own reason, in
  `check-reads-wording.test.ts` where the page gives no wording), a blank `Client` error and the drawn
  failure node are now asserted; the linking reason, a session with no `modules` key and the compiler
  outputs of `validate` moved out of `spec(...)` as judgments, with new rows in `spec/judgments.md`.
- Mods hook chain (`mods/chain`): `createModChain` runs hooks as middleware by tier (`prepend`, `user`,
  `append`, `builtin`, then Claude Code) with `e` deeply frozen, `next(e)`, `next.signal`,
  `next.origin`, `next.budget`, `next.to(e, tier)`, matchers, `*` and `classic.*`, the failure
  policy with `.catch` handlers (`next.error`, `next.error.cause`, `next.called`), re-entry, the
  10 s, 50 ms (`prompt.edit`), 1 s (`.catch`) and shared `session.end` time limits measured on the
  `Clock` port (a hook's time stops inside `next` and mods API calls except `$.clock.sleep`), the
  28000-level nesting limits, async generator hooks for `turn.step` and `process.spawn`, and the
  telemetry events' `{ to: 'collector' }` filter. Foundations for the other parts of mods:
  `MOD_LIMITS`, `MOD_EVENT_NAMES` (48 events), `MODS_API`, `MOD_TIERS`, `foundation`
  (`createBudget`, `deepFreeze`, `plainDataProblem`, `jsonChars`), and the mods ports (`ModRuntime`,
  `ModCompiler`, `ModStore`, `TelemetrySink`, `ModWatcher`, `DenyRuleChecker`).
- Mods events (`mods/events`): `EVENT_SPECS` for the tool, prompt, command, `/config`, turn, session
  and subagent events (the documented input fields and the shapes a hook can answer with),
  `createEventRules` for the chain (`createModChain({ clock, rules })`: a result of the wrong shape
  fails the hook, a `drop` after `next` was answered fails it, `skill.prompt` refuses a change
  other than `text` and `frontmatter`, a resumed `agent.spawn` ignores a change, `session.append`
  takes only a changed `message.content`, a `drop` or `config.set` `deny` reason is cut at 4,096
  characters), `eventResultProblem`, `eventInputProblem`, `clampReason`, `mergeToolCheck` (plan mode
  lets a mod tighten a call that is not read-only, not approve it), `skillPromptEvent` (source,
  plugin name, path, frontmatter and its problem) and `autocompleteRows`.
- Mods API (`mods/api`): `createModsApi` builds the `$` of one mod from ports. Every call is an
  event through the chain and then a port (`$.fs`, `$.process`, `$.http`, `$.model`, `$.store`,
  `$.state`, `$.session`, `$.prompt`, `$.turn`, `$.config`, `$.settings`, `$.env`, `$.clock`,
  `$.mcp`, `$.audio`, `$.telemetry`, `$.command`, `$.tool`, `$.agent`, `$.plugin`), with the
  documented limits: 4 MiB for a file, a request body, a response, command output and the store,
  `isStdoutTruncated` and `isStderrTruncated`, the 30 second and 10 minute timeouts, five redirects
  and the dropped headers, `HEAD` and the `Content-Length` reason, `maxTokens` 1024 to 64,000 with
  prompt blocks and cache breakpoints, the newest 4,096 messages, and names of up to 64 letters,
  digits, `_` and `-` (`isValidModName`). `engine.create` adds or withholds a namespace and lends
  its methods the caller's context; `settings.read` has layers, sources and the own-read versus
  mod-read origin (`readEngineSettings`); registries of commands, tools (as `mcp__<plugin>__<name>`)
  and subagent types; `$.state` with `atom`, `read` and `update`; `withApiRules` composes the shape
  of API calls with `createEventRules()`; `AGENT_STATUSES`; and the ports behind it (`ModFs`,
  `ModFetcher`, `ModSpawner`, `ModModels`, `ModSession`...).
- The interface part of mods (`createModsUi`, `withUiRules`, `uiApi`): the 12 elements with their
  props, the apps that draw them and the props the VS Code extension ignores, the 15 render sites,
  tree validation (`treeProblem`, the documented `a tree Pane refuses:` lines) and the size limits
  (nesting 32, 20,000 nodes, `Raster` cells, `Image` bytes, 100,000 characters of text),
  `foldRender` (a tree, `next(e)`'s reference, the band and `AskUserQuestion` rules), panes
  (`$.ui.open` placement at 144 and 110 columns, `ui.close` origins), controls routed by key
  (`routeControl`, hotkeys, `action`, the collapsed band), the redraw throttle (10 and 30 a
  second, coalesced), `$.ui.toast` (4 seconds, `timeoutMs`, classic and fullscreen) and `$.ui`.
- Mods loading (`createModsHost`, `decideModLoad`, `orderMods`, `scanHooksModule`, `validateMod`, `activeModsLine`): which hooks modules load and in which tier under `disableAllHooks`, `allowManagedHooksOnly`, `disableSideloadFlags`, `prependPlugins`, `appendPlugins`, `pluginConfigs`, `CLAUDE_CODE_PLUGIN_DIRS` and the built-in guard `sec-default@builtin` (`allowManagedModsOnly`, `allowModsToOverrideDenyRules`); the `plugin.register` refusal; `/reload-plugins`; the static scan with the 2,000-scope limit; and the file names of a mod (`hooks/hooks.json`, `hooks/register.js`, `types/index.d.ts`, `.test.ts`).
- The mods test kit (`modsTesting`): `runModTests` for `claude plugin test [directory]` with Bun-style output, the 5-second limit and `timeoutMs`; `createTestKit` for `claude-code/testing` (`test`, `tier`, `expect`, `mock.clock`, `mock.store`, `mock.env`, `mock.session`, `$.ui.mount`); the `ModTestRuntime` port and the in-process `inlineRuntime` and `inlineTests`.
- Mods loading, policy, scan and test kit: the test kit fails a mods API call no stub answers with
  `no implementation for <name>` (not only `fs.read`), leaves `ui.invalidate`, `$.state` and
  `session.append` to itself, and reads `hooks.json` as JSON instead of searching its text; an
  inline mod written as method shorthand (`register(on) { ... }`, also `async`) loads; the host
  fires `session.start` for each loaded mod after `load` and `reload`, a reload leaves the mods
  the host registered itself, and `reloadMod(name)` keeps the version loaded before when a save
  breaks the module (`reload failed, the previous version stays loaded:`); an id in both
  `prependPlugins` and `appendPlugins` is prepended; the rollout switch refuses installed mods with
  the documented `for installed plugins` lines; `isTrusted: false` keeps mods out until the trust
  prompt is answered; `disableSideloadFlags` also rejects `--plugin-url`; the loader asks for the
  types file where `claude plugin validate` does and an import that leaves the plugin directory is
  refused; `validate` leaves out a file with nothing to report; the debug line lists the events;
  `ModsSettingsFile` is typed from the SDK's `Settings`; the judgments row for gating events names
  the five events of events.md.
- Mods interface: `$.ui.ask` goes through a `tool.call` of `AskUserQuestion` and reads
  `result.answers`, so the documented stub works and a dismissed question rejects; `ui.message` and
  `ui.fault` reach only the mod that drew the `Client` (`DispatchOptions.only`); a toast raised
  during a hold of toasts waits for the hold to end instead of timing out, and only the terminal
  holds; a failed `Client` has its dimmed line (`clientFailure`); a hook that answers `ui.render`
  without `next` writes `<mod> (<tier>) answered ui.render without next()` to the debug log;
  `drawsAsLink` accepts a missing `/` before a query or fragment; hotkeys press only while the pane
  or band has keyboard focus and no `Input` does; a `ui.render` hook that writes a value it read no
  longer redraws in a loop.
- Mods API: `$.clock.after` and `$.clock.every` return their timer at once (`timer.cancel()` needs
  no `await`, and also stops a timer whose event is still in the chain); a hook on a mods API call
  intercepts only the calls of the mods that run after it (`DispatchOptions.caller`); a pass-through
  hook on `process.spawn` is no longer reported as failed; `$.http.fetch` lower-cases response header
  names (a `Content-Length` in any case is honoured) and cuts `text` to 4 MiB of bytes itself;
  `asUser: false` is a plain submit; `effort` is an SDK `EffortLevel`; `$.fs.list` and `stat`
  carry only the documented fields; `$.agent.list` rows are checked against the reference's
  statuses; casts on JSON data are replaced by parses. The maximum process timeout and `maxTokens`
  are proven under `spec(...)`, the tests that only echoed a stub are now real, and the new
  judgments are rows in `spec/judgments.md`.
- Mods events: `mergeToolCheck` honours `e.ceiling` (`ask` caps a mod's `allow` at `ask`, as
  permissions.md says for connector tools an organization set to `ask`); `SESSION_END_REASONS` now
  lives in `src/protocol/exit-reasons.ts`, tied to the SDK's `ExitReason`; tests prove that a hook's
  `next(e)` rejects when a session message is not delivered, and the ordering, resumed-run and
  input-shape assertions moved out of `spec(...)` into judgments (new rows in `spec/judgments.md`).
- Mods chain: a synchronous mods API call gives the hook's time budget back, so a hook's own
  10 s, 50 ms or 1 s limit still fires after one; `walkPlainData` measures a sub-structure
  reached twice at its deepest place, so a shared sub-tree can no longer slip past the 28,000-level
  limits; a hook whose `.catch` handler fails too is reported with the hook's own reason, as if it
  had no handler; the host passes `rewritten` and `lent` flags in `ReentryInfo` and the chain
  picks `next.error.cause` (`rewritten` wins); `plugin.name` and `plugin.root` are values and no
  longer events (`API_EVENT_NAMES`, `ApiEventName`); `register` no longer takes the `core` tier.
  The speculative ports `ModSurface`, `ModEnv`, `ModWatcher`, `ModTurnPort` are removed, and the
  mods name and limit tables are compared with the pulled reference.
- Preserve a refusal of the engine settings read even when an outer hook returns a value; use a typed plugin-layer merge, isolate engine toast ownership and cover a timeout after next.

#### host

- A project or plugin folder whose name holds shell syntax ran it. The path variables were
  pasted into strings a shell parses, inside the docs' double quotes, which do not stop `$(...)`, a
  backtick or a `"`: a project folder named `x$(touch PWNED)` ran `touch` from a bash shell-form hook,
  a monitor `command` and an MCP `headersHelper`. `SubstitutionScope.monitorPaths` was never set by
  the session (`scopeOf`), and `PluginHostOptions` had no way to set it. Now, by default
  (`shellPaths: 'environment-reference'`), those three write `${CLAUDE_PLUGIN_ROOT}`,
  `${CLAUDE_PLUGIN_DATA}` and `${CLAUDE_PROJECT_DIR}` as braced references, and the values go in the
  process environment: a hook's, `ResolvedMonitor.environment` (and `MonitorStart.env`), and
  `HelperServer.paths` for `planHeadersHelper`. Proven through the public session in
  tests/host/shell-paths.test.ts. Exec-form hooks, PowerShell hooks (`${env:NAME}`), MCP stdio and LSP
  servers had no shell to inject into; the kit substitutes nothing in `statusLine`,
  `subagentStatusLine`, `fileSuggestion` or `apiKeyHelper`.
- A file a path-checked Bash file command names (`cat`, `ls`, `grep`, `touch`, `cp`, ...) outside
  the working directories needs approval in every mode, as in Claude Code 2.1.322: a prefix rule
  (`Bash(cat *)`) and a bare `Read` allow do not cover it, a path-specific `Read`/`Edit` allow does,
  a `Read`/`Edit` deny denies, and a tool-wide `Bash` allow or `bypassPermissions` runs it. So do an
  operand a variable hides, a `..` after a directory segment and a symlink the host resolved
  outside. The prompt is the mode's: `auto` classifies, `dontAsk` denies (`mode-dontask`, before:
  the redirect prompt's reason). A tool-wide `Bash` allow now covers redirect targets too. Commands
  Claude Code does not path-check (`less`, `xxd`, `du`, `chmod`, `ln`, ...) still obey `Read`/`Edit`
  deny and ask rules (docs/SECURITY.md). `sed -e SCRIPT` and `grep -e PATTERN` no longer read the
  script as a file.
- The read-only set sees through only what Claude Code 2.1.322 does, in its order: known-safe
  assignments with a value each accepts (`LANG=C`, `TZ=UTC`, `COLUMNS=80`; `LANG=x`, `FOO=1` and any
  expanding value are asked), `noglob`, `command` (`-p`, `--`) or `builtin`, and `timeout` with a bare
  duration. `nice`, `time`, `nohup`, `stdbuf`, `xargs` and `timeout` options in front are asked, and
  `git` or `cd` behind any wrapper is asked. Allow rules strip by the same value checks.
- A session's MCP servers and monitors expanded `${VAR}`, and its built-in subagent switches read
  their variables, from the host's environment port while its hooks and skills used the session's
  (`ports.environment`, a turn's over it). One view of the session's ports now feeds all of them, and
  its environment has the settings `env` written over it as Claude Code writes it into its process
  (env-vars.md, "Set variables in settings files"): a settings value now answers `${VAR}` in a
  server's config and an http hook's `allowedEnvVars`; `NO_COLOR` and `FORCE_COLOR` stay
  subprocess-only.
- A session's MCP and LSP servers, monitors and plugin agent prompts resolved `${CLAUDE_PROJECT_DIR}`,
  `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` with the host's locations while its hooks used
  `hookPorts.locations`: every part now reads the session's (`SessionOptions.locations`), and a turn
  can no longer move `CLAUDE_PROJECT_DIR` (hooks.md, "Worktrees are different").
- Security: a `./` or bare deny or ask rule (`Read(./private/**)`) under a current directory reached
  through a link (`/var/proj` is `/private/var/proj` on macOS) missed a read by the real spelling and a
  link inside the project into the denied folder. `resolveRuleDirectories` now maps each deny or ask
  rule's anchor (current directory, home, settings source folder) to its real location as well as the
  directory the rule names, so the `~/` rule of a linked home also holds before its folder exists.
- A working directory or `additionalDirectories` entry reached through a link counted the files below
  its real location as outside the working directories (prompts, `blockReadsOutsideWorkingDirectories`
  denials): `resolveRuleDirectories` maps the working directories too, and the scope checks read them.
- `session.checkTool` decided a hook's `updatedInput` with the `resolvedPaths` of the input Claude
  sent. With the new `resolver` option it prepares the input that runs (see Added).
- The source type-checks under a consumer's `erasableSyntaxOnly` (no parameter properties); the
  kit's tsconfig turns it on.
- Security: Bash permission rules can no longer be bypassed by spelling. A deny or ask rule also
  matches the command's spoken form (name unquoted, words one space apart, redirections and line
  continuations dropped: `rm\t-rf /`, `>out rm x`, `r\<newline>m`). Comments, here-documents,
  `$'…'`, redirections glued to words (`x>/f`, `2>&1>/f`, `{fd}>`) and function definitions are
  read as Bash reads them, so a hidden subcommand meets the rules; a line that defines a function is
  never read-only. In `acceptEdits`, a `sed` script that writes, runs or reads other files and
  `mv`/`cp -t DIR` are no longer auto-approved; `which` stays read-only only with `-a`. `decide`
  now checks the files a Bash line reads and writes (`bashFileTargets`, with `ls`, `find`, `du`)
  against the `Read` and `Edit` rules. `~/` in a tool path expands to the home directory, Windows
  paths compare without case and trailing dots or spaces, a Glob with an absolute or `~` pattern is
  checked at its directory, and `readsNetworkPath` also checks resolved forms (`../../net/x`,
  `/net/./x`). No public name changed.
- `withTurn({ cwd })` in the session's own `cwd` keeps the session's skill folders; a turn in
  another `cwd` must call `reloadSkills` (or `moveTo` to move the session).
- Plain data: bytes (an ArrayBuffer view) are a leaf, not walked as a container.
- A token estimate counts code points, so a character outside the BMP counts once.
- An output redirect to a file in the working directories asks in default mode, even under a `Bash`
  allow rule, unless an `Edit` rule allows the file; `acceptEdits` accepts it as an edit there. An
  input redirect in scope keeps a command read-only, and `mkdir d > log` is an `acceptEdits` command.
- `node -v`, `node --version`, `python --version` and `python3 --version` are read-only.
- Security: a Bash rule matches a command whose name is quoted or escaped. A `deny` rule
  `Bash(rm *)` no longer lets `"rm" -rf x`, `'rm'`, `r"m"` or `\rm` through, a critical removal
  (`"rm" -rf /`) asks in `bypassPermissions`, and `Bash(watch *)` no longer approves `"watch" rm x`.
  An allow rule approves a quoted script path, as claude does (`"$ROOT/setup.sh" go`).
- `git diff`, `git log` and `git show` with `--output` are no longer read-only commands: they write a
  file. `git branch` with only listing flags (`--show-current`, `-a`, `-v`, …) is read-only.
- `parseRule` reads `Task(...)` as `Agent(...)`, as sub-agents.md says the renamed tool still works.
- A `PermissionRequest` deny keeps its `interrupt` through the dispatch.
- Host: `SkillsReload.plugins` leaves out skills-directory plugins while `strictPluginOnlyCustomization`,
  `strictKnownMarketplaces` or `blockedMarketplaces` stop them; reads of the folders (`reloadSkills`,
  `touchFile`, `addDirectory`, `moveTo`) run one after another, so a touched file's skills are no longer
  overwritten by a reload that was reading at the same time.
- Permissions (review of the settings keys and the session): `autoMode.classifyAllShell` now acts, as
  `DecideContext.classifyAllShell` (filled by `startPermissions`) that suspends every Bash and PowerShell
  allow rule in auto mode; an enforced mod can no longer lift a default-mode prompt that a permission
  callback would be asked about; `approvalMemory(tool, { rulesLocked })` and the new `savedApproval` hide
  the always-allow choices under `allowManagedPermissionRulesOnly` and name the file a rule is saved to;
  `startPermissions` takes `interactive` for hosts with their own approval interface and returns `notices`
  (the HIPAA terminal notice, verbatim); judgments recorded for the fail-closed block flags, the
  unmodelled `Artifact` read in bypass mode and the first-time `auto` notice; `mergePermissionBlocks`
  builds its blocks without a type assertion; weak or echoing tests were rewritten and lint warnings in
  the new tests fixed.
- Host: an update path. `host.update({ plugins?, settings?, parentSettings?, userConfig? })` replaces
  those parts, re-runs the pure `createHostState` over the merged options (`mergeHostOptions`) and
  returns the new `{ plugins, issues }`; `host.plugins` and `host.issues` are live getters and
  `host.generation` counts the updates. Sessions and their `withTurn` and `runScoped` views read a
  `HostStateCell` at each use instead of a state captured at open: the plugin and settings hooks are
  rebuilt, the skill, agent and session hooks stay unless their plugin no longer runs or the new
  plugin-only lock silences them (`pluginOnlyAllows`, exported by the hooks module), the gates, skill
  list, policies and catalogs are read per call, the skill-hook limit ledger is summed again from the
  survivors, consumed `once` keys stay consumed and the dynamic watch list is kept. `readCatalog`
  caches by `Plugin` identity, so an unchanged plugin is not read again.
- Host: model limits and message expansion. `SessionOptions.limits` and `TurnOptions.limits`
  (`SessionLimits`: model allowlist, `maxEffort`, `supportedEfforts`) reach `session.expandSkill`,
  so `Expansion.turn` carries the allowlisted model and the capped effort. `session.expandMessage`
  reads the mentions of a typed message (`stackableOf` over the catalog, the turn's interactivity)
  and expands the direct and stacked skills in order with the shared arguments; named mentions come
  back as `permitted`, and `expandSkill` takes `permittedByMention` for the model's call.
- Host: scoped hooks, `hasHooks`, the watch list and background deliveries. `session.addHooks(prefix,
  hooks, source, options?)` and `removeHooks(prefix)` register hooks of a run, an agent or a skill
  (replacing by prefix, never stacking; the handle's `remove()`); `lifetime: 'turn'` ends when
  `session.runScoped(turn, run)` settles. `session.hasHooks(event)` is true when a handler that
  passes the gates would run. `session.fileChangedWatchList()` joins the matchers' literal names with
  the `watchPaths` of SessionStart, CwdChanged and FileChanged outputs (replaced by each, `[]` clears
  it). `session.takeBackground()` and the pure `settleDeliveries` turn `HookOutcome.background` into
  `{ additionalContext, systemMessages, wake? }`, a wake surfaced apart for `asyncRewake` exit 2.
  `mergeWatchPaths` and `hasRunnableHandler` belong to the hooks module.
- Host: review fixes of the update path. `host.update` builds the next state before it replaces the
  merged options, so a state that throws leaves the host as it was; `mergeHostOptions` merges each
  part by key and keeps its types; `HostedPlugin` moves to `src/host/types.ts`. Tests now cover
  `parentSettings`, `userConfig` replacing every plugin's saved values and an update that lands during
  an in-flight `dispatch`.
- Host: review fixes of model limits. A stray `sed -i` backup of the skill-limits test is removed, the
  T2 layout check now fails on any file under `tests/` that is not a `.ts` file, and the skill hook
  registration closure declares its return type instead of casting `[]`.
- Host: review fixes of scoped hooks. `session.onBackground(listener)` tells an idle host of each
  background delivery, an `asyncRewake` exit 2 wake included, without polling. A view kept past
  `runScoped` now refuses `lifetime: 'turn'` registrations instead of leaking them for the session.
  The judgments say the host drains the background queue and owns the async `SessionStart` repeat
  check; tests cover the stdout wake fallback and a typed hooks literal replaces `JSON.parse`.
- Host: review fixes of `withTurn`. The session core no longer carries an unused watch-list slot
  (it returns with `fileChangedWatchList` support, with a test). Tests now prove that a turn cannot
  change `trusted` (settings hooks stay held back or released as the session says), that a turn's
  `scratchpadDir` replaces the session's in the hook input, and that a turn's `interactive` decides
  whether a forked skill waits; the step on a turn's `additionalDirectories` is dropped because an
  `if` path rule never reads them.
- The tool catalog (`TOOL_CATALOG`, `isKnownTool`, `KNOWN_TOOLS`, `toolRequiresPermission`): the
  "Permission required" column and the rule format of each of the 46 documented tools, now the
  source of `ruleFormatOf`; `availableTools` (bare deny rules and globs remove a tool, the
  `EndConversation` exception, Glob and Grep absent by default on posix) and `resolveSubagentTools`
  (`tools`, `disallowedTools`, the filters of the tools available to subagents, the zero-tools
  refusal as an issue).
- Tool inputs (`rules/tools/inputs`): `parseToolInput` reads a hook's `tool_input` against the
  hooks.md table of its tool (Bash, PowerShell, Write, Edit, Read, Glob, Grep, WebFetch, WebSearch,
  Agent, AskUserQuestion, ExitPlanMode) and reports a wrong type or a missing required field as an
  issue at `tool_input.<field>`; `TOOL_INPUT_FIELDS` gives each field its type, optionality, role
  (primary, subject, param, structured) and source (SDK or docs only), and the roles now decide
  which parameter rules are ignored; `answerQuestions` answers AskUserQuestion for `updatedInput`
  (labels joined with commas); `effectiveExitPlanModeInput` drops the ignored `allowedPrompts`;
  `effectiveSearchMode` (an absent `mode` is the full search); `expandToolPath` and
  `expandToolInputPath` give `Write`, `Edit` and `Read` the absolute `file_path` a hook receives
  (backslashes on Windows).
- Tool semantics (`rules/tools/semantics`): pure functions for the behaviour tools-reference.md
  states exactly. `applyEdit` (exact replacement, one occurrence unless `replace_all`, `$&` kept
  literal, refusals as issues), `editEncodingIssue` and `writeEncodingIssue` (the non-UTF-8 and
  `U+FFFD` guards, the documented message verbatim), `effectiveBashTimeout` (120000 default, 600000
  ceiling, the larger of the two variables), `backgroundTimeLimit`, `bashOutputLimits` and
  `windowBashOutput` (30,000 inline, 10,000 for a failure, `bashOutputMaxChars`), `classifyBashExit`
  (exit 1 is valid only for `grep`, `rg`, `egrep`, `fgrep`, `find`, `diff`, `test`, `[`, `git diff`,
  `git grep`), `readWindow` (offset, limit, the empty-file and past-the-end notices),
  `checkWebFetchUrl` (localhost and dotless hosts refused with the documented message, `http`
  upgraded) and `sliceFetched` (100,000-character window, unread count, next offset),
  `validateWebSearchDomains` (the two lists cannot be combined), `effectiveGrepOutputMode` and
  `capGlobMatches` (100 files and a truncation flag).
- Tool responses (`rules/tools/responses`): `parseAgentResponse` reads the `tool_response` of an
  Agent call as the `completed` or `async_launched` member of a union typed from the SDK's
  `AgentOutput` (a launch exposes no usage fields, `modelsUsed` is set only after a swap and its
  repeats are collapsed, `resolvedModel` may differ from the request). `parseBashEditDiff` reads
  `tool_response.bashEditDiff` (at most 200 `changedFiles`, at most 5 `files`, `moreFiles`,
  `unavailable`, `skipped`, `shared`) with warnings for broken limits, and `bashEditDiffTrust` says
  whether a list is complete and attributable.
- Tool responses: `parseAgentResponse` keeps `modelsUsed` as received instead of collapsing repeats
  and dropping short lists; `parseBashEditDiff` no longer warns on a file marked both created and
  deleted, and accepts a `hunks` of any shape. Agent tests now cover non-text content blocks and each
  launch field, and the two judgments moved out of `spec()`.
- Tool semantics: the limits tools-reference.md states are decided by pure functions instead of
  only the empty-file and default cases. Read: `classifyReadTarget` (binary extensions, images over
  128 MB, notebooks over 100 MB), `classifyReadSize` and `readTokenLimit` (256 KB whole-file
  refusal, 25,000 tokens or `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`, `PARTIAL view`, `allow_large`).
  Glob: `validateGlobInput` (null byte) and `globRespectsIgnore`. Grep: `windowGrepContent`
  (`No entries at this offset`), `windowGrepCounts` and `totalGrepCount`, `effectiveGrepMultiline`,
  with `GREP_OUTPUT_MODES` declared once in `rules/tools/inputs`. Bash: `shouldMoveToBackground`
  and the moved, cwd and stop notices, `BASH_DEFAULT_TIMEOUT_MS` for a moved command, and
  `classifyPowerShellExit` (`findstr`); `! grep` at exit 1 is now a failure and the `!`, assignment,
  `&` and subshell cases are recorded as judgments. WebSearch: `webSearchLimits` and
  `webSearchAllowance`. WebFetch: `webFetchTimings` and `redirectNotice`. The Edit tests assert
  which refusal (not found or found N times) they expect.
- Tool inputs: the optionality of Bash and PowerShell `run_in_background`, Edit `replace_all` and
  Grep `-i` and `multiline` (the tables mark none optional) is recorded as a judgment and tested
  outside the spec; `answerQuestions` derives its input type from the SDK's `AskUserQuestionInput`
  (`multiSelect` stays optional, as hooks.md says); WebSearch domain lists reject non-string
  elements at `tool_input.<field>.<index>` and ExitPlanMode `allowedPrompts` must be an array,
  both recorded as judgments.
- Permission modes: the dead `classifier` trait is dropped from `PERMISSION_MODE_TRAITS` and its
  tautology test with it; `BaselineDecision` derives from the SDK's `PermissionBehavior`;
  `SubagentPermissionInput.set` takes `string` (raw host text that is no mode counts as unset);
  `spec/judgments.md` records the host-owned subagent classifier review, read-only Bash as a
  `read` and the `dontAsk` always-deny cases.
- Permission rules: `Agent(acme:reviewer)` and `Skill(deploy:deploy)` deny rules are names, not
  parameter rules on a field called `acme` or `deploy`; only the fields of the SDK's `AgentInput`
  (and `skill`) read `name:value` as a parameter.
- Bash rules: a here-string (`<<< 'x'`) no longer opens a quoted here-document that hid the lines
  after it from deny and allow rules; a hook `if` that names Bash now runs for a Monitor call (the
  hook gets the Monitor input), and a Monitor rule still does not run for a Bash call; `if` finds
  `$()`, backticks and `$VAR` with the quote-aware scanner, so an apostrophe inside double quotes
  no longer hides one; an unreadable `if` is reported at `hooks.if`; the command field is tied to
  the SDK's `BashInput` and `MonitorInput`.
- Permission rules: an `mcp__` rule with parentheses is skipped only when it comes from a settings
  file, so a deny rule from the command line or the session matches an MCP tool parameter;
  `RuleSource` gains `managed` and `embedder-managed`; a `Skill(skill:<name>)` deny rule matches
  every name the host reports in `PreparedCall.skillNames`; the primary content field is per tool
  (`url` is only `WebFetch`'s); the default matchers fail closed for deny and ask rules; the
  matches-no-tool warning repeats the rule as written (`PermissionRule.text`); the command tools'
  parameter names are checked against the SDK input types.
- Tool availability: `--tools ""` removes `EndConversation` when no MCP tool remains, the `default`
  entry of `--tools` means the default set, `--restricted` removes `PowerShell`, `Monitor` and
  `WebFetch` as well as `Bash` unless `--tools` names them, a Bash deny rule turns `PowerShell` off
  on Windows with Git Bash (`gitBash`, `powerShellOptIn`), and
  `blockWritesOutsideWorkingDirectories` removes the worktree tools; a subagent whose `tools` glob
  covers `Bash` no longer gets `Glob` and `Grep` back; the catalog test no longer reads the removed
  tools from production data.
- Path rules: an `Edit` rule now covers the legacy `MultiEdit` (and a `Read` deny rule blocks it),
  while `MultiEdit(docs/**)` is accepted and never matches; a `Read` deny or ask rule reaches every
  LSP call and no `!` carve-out reopens one; `Read(./.env)` names the `.env` of the current directory
  only, not one at any depth; a file named `..hidden` is matched by a rule instead of being taken for
  a parent climb; `Read(src/**/*.ts)` as a deny or ask rule reaches a nested `src`; a `/` rule with
  no usable text guards its anchor, not the filesystem root.
- Permission rules: a deny or ask `WebFetch(domain:...)` rule now applies to an artifact read (an
  `Artifact` call with `action: read`) when it covers `claude.ai` or `*.claudeusercontent.com`,
  while a bare `WebFetch` rule and an allow rule do not; an `Agent(general-purpose)` deny or ask
  rule now covers a call that leaves `subagent_type` out, and `Agent(fork)` names a fork; a
  `domain:` rule with non-ASCII labels (`bücher.de`) matches the punycode host; the Cowork twin
  and the Agent, Skill and WebFetch matchers read behaviour and specifier form through a registry
  and a named guard, and their input fields are tied to the SDK's `AgentInput`, `WebFetchInput`
  and `ArtifactInput`.
- Permission modes (`rules/decide`), review fixes: a double-quoted `sh -c` script (also after
  `find -exec`) is read after the invoking shell expands it, a single-quoted one binds `$1` only
  when an argument follows; `cd logs && rm -rf a/*`, a backslash-only target, a volume-GUID path,
  the `\\?\C:\`, `\\localhost\C$` and 8.3 home spellings are critical paths; a command that does
  not parse gets the critical-path outcome in every mode. `ps`, `file` and `docker` join the
  read-only set with their documented prompt cases, a UNC argument on Windows and a write to a
  special shell variable (`for IFS in`, `unset PATH`) prompt. Under
  `blockReadsOutsideWorkingDirectories` a Bash command that reads outside the working directories,
  or that the parser cannot trace, prompts in every mode; under `blockWritesOutsideWorkingDirectories`
  settings files are refused inside the working directories too and plan files, the scratchpad and
  auto-memory Markdown stay writable. `--restricted` makes a classified protected-path write ask,
  the target of a symlinked settings file is its own option and asks in auto and plan, `dev-mods` and
  `CLAUDE_CONFIG_DIR` are protected, Bash `rm`, `mv` and `cp` go through the symlink check, and
  `acceptEdits` approves `Set-Content`, `Add-Content`, `Clear-Content` and `Remove-Item` in scope.
  `HookPermissionDecision` is re-exported from the SDK, and hook decisions and rule behaviors are
  read through registries.
- Permission modes (`rules/decide`): `decide(call, context)` answers allow, ask, deny or classify
  for one call in `default`, `acceptEdits`, `plan`, `auto`, `dontAsk` and `bypassPermissions`: deny,
  then ask, then allow with a compound Bash command allowed subcommand by subcommand, a PreToolUse
  hook's block, deny, ask and allow, a mod's block and approval (with managed settings or a Team or
  Enterprise login a mod cannot undo a deny rule, an ask rule or a hook's block), the read-only
  command set, `acceptEdits` filesystem commands in scope, protected paths and their exceptions per
  mode, critical-path `rm` and `rmdir` removals per mode, network-path reads, tools that require user
  interaction, `permissions.block{Reads,Writes}OutsideWorkingDirectories`, plan mode's bypass and
  auto-during-plan cases, and the broad allow rules auto mode drops. The `PermissionClassifier` port
  and `settleClassification` carry a `classify` decision to the host's reviewer.

#### cli

- CLI session flags: what an `--add-dir` directory loads is derived from the whole plan, so
  `--safe-mode`, `--disable-slash-commands`, `--setting-sources` without `project` (and `--restricted`)
  remove what they remove from it too, `--bare` keeps only skills, and `CLAUDE.local.md` is its own
  kind that needs `local` (`addDirLoads` takes `skipped` and `settingScopes`); `--agents` validation is
  skipped by `CLAUDE_CODE_SAFE_MODE=1` and, for an inline value, by `--resume` and `--continue`
  (`FlagFacts.resume`, `continuing`); `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT=1` forwards subagent text; a
  `--mcp-config` value holds space-separated files; `--bare` reports `readsStoredCredentials: false`;
  `--agent` overrides the `agent` setting in the plan (`FlagFacts.agentSetting`). A `fields` key named
  `command`, `outcome` or `message` no longer replaces the result's own, and `marketplace add` and
  `remove` match the reserved name the same way. The `--bare`, `--add-dir`, `--agent`,
  `--forward-subagent-text`, owner/repo and Windows path tests assert the plan, the failure codes
  of marketplace update and remove are judgments outside `spec(...)`, and the shared JSON, word and
  record helpers replace three copies.

#### repository

- Integrate all eight second-wave streams without discarding the oracle fixtures or their naming
  and credential rules. Preserve scanned skills, agents and environment files across compatible
  turn views while applying host updates immediately.
- The spec gate preserves apostrophes and quoted words inside requirement IDs, and checks static template literals too.
- Corpus: the loading comparison leaves out what `plugin details` does not list (nested agents
  and commands, single files a manifest path names, inline commands), which a runtime session
  still loads.
- Tests: the troubleshooting tests name the budget, the per-entry cap and the host-supplied plugin root
  they exercise; judgments of the folder scan (dot-folders, `taken`, exact local names, bare plugin names,
  `additionalDirectories`, the main checkout's commands) and every class of refused name have their own
  tests.
- Spec: the committed snapshot of the mods reference tables (`spec/docs-tables.json`) keeps only a
  short label and the amounts of each row of the Limits table, not the page's sentences, so the
  repository holds facts and identifiers only.
- The layer check now rejects `Date`, timers, `fetch`, `crypto`, `performance` and `globalThis` in
  `src/`, as the docs state.

### Performance

Counted by the deterministic benchmarks (`bun run bench:update`, docs/TESTING.md, "Benchmarks");
every result is the same.

#### format

- `validatePlugin` reads `hooks/hooks.json` and `.mcp.json` once instead of twice (once for the
  byte order mark, once for the text): a plugin of 16 of each component reads 7,957 bytes instead of
  11,023 and 49 files instead of 51.
- One load asks the host's port for the `stat` or `exists` of a path once: repeated port calls on the
  community corpus fell from 4.2% to 0.1% of all calls (69,148 instead of 72,130), with the same result.
- `parseFrontmatter` reads a file line by line up to the closing `---` instead of splitting the whole
  file: 44% faster on the 67,907 Markdown files of claude-plugins-community, same result on each.

#### hooks

- A hook's `matcher` is read once per matcher text (an exact list or a compiled pattern) instead of
  at every dispatch: twenty `PreToolUse` dispatches over 16 plugins run no regular expression where
  each one ran 96 matches.

#### skills

- The `${VAR}` substitution of a skill compiles its pattern once per list of names, not once per
  expansion.
- A skill with no `description` reads its first non-empty line without splitting the whole body:
  building a host over one such skill of 256 lines runs 29 regular-expression matches instead of
  7,708, and the whole corpus host 3.9 million instead of 6.1 million.

#### agents

- With no plugin workflow to list, a session no longer takes a snapshot of its environment to decide
  whether the workflow commands are on: `session.skills()` asked again takes none instead of 2, and
  `expandSkill` 3 instead of 5.

#### host

- A folder scan of a session (`reloadSkills`, `reloadAgents`) and a session's own decide context
  read `CLAUDE_CONFIG_DIR`: one more `environment.get` and `environment.snapshot` each (the settings
  `env` over the port), and the decide context one `locations.joinPath` for the protected
  configuration directory (the `expandSkill` and `folders.skills` baselines, every size). A cost
  added for a documented behaviour, not a regression.

### Removed

#### format

- **BREAKING** `LOCAL_TRUST`, `LocalTrust`, `WorkspaceTrustState` → `TrustSituation`; `headersHelperEnvironment`, `helperVariables` → `planHeadersHelper`. `LOCAL_TRUST`, `LocalTrust` and `WorkspaceTrustState` (use `TrustSituation`),
  `headersHelperEnvironment` and `helperVariables` (use `planHeadersHelper`).
- **BREAKING** (on paper) 1 internal helper `./elicitation` exported → not exported: `ELICITATION_URL_ARGUMENT_CAP`. No host or example imported it; it is used only inside the kit (docs/api/ lists what stays).
- **BREAKING** (on paper) 42 internal helpers `./format` exported → not exported: `agentFileName`, `agentNameProblem`, `blocksLoading`, `BundledSkillRead`, `DEFAULT_THEME_BASE`, `DEFAULT_TYPES_PATH`, `defaultFolderIgnored`, `firstContentLine`, `formatThemeColor`, `HOOKS_MODULE_EXTENSIONS`, `IntegerBounds`, `InvocableRead`, `isRemoteMcpServer`, `ListOptions`, `MCP_DEFAULT_MAX_OUTPUT_TOKENS`, `MCP_JSON_LIMIT_BYTES`, `MCP_MESSAGE_BYTES`, `MCP_OUTPUT_WARNING_TOKENS`, `MCP_TEXT_PERSIST_CHARS`, `MCPB_CACHE_DIR`, `MCPB_OPTION_TYPES`, `McpbOptionType`, `NOT_A_TABLE`, `NOT_EXPANDED_TOWARD_REMOTE`, `ORIGIN_TRAITS`, `OriginTraits`, `pathEscapes`, `pathNotFound`, `readBundledSkill`, `readEnum`, `readFlag`, `readInteger`, `readInvocable`, `readList`, `readSkillFields`, `readTable`, `readThemeColor`, `sameMcpConfiguration`, `SkillOriginKind`, `themeFileText`, `TRAVERSAL`, `XTERM_ANSI_PALETTE`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).
- **BREAKING** (on paper) 18 internal helpers `./loading` exported → not exported: `BUNDLES_NOT_LOADED`, `HEADERS_HELPER_TIMEOUT_MS`, `isPluginVariable`, `isRepositorySupplied`, `LSP_DEFAULTS`, `MONITORS_NOT_LOADED`, `optionEnvironment`, `pluginVariableValue`, `PreparedSubstituter`, `prepareSubstituter`, `readsAsEmptyInRemoteMcp`, `removedFromHeadersHelper`, `shellExports`, `substituter`, `surfacePolicy`, `userConfigText`, `userConfigValue`, `WORKTREE_NOTE`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).

#### settings

- **BREAKING** `mergeSettingsHooks` → `createPolicyView(layers).get('hooks')`; `HookLocks`, `MERGE_KINDS`, `REPAIR_KINDS`, `SCOPE_RULES` and the rest → gone. `mergeSettingsHooks` (read `createPolicyView(layers).get('hooks') ?? {}`), `HookLocks`,
  `MERGE_KINDS`, `REPAIR_KINDS`, `SCOPE_RULES`, `REQUEST_ID_ALPHABET`, `LEGACY_WINDOWS_PATH`,
  `TRUST_MESSAGE_JOINER` and `composeEnvironments`. The merge kind `anyFalse` and the scope rule
  `userFlagOrManaged` are gone.
- **BREAKING** `IGNORED_REASONS`, `IGNORE_REASONS`, `IgnoredEnvReason`, `IgnoredVariable`, `envIgnored` → `NotAppliedVariable`, `ignoredBecause`. `IGNORED_REASONS`, `IGNORE_REASONS`, `IgnoredEnvReason`, `IgnoredVariable` (use
  `NotAppliedVariable`) and `envIgnored` (use `ignoredBecause(...) !== undefined`).
- **BREAKING** (on paper) 66 internal helpers `./settings` exported → not exported: `AGENT_VIEW_ENV`, `agentsMdIdForms`, `appliesAtStartup`, `BUNDLED_SKILLS_ENV`, `BYPASS_AS_ROOT`, `BYPASS_IGNORED_NOTICE`, `BypassAcceptance`, `bypassAcceptance`, `CHROME_BLOCKED_ERROR`, `CHROME_SERVER_NAME`, `CONTROL_KEYS`, `createCommandGates`, `createHttpHookPolicy`, `DEFAULT_MAX_CONCURRENT_SUBAGENTS`, `DEFAULT_PLUGIN_GIT_TIMEOUT_MS`, `deliversPolicyKey`, `elide`, `EXCLUSIVE_ADD_ERROR`, `FileShape`, `guardIdForms`, `HELPER_DEFAULT_TIMEOUT_MS`, `HELPER_MIN_REFRESH_MS`, `HELPER_MIN_TIMEOUT_MS`, `HELPER_OUTPUT_CAP_BYTES`, `HIPAA_AUTO_NOTICE`, `hookSessionGates`, `HookSessionGates`, `IdForms`, `inputPreview`, `isGuardPluginId`, `isListed`, `LOGIN_KEYS`, `LoginKey`, `MANAGED_MCP_FILE_PATHS`, `MANAGED_SIDELOAD_FLAGS`, `managedSourceLoaded`, `maskCredentials`, `MCP_ADD_REFUSAL`, `MCP_CONFIG_EXIT`, `mergeDropIns`, `OFFICIAL_MARKETPLACE`, `orderedLayers`, `ParsedPluginId`, `parseLauncher`, `parsePluginId`, `parseTheme`, `pluginDefaultsOf`, `PROCESS_WRAPPER_ENV`, `readManagedDocuments`, `REGISTRY_VALUE`, `relayDescription`, `sanitizeRelayText`, `SCOPE_RANK`, `SettingWithDefault`, `shellDisabled`, `SideloadFlag`, `SkillOverrideState`, `spellingsOf`, `STRICT_MCP_CONFIG_EXIT`, `SUBPROCESS_ONLY`, `turnsTelemetryOff`, `UnreadableVerdict`, `unreadableVerdict`, `valueWithPluginDefaults`, `verdictIssue`, `WORKFLOWS_ENV`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).

#### hooks

- **BREAKING** (on paper) 27 internal helpers `./hooks` exported → not exported: `AGENT_HOOK_TOOLS`, `CLASSIFIER_CAP`, `DEFAULT_STOP_BLOCK_CAP`, `envFileClearedBy`, `factSchemaOf`, `HandlerEntry`, `HANDLERS`, `HookDeclaration`, `interruptPlan`, `InterruptPlan`, `isUnrecordedCall`, `lastPathLine`, `limitOutputs`, `MAX_MODEL_HOOKS_AT_ONCE`, `NOT_PLAIN_ASSIGNMENTS`, `OK_FALSE_RULES`, `ORIGINAL_PROMPT`, `permissionUpdateSchema`, `pluginOnlyAllows`, `PREVIEW_LENGTH`, `registerHooks`, `shellHasEnvFile`, `stopBlockCap`, `SUSPECT_CAPTURE`, `TEXT_CAP`, `withOriginalPrompt`, `worktreeCandidate`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).

#### skills

- **BREAKING** `stackableOf`, `preloadAgentSkills`, the agents `PreloadedSkills`, `AgentScanRequest`, `AgentFolderContext` → `stackSkills`, `session.preloadSkills`. `stackableOf` (use `stackSkills` over a `skillLookup`), `preloadAgentSkills` and the
  agents `PreloadedSkills` (use `session.preloadSkills(definition, { signal })`),
  `AgentScanRequest` and `AgentFolderContext`.
- **BREAKING** (on paper) 11 internal helpers `./skills` exported → not exported: `AGENT_SKILLS_FIELDS`, `commandEntryGrants`, `isStrictlyBelow`, `NO_HOOKS_YET`, `OVERRIDE_STATES`, `overrideState`, `REATTACH_TOKENS_PER_SKILL`, `REATTACH_TOKENS_TOTAL`, `scanScope`, `SKILL_HOOK_LIMITS`, `skillPathIn`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).

#### agents

- **BREAKING** (on paper) 23 internal helpers `./agents` exported → not exported: `AGENT_SCOPE_RULES`, `AgentFolder`, `AGENTS_FOLDER`, `AgentScopeRule`, `BUILTIN_AGENT_NAMES`, `BUILTIN_PRIORITY`, `BuiltinAgentName`, `DEFAULT_CONCURRENCY`, `DEFAULT_SPAWN_DEPTH`, `DEFAULT_STALL_MS`, `DEFAULT_STRUCTURED_OUTPUT_ATTEMPTS`, `HANDBACK_DENIALS_TOLD`, `isBuiltinAgent`, `MAX_AGENTS_PER_RUN`, `MAX_ATTEMPTS`, `MAX_FAN_OUT_ITEMS`, `MAX_RESTARTS`, `MAX_USAGE_WAITS`, `PermissionModeInput`, `REPLAY_START`, `STALL_ENV`, `STRUCTURED_OUTPUT_ENV`, `trustKeyOf`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).

#### marketplace

- **BREAKING** `computePluginVersion`, `sourceFactsOf`, `archiveFacts`, `versionCacheSegment` and their types → `resolvePluginVersion(input, sha256)`. `computePluginVersion`, `sourceFactsOf`, `archiveFacts`, `versionCacheSegment`,
  `SourceFacts`, `KnownFacts`, `PluginVersionInput` and `RepositoryRoot`. Call
  `resolvePluginVersion(input, sha256)` and pass the archive's `archiveDigest`; `usableVersion` is
  the folder-name rule.
- **BREAKING** `planInstalledUninstall`, `planInstalledPrune` and their types → `winningScope`, `effectiveEnabled`, `isEnabled` and the `./cli` plans. The installed-graph planners `planInstalledUninstall` and `planInstalledPrune`, with
  `PluginNode`, `DisablePlan`, `EnableOverride` and `InstalledGraph*Plan`. Use `winningScope`,
  `effectiveEnabled` and `isEnabled` over `GraphFacts`, and the `./cli` plans.
- **BREAKING** `marketplaceTabUpdate`, `planMarketplaceRemoval` → `planUpdate({ kind: 'marketplace-tab' })`, `planMarketplaceRemove`. `marketplaceTabUpdate` and `planMarketplaceRemoval` with `MarketplaceTabPlugin`,
  `MarketplaceRemovalFacts` and `MarketplaceRemovalPlan`. The tab's update is
  `planUpdate({ kind: 'marketplace-tab', marketplace })`; removal is `planMarketplaceRemove` of
  `./cli`. `CliMarketplaceUpdatePlan` is `MarketplaceUpdatePlan`.
- **BREAKING** `FailureCause` → `NodeDepsFailureCause` (marketplace) and `WorkflowFailureCause` (agents). `FailureCause`, which `./marketplace` and `./agents` both exported under one name for two types,
  is renamed: the marketplace's dependency check cause is `NodeDepsFailureCause` and the agents'
  workflow cause is `WorkflowFailureCause`.
- **BREAKING** (on paper) 47 internal helpers `./marketplace` exported → not exported: `ADD_OFFICIAL`, `commandHosts`, `commandName`, `cwdMatches`, `DeclaredSourceFacts`, `declaredSourceMismatch`, `declaredSourceRefusal`, `DEPRECATED_MARKETPLACE`, `DIRECTORY_LISTING_FIELDS`, `FIRST_PASS_MAX_DELAY_MS`, `globMatches`, `HINT_PROMPT_LIMIT`, `hookConflictNotes`, `idPartRefusal`, `INSTALL_SCOPES`, `INSTALLED_PLUGINS_VERSION`, `isOfficialButOff`, `isWritableScope`, `listNote`, `MANIFEST_SIZE_LIMIT`, `MARKETPLACE_KEYS`, `MAX_POINTER_BYTES`, `METADATA_KEYS`, `NameCandidate`, `nameHolder`, `NameVerdict`, `NO_PROMPT_ENVIRONMENT`, `NOT_A_LINK`, `NOT_REFRESHED`, `NOTICE_TOTAL_LIMIT`, `OFFICIAL_BUT_OFF`, `OFFICIAL_MARKETPLACE_ADD`, `officialInstallCommand`, `PLUGIN_ACTIVE`, `PluginOrigin`, `PLUGINS_CHANGED`, `PluginSourceOf`, `rebuiltNote`, `REFRESH_WINDOW_MS`, `RELOAD_TO_APPLY`, `resolveNameConflict`, `sessionDirectoryIssue`, `SESSIONS_BETWEEN_SUGGESTIONS`, `setAsideNote`, `shorthandTransport`, `showsContextCost`, `supportedHint`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).

#### mods

- **BREAKING** `createEventRules`, `withApiRules`, `withUiRules`, `withRegisterRules`, `apiEventRules`, `EventRules`, `eventResultProblem` → gone. `createEventRules`, `withApiRules`, `withUiRules`, `withRegisterRules`, `apiEventRules`,
  `EventRules` and `eventResultProblem` (see Changed). `eventInputProblem` stays.
- **BREAKING** the `./mods` re-exports `prefixWithinBytes`, `toJsonValue`, `runEach`, `walkPlainData`, `PlainDataStats` → gone. The `./mods` re-exports `prefixWithinBytes`, `toJsonValue`, `runEach`, `walkPlainData` and
  `PlainDataStats`.
- **BREAKING** (on paper) 43 internal helpers `./mods` exported → not exported: `BAND_FORBIDDEN_PROPS`, `bandProblem`, `buttonKey`, `callLabel`, `clientFailureLine`, `clipText`, `clipVscodeStatus`, `clipVscodeToast`, `countsAsOrganizations`, `createElementTables`, `createInvalidator`, `createScope`, `declaredState`, `drawnNode`, `drawnProps`, `faultReason`, `GUARD_CANDIDATE`, `guardLoads`, `hookLabel`, `isGuardId`, `isSpacingStep`, `logLine`, `maxPaneColumns`, `measureTree`, `NAMED_KEYS`, `NamedKey`, `nestingMessage`, `nestingProblem`, `NO_MESSAGE`, `openGate`, `OPTIONS_DO_NOT_FIT`, `parseToast`, `pluginDirsOf`, `REGISTER_EVENT`, `RegisterEvent`, `resolveTables`, `scanLines`, `statusLine`, `THEME_CLEARED`, `TOAST_TIMEOUT_PROBLEM`, `toolFullName`, `TreeSize`, `UNANSWERED_LIMIT`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).
- **BREAKING** (on paper) 10 internal helpers `./mods/elements` exported → not exported: `buttonKey`, `clientFailureLine`, `clipText`, `drawnNode`, `drawnProps`, `faultReason`, `isSpacingStep`, `measureTree`, `NO_MESSAGE`, `TreeSize`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).
- **BREAKING** (on paper) 10 internal helpers `./mods/isolate` exported → not exported: `buttonKey`, `clientFailureLine`, `clipText`, `drawnNode`, `drawnProps`, `faultReason`, `isSpacingStep`, `measureTree`, `NO_MESSAGE`, `TreeSize`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).

#### host

- **BREAKING** (on paper) 1 internal helper the root exported → not exported: `blocksLoading`. No host or example imported it; it is used only inside the kit (docs/api/ lists what stays).
- **BREAKING** (on paper) 13 internal helpers `./rules` exported → not exported: `APPROVAL_MEMORY`, `CHANGED_INPUT_DENIAL`, `FETCH_WINDOW_CHARACTERS`, `GLOB_RESULT_CAP`, `InputToolName`, `LOCAL_HOST_MESSAGE`, `MAX_CHANGED_FILES`, `MAX_DIFFED_FILES`, `NO_ENTRIES_AT_OFFSET`, `PROMPT_DENIALS`, `TOOL_TYPES`, `ToolType`, `toolTypeOf`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).

#### cli

- **BREAKING** `planCliInstall`, `planCliEnable`, `planCliDisable`, `planCliMarketplaceUpdate` → the plain names of `./cli`. `planCliInstall`, `planCliEnable`, `planCliDisable` and `planCliMarketplaceUpdate`: import
  `planInstall`, `planEnable`, `planDisable` and `planMarketplaceUpdate` from `./cli`.
- **BREAKING** (on paper) 33 internal helpers `./cli` exported → not exported: `ABORTED`, `ABORTED_NOT_RUN`, `availableJson`, `CliPluginRef`, `Contribution`, `convertText`, `DATA_PRESERVED`, `DEFAULT_MCP_TIMEOUT_MS`, `FlagContext`, `humanBytes`, `installedJson`, `knownKeys`, `listText`, `MANAGED_UNDER_SAFE_MODE`, `matchingIds`, `NAME_OR_ALL`, `nameOf`, `notAppliedLines`, `ONLY_DISPLAYED`, `parseConfigFlags`, `parsePluginRef`, `PROMPT`, `qualifiedCommands`, `readmeInstallsPlugin`, `RESERVED_QUIET_NAME`, `roundTokens`, `SAVE_FAILED`, `SAVED_MESSAGE`, `SETTINGS_FILE_LIMIT`, `sideloadMessage`, `ToggleCommand`, `validationVerdict`, `ValidationVerdict`. No host or example imported them; each is used only inside the kit (docs/api/ lists what stays).
