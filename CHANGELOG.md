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
- Mods chain: a synchronous mods API call gives the hook's time budget back, so a hook's own
  10 s, 50 ms or 1 s limit still fires after one; `walkPlainData` measures a sub-structure
  reached twice at its deepest place, so a shared sub-tree can no longer slip past the 28,000-level
  limits; a hook whose `.catch` handler fails too is reported with the hook's own reason, as if it
  had no handler; the host passes `rewritten` and `lent` flags in `ReentryInfo` and the chain
  picks `next.error.cause` (`rewritten` wins); `plugin.name` and `plugin.root` are values and no
  longer events (`API_EVENT_NAMES`, `ApiEventName`); `register` no longer takes the `core` tier.
  The speculative ports `ModSurface`, `ModEnv`, `ModWatcher`, `ModTurnPort` are removed, and the
  mods name and limit tables are compared with the pulled reference.
