/**
 * The kit's one `*` wildcard: `*` is any run of characters (none included), every other character
 * is literal and the whole text must match. The settings URL patterns (`allowedHttpHookUrls`, the
 * MCP `serverUrl` entries) match with `matchesWildcard`; a pattern that needs flags or a narrower
 * `*` (a rule's tool name, a path segment, a domain label) compiles `wildcardSource`.
 */

const ANY_TEXT = '[\\s\\S]*';

/** `text` as regular-expression source that matches only itself. */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A `*` pattern as regular-expression source, `star` what a `*` matches (any text by default). */
export const wildcardSource = (pattern: string, star: string = ANY_TEXT): string =>
  pattern.split('*').map(escapeRegExp).join(star);

/**
 * Whether `text` matches `pattern` whole, each `*` any run of characters. Linear, with no regular
 * expression; a caller that matches without case folds both sides first.
 */
export function matchesWildcard(pattern: string, text: string): boolean {
  const [first = '', ...rest] = pattern.split('*');
  if (rest.length === 0) return text === pattern;
  const last = rest.pop() ?? '';
  const end = text.length - last.length;
  if (end < first.length || !text.startsWith(first) || !text.endsWith(last)) return false;
  let at = first.length;
  for (const middle of rest) {
    const found = text.indexOf(middle, at);
    if (found < 0 || found + middle.length > end) return false;
    at = found + middle.length;
  }
  return true;
}
