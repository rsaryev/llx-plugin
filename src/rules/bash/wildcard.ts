const ANY_TEXT = '[\\s\\S]*';
const escapeLiteral = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** `ls:*` is `ls *`: "an equivalent way to write a trailing wildcard", recognized only at the end. */
export function normalizePattern(pattern: string): string {
  return pattern.endsWith(':*') ? `${pattern.slice(0, -2)} *` : pattern;
}

/** Whether a Bash pattern holds a `*`, `:*` suffix included: an exact rule holds none. */
export const hasWildcard = (pattern: string): boolean => pattern.includes('*');

export interface PatternOptions {
  /** PowerShell matches without regard to case. */
  readonly ignoreCase?: boolean;
}

/**
 * Whether a command matches a Bash rule pattern (permissions.md, "Wildcard patterns"):
 * - a `*` stands for any text, spaces included, and everything else is literal;
 * - a `*` at the end with a space before it, when it is the only wildcard, also matches the bare
 *   command: `ls *` matches `ls`, `* --help *` does not match `npm --help`;
 * - the space before a trailing `*` is part of the rule: `ls *` does not match `lsof`.
 */
export function matchBashPattern(
  pattern: string,
  subcommand: string,
  options: PatternOptions = {},
): boolean {
  const written = normalizePattern(pattern);
  const flags = options.ignoreCase === true ? 'i' : '';
  const whole = new RegExp(`^${written.split('*').map(escapeLiteral).join(ANY_TEXT)}$`, flags);
  if (whole.test(subcommand)) return true;
  const onlyTrailing = written.endsWith(' *') && written.indexOf('*') === written.length - 1;
  if (!onlyTrailing) return false;
  const bare = written.slice(0, -2);
  return options.ignoreCase === true
    ? bare.toLowerCase() === subcommand.toLowerCase()
    : bare === subcommand;
}
