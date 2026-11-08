import { error, warning, type PluginIssue } from './issues.ts';

/**
 * Plugin names (plugins/manifest-reference.md, "`name`"). Every component is namespaced under the
 * name, so it may not be empty or hold a space, `@`, `:`, a path separator, a control character
 * or a bidirectional-formatting character: such a name never loads. The rest is the validator's;
 * its wording is the oracle's (docs/SPEC.md, "Sources of truth").
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

/** Where a name is reported: the manifest's own `name`, or a marketplace entry's (shorter advice). */
export const NAME_CONTEXTS = ['manifest', 'entry'] as const;
export type NameContext = (typeof NAME_CONTEXTS)[number];

const RESERVED_RULE =
  'A third party\'s plugin name cannot start with "claude-", "anthropic-", "anthropics-", or "cc-plugin-", be "claude", "anthropic", "anthropics", "claude-code", or "claude-mods", or put "official" beside "claude" or "anthropic".';
const NAME_IT = 'Name it for what it does.';
/** What the manifest adds: a marketplace of Anthropic's own is validated on its own. */
const OWN_MARKETPLACE: { readonly [C in NameContext]: string } = {
  manifest: " If this is one of Anthropic's own plugins, validate the marketplace that lists it.",
  entry: '',
};

/**
 * The reserved-name report of `claude plugin validate`: an error for a name that passes as
 * Anthropic's own, a warning for one that reads as such (oracle 2.1.319).
 */
export function nameReservedIssues(name: string, context: NameContext = 'manifest'): PluginIssue[] {
  const key = folded(name);
  const words = key.split('-');
  const reserved =
    RESERVED.has(key) ||
    RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    besideOfficial(words);
  const tail = `${NAME_IT}${OWN_MARKETPLACE[context]}`;
  if (reserved) {
    return [
      error(
        'name',
        `Plugin name "${name}" is reserved: it passes as one of Anthropic's own. ${RESERVED_RULE} ${tail}`,
      ),
    ];
  }
  if (words.some((word) => BRAND_WORDS.has(word))) {
    return [warning('name', `Plugin name "${name}" reads as one of Anthropic's own. ${tail}`)];
  }
  return [];
}

/** The characters a path load refuses beside the ones that are errors: whitespace other than a space, `@`, `:`, separators and invisible marks. */
const REFUSED_BY_PATH = /[\s@:/\\​-‍⁠﻿؜]/u;
const INSTALL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KEBAB_SYNC =
  'Claude.ai marketplace sync requires kebab-case (lowercase letters, digits, and hyphens only, e.g., "my-plugin").';

/** What Claude Code does with a name that is not kebab-case, by how badly it breaks. */
function kebabAdvice(name: string): string {
  if (REFUSED_BY_PATH.test(name)) {
    return `Claude Code refuses a plugin with this name when it is loaded by path (such as --plugin-dir), and cannot install it from a marketplace that lists it under this name. The ${KEBAB_SYNC}`;
  }
  return INSTALL_ID.test(name)
    ? `Claude Code accepts it, but the ${KEBAB_SYNC}`
    : `Claude Code cannot install it from a marketplace that lists it under this name, and the ${KEBAB_SYNC}`;
}

/** The kebab-case advice of `claude plugin validate`. */
const nameKebabIssues = (name: string): PluginIssue[] =>
  KEBAB.test(name)
    ? []
    : [warning('name', `Plugin name "${name}" is not kebab-case. ${kebabAdvice(name)}`)];

/**
 * What `claude plugin validate` adds about a name that loads. The reserved-name report is left out
 * for a plugin an official marketplace lists (Anthropic's own plugins carry such names) and for one
 * its marketplace entry already reported.
 */
export const nameValidationIssues = (
  name: string,
  skipReserved = false,
  context: NameContext = 'manifest',
): PluginIssue[] => [
  ...(skipReserved ? [] : nameReservedIssues(name, context)),
  ...nameKebabIssues(name),
];
