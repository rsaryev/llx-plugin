import type { RuleSource } from './types.ts';

/**
 * Whether a source is a settings file or object, as against the command line or the session.
 * Claude Code skips an `mcp__` rule with parentheses only "when it loads a settings file"; a deny
 * rule passed with `--disallowedTools` is how to match a parameter of an MCP tool (permissions.md,
 * "Match by input parameter"). The policy an embedding host passes is settings content, so it is
 * read like a file (spec/judgments.md). A registry typed over the source kinds: a kind added to
 * `RuleSource` fails the typecheck here.
 */
export const IS_SETTINGS_SOURCE: { readonly [K in RuleSource['kind']]: boolean } = {
  managed: true,
  'embedder-managed': true,
  project: true,
  local: true,
  user: true,
  'flag-settings': true,
  cli: false,
  session: false,
};
