import type { ShellWord } from './words.ts';

/**
 * "Certain known-safe environment variables" (permissions.md, "Bash > Wrappers"): the docs name
 * `NODE_ENV`, `LANG` and `NO_COLOR`; the rest of the set, and the values each accepts, are what
 * Claude Code 2.1.322 let through, read-only or past `Bash(echo hi)` (spec/judgments.md). A value
 * a variable or substitution writes is never safe. The same set serves the read-only set and the
 * allow rules, which a host extends with `MatchContext.safeEnvVars` (any value).
 */
type ValueCheck = (value: string) => boolean;

const ANY: ValueCheck = () => true;
/** `C`, `POSIX`, empty, or a UTF-8 locale: `LANG=en_US.ISO-8859-1` and `LANG=en_US` were asked. */
const LOCALE: ValueCheck = (value) =>
  /^(?:|C|POSIX|(?:C|[a-z]{2,3}_[A-Z]{2})\.(?:UTF-8|utf-?8)(?:@[a-z]+)?)$/.test(value);
/** "COLUMNS has integer attribute": a non-integer was asked. */
const INTEGER: ValueCheck = (value) => /^\d+$/.test(value);
/** `TZ=America/New_York` passed, `TZ=../../etc` was asked. */
const ZONE: ValueCheck = (value) => !value.split('/').includes('..');

const SAFE: { readonly [name: string]: ValueCheck } = {
  NODE_ENV: ANY,
  NO_COLOR: ANY,
  LANG: LOCALE,
  LC_ALL: LOCALE,
  LC_CTYPE: LOCALE,
  LC_TIME: ANY,
  LANGUAGE: ANY,
  TERM: ANY,
  TZ: ZONE,
  COLUMNS: INTEGER,
  LINES: INTEGER,
  FORCE_COLOR: ANY,
  CLICOLOR: ANY,
  CI: ANY,
  RUST_LOG: ANY,
  RUST_BACKTRACE: ANY,
  PYTHONUNBUFFERED: ANY,
  PYTHONDONTWRITEBYTECODE: ANY,
  GOOS: ANY,
  GOARCH: ANY,
  GREP_COLOR: ANY,
  LS_COLORS: ANY,
  BLOCK_SIZE: ANY,
  TIME_STYLE: ANY,
};

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/** The variable a word assigns (`LANG=C`), or `undefined` when it is not an assignment. */
export const assignedVariable = (word: ShellWord): string | undefined =>
  ASSIGNMENT.exec(word.text)?.[1];

/**
 * Whether an assignment word is a safe one: a known variable with a value it accepts, or a variable
 * the host names (`hostSafe`, any value). A value the shell expands is never safe.
 */
export function isSafeAssignment(
  word: ShellWord,
  hostSafe: ReadonlySet<string> = new Set(),
): boolean {
  const variable = assignedVariable(word);
  if (variable === undefined || word.expands) return false;
  if (hostSafe.has(variable)) return true;
  const check = Object.hasOwn(SAFE, variable) ? SAFE[variable] : undefined;
  return check?.(word.value.slice(variable.length + 1)) ?? false;
}
