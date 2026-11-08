/**
 * How the validator names the kind of a JSON value in its messages. Zod's wording
 * ("expected string, received number") uses the bare name; the hooks messages use an article
 * ("received a number").
 */
export function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** `a string`, `an object`, `null`. */
export function withArticle(value: unknown): string {
  const kind = kindOf(value);
  if (kind === 'null' || kind === 'undefined') return kind;
  return /^[aeiou]/.test(kind) ? `an ${kind}` : `a ${kind}`;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
