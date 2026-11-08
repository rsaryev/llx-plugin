import { warning, type PluginIssue } from '../../format/issues.ts';

/**
 * hooks.md, "Persisted variables in PowerShell commands": PowerShell never runs `CLAUDE_ENV_FILE`;
 * "Claude Code reads the assignments out of it and copies them into the PowerShell command's
 * environment instead", and "only when every line is one of the following":
 *
 * - a blank line or a `#` comment
 * - one assignment at the start of the line, `export NAME=value`, `declare -x NAME=value` or
 *   `NAME=value`, with a value "Bash would use exactly as written", made of any mix of unquoted text
 *   that uses only letters, digits and `_ @ % + = : , . / -`, text in single quotes, and text in
 *   double quotes where any `$`, backtick or `"` inside is escaped with a backslash
 *
 * "If any line is of another kind ... PowerShell commands receive none of the variables, and
 * `claude --debug` logs `Session environment is not all plain assignments`." On Windows "PowerShell
 * commands also don't receive a variable whose value contains `/` or `\`", and "a sandboxed
 * PowerShell command receives none of the variables".
 *
 * Judgments (spec/judgments.md): a comment is a line whose first character that is not a space or
 * tab is `#`; a blank line holds only spaces and tabs; an assignment has no leading or trailing
 * space; in double quotes a backslash before any character other than `$`, a backtick, `"` or
 * another backslash stays a literal backslash, as in Bash; a name is a Bash identifier; a repeated
 * name takes its last value.
 */

/** The message `claude --debug` logs, as an issue's text. */
export const NOT_PLAIN_ASSIGNMENTS = 'Session environment is not all plain assignments';

const BLANK = /^[ \t]*$/;
const COMMENT = /^[ \t]*#/;
const ASSIGNMENT = /^(?:(?:export|declare -x)[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

const UNQUOTED = /^[A-Za-z0-9_@%+=:,./-]+/;
const SINGLE_QUOTED = /^'([^']*)'/;
const DOUBLE_QUOTED = /^"((?:[^"\\$`]|\\.)*)"/;

/** A value part reads off the front of the text: its value and what is left, or no match. */
interface Part {
  readonly value: string;
  readonly rest: string;
}

type PartReader = (text: string) => Part | undefined;

const take =
  (pattern: RegExp, valueOf: (match: RegExpExecArray) => string): PartReader =>
  (text) => {
    const match = pattern.exec(text);
    return match === null
      ? undefined
      : { value: valueOf(match), rest: text.slice(match[0].length) };
  };

/** In double quotes a backslash escapes `$`, a backtick, `"` and a backslash; before anything else it stays. */
const unescapeDouble = (inner: string): string => inner.replace(/\\([$`"\\])/g, '$1');

const PARTS: readonly PartReader[] = [
  take(UNQUOTED, ([all]) => all),
  take(SINGLE_QUOTED, ([, inner]) => inner ?? ''),
  // The pattern lets `$`, a backtick and `"` through only after a backslash.
  take(DOUBLE_QUOTED, ([, inner]) => unescapeDouble(inner ?? '')),
];

/** The value of an assignment's right-hand side, or `undefined` when a part of it is not plain. */
function plainValue(text: string): string | undefined {
  let rest = text;
  let value = '';
  while (rest !== '') {
    const part = PARTS.map((read) => read(rest)).find((found) => found !== undefined);
    if (part === undefined) return undefined;
    value += part.value;
    rest = part.rest;
  }
  return value;
}

/** A line's assignment, `undefined` for a blank or a comment, `null` for a line of another kind. */
function readLine(line: string): readonly [string, string] | undefined | null {
  if (BLANK.test(line) || COMMENT.test(line)) return undefined;
  const match = ASSIGNMENT.exec(line);
  if (match === null) return null;
  const value = plainValue(match[2] ?? '');
  return value === undefined ? null : [match[1] ?? '', value];
}

export interface PowershellVariables {
  /** What PowerShell commands receive: nothing when a line is not plain. */
  readonly variables: Readonly<Record<string, string>>;
  readonly issues: readonly PluginIssue[];
}

export interface PowershellReadOptions {
  /** A Windows host drops a variable whose value holds `/` or `\`. */
  readonly windows: boolean;
}

const NONE: PowershellVariables = { variables: {}, issues: [] };

/** The variables a PowerShell command receives out of the text of every file the session's hooks wrote. */
export function readPowershellVariables(
  text: string,
  options: PowershellReadOptions,
): PowershellVariables {
  const assigned = new Map<string, string>();
  for (const line of text.split('\n')) {
    const read = readLine(line);
    if (read === null) {
      return {
        variables: {},
        issues: [warning('CLAUDE_ENV_FILE', NOT_PLAIN_ASSIGNMENTS)],
      };
    }
    if (read !== undefined) assigned.set(read[0], read[1]);
  }
  const received = [...assigned].filter(([, value]) => !(options.windows && /[/\\]/.test(value)));
  // `Object.fromEntries` defines own properties, so a `__proto__` name stays a name.
  return { ...NONE, variables: Object.fromEntries(received) };
}
