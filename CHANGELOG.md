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

### Fixed

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

### Fixed

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

### Fixed

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

### Fixed

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
- Mods chain: a synchronous mods API call gives the hook's time budget back, so a hook's own
  10 s, 50 ms or 1 s limit still fires after one; `walkPlainData` measures a sub-structure
  reached twice at its deepest place, so a shared sub-tree can no longer slip past the 28,000-level
  limits; a hook whose `.catch` handler fails too is reported with the hook's own reason, as if it
  had no handler; the host passes `rewritten` and `lent` flags in `ReentryInfo` and the chain
  picks `next.error.cause` (`rewritten` wins); `plugin.name` and `plugin.root` are values and no
  longer events (`API_EVENT_NAMES`, `ApiEventName`); `register` no longer takes the `core` tier.
  The speculative ports `ModSurface`, `ModEnv`, `ModWatcher`, `ModTurnPort` are removed, and the
  mods name and limit tables are compared with the pulled reference.
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
- Marketplace file and names (`marketplace`): `readMarketplace` and `validateMarketplace` read the
  top level of `marketplace.json` (`name`, `owner`, `plugins`, `$schema`, `description`, `version`,
  `metadata`, the removal and rename keys) as Claude Code loads it and as `claude plugin validate`
  reports it, hand each entry to an `EntryReader` alone, and report unknown keys; the reserved-name
  rules (`marketplaceNameIssues`: official, community and directory names with the
  `github.com/anthropics/` exemption, impersonation, another spelling, `inline`, `npm`, JavaScript
  member names, `claudeai-`, the download-folder clash); `effectiveDescription` and
  `effectiveVersion`.
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
