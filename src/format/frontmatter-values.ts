/**
 * Coercions of frontmatter values, shared by skills, commands, output styles and agents. YAML 1.2
 * (the core schema `parseFrontmatter` uses) reads `yes`, `no` and `on` as plain strings, so the
 * flag spellings Claude Code accepts are handled here, not by the parser.
 *
 * Each reader takes the field's key (for the problem it may report) and the raw value. An absent
 * value (`undefined`, or YAML `null`) is `undefined` with no problem; a value of the wrong shape is
 * `undefined` with a `FieldProblem`, so the caller decides whether to warn or stay silent.
 */
export interface FieldProblem {
  readonly key: string;
  /** Reads after the key: `${key} ${reason}`. */
  readonly reason: string;
}

export interface FieldRead<T> {
  readonly value: T | undefined;
  readonly problem?: FieldProblem;
}

export const NOT_A_TABLE = 'is a list or a single value, not a table';

const absent = <T>(): FieldRead<T> => ({ value: undefined });
const ok = <T>(value: T): FieldRead<T> => ({ value });
const bad = <T>(key: string, reason: string): FieldRead<T> => ({
  value: undefined,
  problem: { key, reason },
});
const isAbsent = (value: unknown): value is null | undefined =>
  value === undefined || value === null;

const FLAGS: Readonly<Record<string, boolean>> = {
  true: true,
  yes: true,
  on: true,
  '1': true,
  false: false,
  no: false,
  off: false,
  '0': false,
};
const NOT_A_FLAG = 'is not a flag: use true, false, yes, no, on, off, 1 or 0';

/** `true`/`false`/`yes`/`no`/`on`/`off`/`1`/`0`, as a YAML boolean, number or string in any case. */
export function readFlag(key: string, value: unknown): FieldRead<boolean> {
  if (isAbsent(value)) return absent();
  if (typeof value === 'boolean') return ok(value);
  if (typeof value !== 'string' && typeof value !== 'number') return bad(key, NOT_A_FLAG);
  const flag = FLAGS[String(value).trim().toLowerCase()];
  return flag === undefined ? bad(key, NOT_A_FLAG) : ok(flag);
}

/** A string, trimmed; a number or boolean is written out; blank is absent. */
export function readText(key: string, value: unknown): FieldRead<string> {
  if (isAbsent(value)) return absent();
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return bad(key, 'is not text');
  }
  const text = String(value).trim();
  return text === '' ? absent() : ok(text);
}

/** Split on commas and white space outside parentheses: `Bash(git add *) Read` is two items. */
function splitList(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[\s,]/.test(char)) {
      items.push(current);
      current = '';
    } else current += char;
  }
  items.push(current);
  return items.filter((item) => item !== '');
}

/**
 * A list as Claude Code takes it: a string split on commas and white space outside parentheses,
 * or a YAML list whose items are kept whole. An item that is not text is dropped with a problem.
 */
export function readList(key: string, value: unknown): FieldRead<readonly string[]> {
  if (isAbsent(value)) return absent();
  if (typeof value === 'string') return ok(splitList(value));
  if (!Array.isArray(value))
    return bad(key, 'is not a list: use a comma-separated string or a YAML list');
  const items = value.filter((item): item is string => typeof item === 'string');
  const kept = items.map((item) => item.trim()).filter((item) => item !== '');
  if (items.length === value.length) return ok(kept);
  return { value: kept, problem: { key, reason: 'has an item that is not text' } };
}

/** A YAML table; anything else is dropped. */
export function readTable(
  key: string,
  value: unknown,
): FieldRead<Readonly<Record<string, unknown>>> {
  if (isAbsent(value)) return absent();
  if (typeof value !== 'object' || Array.isArray(value)) return bad(key, NOT_A_TABLE);
  return ok(Object.fromEntries(Object.entries(value)));
}

/** One of `allowed`, matched exactly after trimming (no case folding). */
export function readEnum<T extends string>(
  key: string,
  value: unknown,
  allowed: readonly T[],
): FieldRead<T> {
  const text = readText(key, value);
  if (text.problem) return bad(key, text.problem.reason);
  if (text.value === undefined) return absent();
  const match = allowed.find((candidate) => candidate === text.value);
  return match === undefined ? bad(key, `is not one of: ${allowed.join(', ')}`) : ok(match);
}
