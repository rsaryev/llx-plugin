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

### Fixed

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
- `readFlag` no longer reads `constructor` or `__proto__` as a flag, and `readList` no longer splits
  a glob such as `src/**/*.{ts,tsx}` or a path with a space.
- The layer check now rejects `Date`, timers, `fetch`, `crypto`, `performance` and `globalThis` in
  `src/`, as the docs state.
