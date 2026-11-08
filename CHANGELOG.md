# Changelog

## [Unreleased]

### Added

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

### Fixed

- Permission modes: the dead `classifier` trait is dropped from `PERMISSION_MODE_TRAITS` and its
  tautology test with it; `BaselineDecision` derives from the SDK's `PermissionBehavior`;
  `SubagentPermissionInput.set` takes `string` (raw host text that is no mode counts as unset);
  `spec/judgments.md` records the host-owned subagent classifier review, read-only Bash as a
  `read` and the `dontAsk` always-deny cases.
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
