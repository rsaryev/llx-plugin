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

### Fixed

- `readFlag` no longer reads `constructor` or `__proto__` as a flag, and `readList` no longer splits
  a glob such as `src/**/*.{ts,tsx}` or a path with a space.
- The layer check now rejects `Date`, timers, `fetch`, `crypto`, `performance` and `globalThis` in
  `src/`, as the docs state.
