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

### Fixed

- Remote hook handlers: an `http` hook now honours the two settings allowlists through
  `RunContext.httpPolicy` (`allowedHttpHookUrls` skips a hook whose URL matches no `*` pattern, with a
  warning at `hooks.<Event>.url`; `httpHookAllowedEnvVars` narrows `allowedEnvVars` to the names on
  both lists); an `mcp_tool` hook returns `cancelled` when the session aborts while it waits for the
  server, instead of a "not connected" error, and with the optional `ports.clock` the wait and the
  call share one hook `timeout` (`timed-out` when the wait used it up); tests assert all 33 values
  of `WAITS_FOR_SERVER`, the exact appended prompt, malformed and reason-less replies for agent hooks
  too, and keep judgment tests out of the `spec(...)` blocks of other ids.
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
