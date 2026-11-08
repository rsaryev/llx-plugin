# Changelog

## [Unreleased]

### Added

- The evidence pipeline: `docs:pull` mirrors the official Claude Code docs, `spec:extract` turns
  them into `spec/requirements.json`, and `compat` reports the share each test run proves.
- Official types re-exported from `@anthropic-ai/claude-agent-sdk`, with `HOOK_EVENTS` and
  `HOOK_HANDLER_TYPES` asserted equal to the SDK's unions.
- `readManifest` and `validateManifest` for `.claude-plugin/plugin.json`.
