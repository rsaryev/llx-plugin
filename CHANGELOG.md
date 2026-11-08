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
- Marketplace contracts: the `Marketplace`, `MarketplaceEntry`, `PluginSource` and
  `MarketplaceSource` shapes (with the closed `PLUGIN_SOURCE_KINDS` and `MARKETPLACE_SOURCE_KINDS`
  lists), the fetch plans (`FetchPlan`, `MarketplaceFetchPlan`, `ArchiveLimits`), the ports only
  marketplaces need (`Sha256`, `ArchiveReader`, `GitTags`, `SourceFetcher`), and the plugin id
  grammar shared by names, rename targets and dependencies (`PLUGIN_ID_PART`, `pluginIdIssues` with
  the documented "Claude Code cannot install plugin" and "cannot contain spaces" messages,
  `desktopNameIssues` for the Claude Desktop warnings).

### Fixed

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
