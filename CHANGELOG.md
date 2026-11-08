# Changelog

## [Unreleased]

### Added

- The evidence pipeline: `docs:pull` mirrors the official Claude Code docs, `spec:extract` turns
  them into `spec/requirements.json`, and `compat` reports the share each test run proves.
- Official types re-exported from `@anthropic-ai/claude-agent-sdk`, with `HOOK_EVENTS` and
  `HOOK_HANDLER_TYPES` asserted equal to the SDK's unions.
- `readManifest` and `validateManifest` for `.claude-plugin/plugin.json`.
- The ports a host implements (`PluginFiles`, `CommandRunner`, `HttpClient`, `ModelRunner`,
  `McpCaller`, `Locations`, `Environment`, `Clock`, `ScratchFiles`), type-only, and in-memory fakes
  of each for tests.
- A frontmatter parser (`parseFrontmatter`) and the value coercions of skills, commands and
  agents (`readFlag`, `readText`, `readList`, `readTable`, `readEnum`).
- `readInteger` and a mode for `readList` (`separators`, `braces`), the frontmatter API exported
  from the package, `line` and `column` on a frontmatter problem, `HttpRequest.as` and
  `HttpResponse.bytes` for binary bodies, and symlinks and access recording in the `memoryFiles`
  fake.
- `EFFORT_LEVELS`, asserted equal to the SDK's `EffortLevel`, and the official `EffortLevel`,
  `SlashCommand` and `ResolvedSettingSource` types re-exported.
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
- `readHooksFile` and `readHooksSettings`: hook configuration read and validated as hooks.md
  describes (events, matcher groups, the five handler types and their fields), into the official
  `HooksSettings`; and `matchesMatcher`, the matcher grammar of hooks.md (match-all, exact list,
  unanchored regular expression, the narrower set of `FileChanged` and `StopFailure`).
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

### Fixed

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
- `readHooksFile` accepts a mod-only file (`modules` with no `hooks`), `readHooksSettings` keeps a
  JSON-parsed `__proto__` event as an own key, a matcher that does not compile is no longer
  warned about on an event without matcher support, and a non-finite `timeout` reports "expected a
  positive, finite number of seconds".
- `readFlag` no longer reads `constructor` or `__proto__` as a flag, and `readList` no longer splits
  a glob such as `src/**/*.{ts,tsx}` or a path with a space.
- Variable substitution: a remote MCP server now reads the documented credential variables
  (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `AWS_BEARER_TOKEN_BEDROCK`, `HTTPS_PROXY`,
  `NPM_TOKEN`) as empty in `url` and `headers`; `UserConfigValue` is derived from the SDK's
  `Settings`; `substituteDeep` returns `unknown` instead of an unchecked cast; the table "Where each
  variable resolves" is asserted row by row, and the path variables are checked against the port
  calls they make.
- The layer check now rejects `Date`, timers, `fetch`, `crypto`, `performance` and `globalThis` in
  `src/`, as the docs state.
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
