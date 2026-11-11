import { memoize } from './memo.ts';
import { denyCoversCoworkTool, mcpToolRuleMatches } from './target/mcp.ts';
import type { PermissionRule } from './types.ts';
import { wildcardSource } from '../format/wildcard.ts';

/** Compiled once per pattern and flags: a rule's pattern is read again for every call it is tried on. */
const compiled = memoize((key) => {
  const cut = key.indexOf('\0');
  return new RegExp(`^${wildcardSource(key.slice(cut + 1))}$`, key.slice(0, cut));
});

/**
 * A `*` pattern as a regular expression that must match the whole text: `*` stands for any
 * sequence of characters, spaces and slashes included, and every other character is literal.
 */
export const wildcardRegExp = (pattern: string, flags = ''): RegExp =>
  compiled(`${flags}\0${pattern}`);

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

/**
 * Whether the tool-name position of `rule` covers `toolName`: a glob matching it whole, else the
 * name itself, an `mcp__` server name covering its tools (`mcpToolRuleMatches`), or a deny rule that
 * names `Bash` or `WebFetch` whole covering the Cowork twin of that tool.
 */
export function toolNameMatches(rule: PermissionRule, toolName: string): boolean {
  if (rule.toolGlob) return wildcardRegExp(rule.value.toolName).test(toolName);
  return (
    mcpToolRuleMatches(rule.value.toolName, toolName, rule.behavior) ||
    denyCoversCoworkTool(rule, toolName)
  );
}
