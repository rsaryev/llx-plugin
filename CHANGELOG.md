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
- Skill keys (`settings/skills`): `createSkillSettingsPolicy(view, context)` answers
  `skillOverrides` as `visibility(name, subject)` (the four states over what Claude sees, the `/`
  menu and the Remote Control and SDK command lists, the `skillOverrides` error for an `off` skill,
  plugin skills untouched, bundled-skill alias entries from managed settings and `--settings` files
  that can only restrict further), `disableBundledSkills` with `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`
  (neither undoes the other), `disableSkillShellExecution` as a per-origin verdict with the
  `[shell command execution disabled by policy]` replacement (a managed `true` is never overridden),
  and `syncClaudeAiSkills` as the same decision `syncClaudeAiPlugins` gives.
- Workflow keys (`settings/workflows`): `createWorkflowSettingsPolicy(view, context)` answers
  `disableWorkflows` and `enableWorkflows` as `enablement()` (off by `disableWorkflows` in any file,
  `CLAUDE_CODE_DISABLE_WORKFLOWS=1` or the organization's toggle, none undone by `enableWorkflows:
  true`; on by default except on Pro; what goes with workflows; the `/config` row),
  `workflowKeywordTriggerEnabled` as `keyword(prompt)` (the `ultracode` keyword triggers only in a
  prompt a person typed, never for `-p`, a scheduled task, an unstamped SDK prompt or a relayed
  event) and `workflowSizeGuideline` as `size()` (agent count advice, precedence over the `/config`
  choice, the `Large workflow` threshold).

### Fixed

- Settings, workflow keys: the decision no longer carries `inProgressRunsContinue`, a constant that
  described no run state (the duty to let a run finish is recorded as a host duty); the size
  decision returns `largeWorkflowThreshold` and the new `largeWorkflowTokens` (1.5 million) as
  `undefined` while the host says `ultracode` is on, as the docs say the `Large workflow` warning
  does not show then; tests table every prompt surface and every non-human SDK origin with its
  expected verdict and reason, and show that `workflowKeywordTriggerEnabled: false` leaves
  `/effort ultracode` and the workflow surfaces as they are.

- Settings, hook policy: `allowedHttpHookUrls` pattern `http://localhost:*` now also matches
  `http://localhost/x` (a wildcard port also stands for no port), as the docs example says; a
  `disableAllHooks: true` in the SDK's `managedSettings` is a lock that binds as
  `allowManagedHooksOnly: true` (an administrator's `false` no longer lifts it, plugin monitors and
  agent frontmatter follow it, command sources stay enabled), and a non-Boolean value there other than
  `false` and `"false"` binds the same way with a warning instead of being dropped; `monitorsRun`
  takes the plugin id and matches managed `enabledPlugins` on the whole `plugin@marketplace`; tests
  cover `--settings` and SDK-option hooks and `--add-dir` and synced frontmatter under the `hooks`
  lock, `disableCommandPluginSources: true` alone, and the managed origin under the HTTP allowlists.

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
- Settings, plugin keys: a `--add-dir` directory now ranks below user settings and only its `true`
  `enabledPlugins` entry counts (plugins/loading.md), so it neither turns a plugin off nor overrides
  another file; the built-in guard's `pluginConfigs` options are read from managed settings only;
  `modOrder` reports the organization's mods that no list names (`unlisted`); a `pluginConfigs`
  entry that is not an object is dropped with a warning instead of shadowing a lower file; the
  option value types come from the SDK; tests no longer restate a constant or a neighbour.
- Settings: the policy view returns each key's value through a merge strategy typed over the key,
  with no cast; the `hooks` of a user, project, local or `--settings` file drop only the entries
  that fail (a bad handler, group or event) and keep the rest, while a managed source still ignores
  the whole field; the same handler under two matchers is recorded as an open requirement of the
  hooks engine instead of being presented as proven; the unused `PolicyContext` type is removed
  until the resolvers need it; one shared `isRecord` guard.
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

- Settings, skills: the `disableBundledSkills` decision now says built-in commands and `/doctor` stay
  typable (`builtInCommandsTypable`); tests cover a `--settings` own-name entry that does not beat an
  alias, the same alias set in managed and `--settings` files, a parent `true` against a lower
  `false`, and a parent `false` under a managed `true`; the repair of an unknown `skillOverrides`
  state is recorded in `spec/judgments.md`, and the non-Boolean managed
  `disableSkillShellExecution` test sits with the judgments.

