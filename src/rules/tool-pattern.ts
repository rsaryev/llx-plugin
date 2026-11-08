import type { PermissionRule } from './types.ts';

const ANY_TEXT = '[\\s\\S]*';
const escapeLiteral = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/**
 * A `*` pattern as a regular expression that must match the whole text: `*` stands for any
 * sequence of characters, spaces and slashes included, and every other character is literal.
 */
export function wildcardRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map(escapeLiteral).join(ANY_TEXT)}$`);
}

/**
 * Whether an allow rule's tool-name glob names one server: permissions.md ("Tool name wildcards")
 * accepts one "only after a literal `mcp__<server>__` prefix", so `mcp__puppeteer__*` and
 * `mcp__github__get_*` do and `*`, `B*` and `mcp__*` do not. The server is the text between
 * `mcp__` and the next `__`, and it must hold no `*`.
 */
export function isAnchoredAllowGlob(toolName: string): boolean {
  const star = toolName.indexOf('*');
  return star === -1 || /^mcp__.+__/.test(toolName.slice(0, star));
}

/** Whether the tool-name position of `rule` covers `toolName`: equal, or a glob matching it whole. */
export function toolNameMatches(rule: PermissionRule, toolName: string): boolean {
  return rule.toolGlob
    ? wildcardRegExp(rule.value.toolName).test(toolName)
    : rule.value.toolName === toolName;
}
