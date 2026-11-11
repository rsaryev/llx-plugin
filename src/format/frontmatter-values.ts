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

/** A `Map`, not an object: `constructor` and `__proto__` must not read as flags. */
const FLAGS: ReadonlyMap<string, boolean> = new Map([
  ['true', true],
  ['yes', true],
  ['on', true],
  ['1', true],
  ['false', false],
  ['no', false],
  ['off', false],
  ['0', false],
]);
const NOT_A_FLAG = 'is not a flag: use true, false, yes, no, on, off, 1 or 0';

/** `true`/`false`/`yes`/`no`/`on`/`off`/`1`/`0`, as a YAML boolean, number or string in any case. */
export function readFlag(key: string, value: unknown): FieldRead<boolean> {
  if (isAbsent(value)) return absent();
  if (typeof value === 'boolean') return ok(value);
  if (typeof value !== 'string' && typeof value !== 'number') return bad(key, NOT_A_FLAG);
  const flag = FLAGS.get(String(value).trim().toLowerCase());
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

/**
 * How a string list is split. Which one a field uses is the docs' call: `allowed-tools` and
 * `disallowed-tools` (skills.md) are `space-or-comma`; `tools` and `disallowedTools`
 * (sub-agents.md) and `paths` (skills.md, memory.md) are `comma`, so `my dir/**` stays one item.
 */
export interface ListOptions {
  readonly separators: 'comma' | 'space-or-comma';
  /** Also keep `{...}` whole, for globs such as `src/**\/*.{ts,tsx}`. */
  readonly braces?: boolean;
}

/** Split outside parentheses (and braces, when asked): `Bash(git add *) Read` is two items. */
function splitList(text: string, { separators, braces = false }: ListOptions): string[] {
  const separator = separators === 'comma' ? /,/ : /[\s,]/;
  const closers = braces ? [')', '}'] : [')'];
  const openers = braces ? ['(', '{'] : ['('];
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (openers.includes(char)) depth += 1;
    else if (closers.includes(char)) depth = Math.max(0, depth - 1);
    if (depth === 0 && separator.test(char)) {
      items.push(current);
      current = '';
    } else current += char;
  }
  items.push(current);
  return items.map((item) => item.trim()).filter((item) => item !== '');
}

/**
 * A list as Claude Code takes it: a string split as `options` say, outside parentheses, or a YAML
 * list whose items are kept whole. An item that is not text is dropped with a problem.
 */
export function readList(
  key: string,
  value: unknown,
  options: ListOptions,
): FieldRead<readonly string[]> {
  if (isAbsent(value)) return absent();
  if (typeof value === 'string') return ok(splitList(value, options));
  if (!Array.isArray(value))
    return bad(key, 'is not a list: use a comma-separated string or a YAML list');
  const items = value.filter((item): item is string => typeof item === 'string');
  const kept = items.map((item) => item.trim()).filter((item) => item !== '');
  if (items.length === value.length) return ok(kept);
  return { value: kept, problem: { key, reason: 'has an item that is not text' } };
}

export interface IntegerBounds {
  readonly min?: number;
  readonly max?: number;
}

const INTEGER_TEXT = /^[+-]?\d+$/;

const wholeNumber = (value: unknown): number | undefined => {
  const number =
    typeof value === 'string' && INTEGER_TEXT.test(value.trim()) ? Number(value.trim()) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) ? number : undefined;
};

/** `at least 1`, `at most 9` or `at least 1 and at most 9`: the bounds that are set. */
function describeBounds({ min, max }: IntegerBounds): string {
  const parts = [];
  if (min !== undefined) parts.push(`at least ${min}`);
  if (max !== undefined) parts.push(`at most ${max}`);
  return `must be ${parts.join(' and ')}`;
}

/** A whole number, as a YAML number or a string of digits, within `min` and `max` when given. */
export function readInteger(
  key: string,
  value: unknown,
  bounds: IntegerBounds = {},
): FieldRead<number> {
  if (isAbsent(value)) return absent();
  const number = wholeNumber(value);
  if (number === undefined) return bad(key, 'is not a whole number');
  const { min = -Infinity, max = Infinity } = bounds;
  return number < min || number > max ? bad(key, describeBounds(bounds)) : ok(number);
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
