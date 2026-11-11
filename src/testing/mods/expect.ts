/**
 * `expect` of the test kit (plugins/mods/test.md, "Look up what a stub returns"): "the assertions
 * `toBe`, `toEqual`, `toMatch`, `toMatchObject`, `toContain`, `toBeDefined`, `toBeUndefined`, and
 * `toThrow`, and `.not` before any of them". A failed assertion throws an `ExpectationError`.
 */

export class ExpectationError extends Error {
  override readonly name = 'ExpectationError';
}

/** Any object, arrays included (unlike `isRecord`): both compare by their keys here. */
const isObjectOrArray = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/** Whether two values hold the same data: records by their own keys, lists by position, everything else by `Object.is`. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isObjectOrArray(a) || !isObjectOrArray(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => sameValue(a[key], b[key]));
}

/** Whether `actual` holds every field of `expected`, nested records compared the same way. */
function matchesObject(actual: unknown, expected: unknown): boolean {
  if (!isObjectOrArray(expected) || Array.isArray(expected)) return sameValue(actual, expected);
  if (!isObjectOrArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => matchesObject(actual[key], value));
}

const show = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return '[function]';
  try {
    return JSON.stringify(value) ?? typeof value;
  } catch {
    return `[${typeof value}]`;
  }
};

/** A value as the text a match compares with: a string as it is, anything else as `show` writes it. */
const textOf = (value: unknown): string => (typeof value === 'string' ? value : show(value));

interface Matcher {
  /** Whether the assertion holds for `actual`. */
  readonly holds: (actual: unknown, expected: unknown) => boolean;
  readonly says: (actual: unknown, expected: unknown) => string;
}

const MATCHERS = {
  toBe: {
    holds: (actual, expected) => Object.is(actual, expected),
    says: (actual, expected) => `be ${show(expected)}, got ${show(actual)}`,
  },
  toEqual: {
    holds: sameValue,
    says: (actual, expected) => `equal ${show(expected)}, got ${show(actual)}`,
  },
  toMatch: {
    holds: (actual, expected) =>
      typeof actual === 'string' &&
      (expected instanceof RegExp ? expected.test(actual) : actual.includes(textOf(expected))),
    says: (actual, expected) => `match ${show(textOf(expected))}, got ${show(actual)}`,
  },
  toMatchObject: {
    holds: matchesObject,
    says: (actual, expected) => `match the object ${show(expected)}, got ${show(actual)}`,
  },
  toContain: {
    holds: (actual, expected) =>
      typeof actual === 'string'
        ? actual.includes(textOf(expected))
        : Array.isArray(actual) && actual.some((item) => sameValue(item, expected)),
    says: (actual, expected) => `contain ${show(expected)}, got ${show(actual)}`,
  },
  toBeDefined: {
    holds: (actual) => actual !== undefined,
    says: () => 'be defined',
  },
  toBeUndefined: {
    holds: (actual) => actual === undefined,
    says: (actual) => `be undefined, got ${show(actual)}`,
  },
  toThrow: {
    holds: (actual, expected) => thrown(actual, expected),
    says: (_actual, expected) =>
      expected === undefined ? 'throw' : `throw an error matching ${show(textOf(expected))}`,
  },
} as const satisfies Readonly<Record<string, Matcher>>;

function thrown(actual: unknown, expected: unknown): boolean {
  if (typeof actual !== 'function') return false;
  try {
    Reflect.apply(actual, undefined, []);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (expected === undefined) return true;
    return expected instanceof RegExp ? expected.test(message) : message.includes(textOf(expected));
  }
  return false;
}

type Assertions = { readonly [N in keyof typeof MATCHERS]: (expected?: unknown) => void };
export type Expect = (actual: unknown) => Assertions & { readonly not: Assertions };

function assertions(actual: unknown, negated: boolean): Assertions {
  const made = Object.entries(MATCHERS).map(([name, matcher]) => {
    const check = (expected?: unknown): void => {
      if (matcher.holds(actual, expected) === negated) {
        throw new ExpectationError(
          `expected ${show(actual)} ${negated ? 'not ' : ''}to ${matcher.says(actual, expected)}`,
        );
      }
    };
    return [name, check] as const;
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- one entry for each matcher of the table, which is what `Assertions` is
  return Object.fromEntries(made) as unknown as Assertions;
}

export const expect: Expect = (actual) => ({
  ...assertions(actual, false),
  not: assertions(actual, true),
});
