/**
 * The `<id>` of `~/.claude/plugins/data/<id>/` (plugins/manifest-reference.md, "Environment
 * variables"): the plugin identifier with every character other than a letter, digit, `_` or `-`
 * replaced by `-`. A character is a code point, so one outside the basic plane becomes one `-`.
 */
export const pluginDataId = (identifier: string): string =>
  identifier.replaceAll(/[^A-Za-z0-9_-]/gu, '-');
