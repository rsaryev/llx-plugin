import { error, warning, type PluginIssue } from './issues.ts';

/**
 * Plugin names (plugins/manifest-reference.md, "`name`"). Every component is namespaced under the
 * name, so it may not be empty or hold a space, `@`, `:`, a path separator, a control character
 * or a bidirectional-formatting character: such a name never loads. The rest is the validator's.
 */
// oxlint-disable-next-line no-control-regex -- the documented rule is "no control characters"
const FORBIDDEN = /[\s@:/\\\u0000-\u001f\u007f‪-‮⁦-⁩]/u;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Names and prefixes that pass as one of Anthropic's own (the `name` section's table). */
const RESERVED = new Set(['claude', 'anthropic', 'anthropics', 'claude-code', 'claude-mods']);
const RESERVED_PREFIXES = ['claude-', 'anthropic-', 'anthropics-', 'cc-plugin-'];
const BESIDE_OFFICIAL = new Set(['claude', 'anthropic']);
const BRAND_WORDS = new Set(['claude', 'anthropic', 'anthropics']);

/** The check ignores case and treats any run of separators as one. */
const folded = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const besideOfficial = (words: readonly string[]): boolean =>
  words.some(
    (word, index) =>
      word === 'official' &&
      (BESIDE_OFFICIAL.has(words[index - 1] ?? '') || BESIDE_OFFICIAL.has(words[index + 1] ?? '')),
  );

/** Whether a plugin of this name can load at all. */
export function nameLoadIssues(name: string): PluginIssue[] {
  if (name.trim().length === 0) return [error('name', 'Plugin name is empty')];
  if (!FORBIDDEN.test(name)) return [];
  return [
    error(
      'name',
      `Plugin name "${name}" may not contain spaces, "@", ":", path separators or control characters`,
    ),
  ];
}

/** The reserved-name report of `claude plugin validate`: an error for a name that passes as Anthropic's own, a warning for one that reads as such. */
export function nameReservedIssues(name: string): PluginIssue[] {
  const key = folded(name);
  const words = key.split('-');
  const reserved =
    RESERVED.has(key) ||
    RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    besideOfficial(words);
  if (reserved) {
    return [
      error('name', `Plugin name "${name}" is reserved: it passes as one of Anthropic's own`),
    ];
  }
  if (words.some((word) => BRAND_WORDS.has(word))) {
    return [warning('name', `Plugin name "${name}" reads as one of Anthropic's own`)];
  }
  return [];
}

/** The kebab-case advice of `claude plugin validate`. */
const nameKebabIssues = (name: string): PluginIssue[] =>
  KEBAB.test(name) ? [] : [warning('name', `Plugin name "${name}" is not kebab-case`)];

/** What `claude plugin validate` adds about a name that loads. */
export const nameValidationIssues = (name: string): PluginIssue[] => [
  ...nameReservedIssues(name),
  ...nameKebabIssues(name),
];
