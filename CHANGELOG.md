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

### Fixed

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
