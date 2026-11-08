/**
 * The shape of a permission rule's text, shared by the settings reader (a malformed rule is a
 * Settings Warning) and the rules parser (permissions.md, "Permission rule syntax"; errors.md,
 * "Malformed Tool(content) rule").
 */
export interface RuleParts {
  readonly toolName: string;
  readonly content: string | undefined;
}

/** errors.md ("Malformed Tool(content) rule"), quoted. */
export const MALFORMED_RULE =
  'Malformed Tool(content) rule. Rules take the form Tool or Tool(content) and must end at the closing ")"; parentheses inside the content are literal';

/** errors.md: `Invalid permission rule "..." was skipped: <reason>`. */
export const invalidRuleMessage = (raw: string, reason: string): string =>
  `Invalid permission rule "${raw}" was skipped: ${reason}`;

/**
 * `Tool` or `Tool(content)`. Parentheses inside the content are literal, so the rule ends at its
 * last character, which must be the closing parenthesis (permissions.md, "Permission rule syntax");
 * `undefined` for text of no such shape.
 */
export function splitRule(raw: string): RuleParts | undefined {
  const open = raw.indexOf('(');
  if (open === -1) {
    return raw === '' || raw.includes(')') ? undefined : { toolName: raw, content: undefined };
  }
  const toolName = raw.slice(0, open).trim();
  if (toolName === '' || toolName.includes(')') || !raw.endsWith(')')) return undefined;
  return { toolName, content: raw.slice(open + 1, -1) };
}
