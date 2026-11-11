import type { ModMatcherValue, ModMatcher } from '../../protocol/mods-matcher.ts';

/**
 * The matcher of a hook (`on(event, hook, matcher)`) tested in this thread, with no engine and no
 * time limit: what the telemetry filter and a runtime in an isolate need. The chain's own test,
 * which may run a regular expression in a `MatcherEngine` under a time limit, is `compileMatcher`.
 */

const STATEFUL_FLAGS = /[gy]/g;

/** A regular expression made in any realm (a `vm` context, another worker's copy): its brand, not `instanceof`. */
const isRegExp = (value: unknown): value is RegExp =>
  Object.prototype.toString.call(value) === '[object RegExp]';

const isText = (value: unknown): value is string => typeof value === 'string';

/**
 * The source and flags of a regular-expression value (`/x/` or the `{ $regexp, flags }` a hooks
 * module runtime sends), with the stateful flags dropped; `undefined` for a string, number or
 * boolean. Any other object is no matcher value at all and throws, so the hook is refused.
 */
export function patternOf(allowed: ModMatcherValue): [string, string] | undefined {
  if (typeof allowed !== 'object') return undefined;
  const [source, flags]: [unknown, unknown] = isRegExp(allowed)
    ? [allowed.source, allowed.flags]
    : [Reflect.get(Object(allowed), '$regexp'), Reflect.get(Object(allowed), 'flags') ?? ''];
  if (!isText(source) || !isText(flags)) {
    throw new TypeError('expected a string, number, boolean, RegExp or { $regexp, flags }');
  }
  return [source, flags.replace(STATEFUL_FLAGS, '')];
}

/** The test of one allowed value in this thread; throws a `SyntaxError` when a serialised expression does not compile. */
export function localTest(allowed: ModMatcherValue): (actual: unknown) => boolean {
  const source = patternOf(allowed);
  if (source === undefined) return (actual) => actual === allowed;
  const pattern = new RegExp(...source);
  return (actual) => typeof actual === 'string' && pattern.test(actual);
}

const isList = (
  field: ModMatcherValue | readonly ModMatcherValue[],
): field is readonly ModMatcherValue[] => Array.isArray(field);

export const toList = (
  field: ModMatcherValue | readonly ModMatcherValue[],
): readonly ModMatcherValue[] => (isList(field) ? field : [field]);

export const fieldOf = (event: unknown, name: string): unknown =>
  typeof event === 'object' && event !== null ? Reflect.get(event, name) : undefined;

/** Whether `matcher` has no field that filters: such a hook handles every event. */
export const isUnfiltered = (matcher: ModMatcher | undefined): boolean =>
  Object.values(matcher ?? {}).every((field) => field === undefined);

/**
 * Whether the field `name` of `matcher` would let the value `actual` through, tested in this thread:
 * the check behind the telemetry filter, which never needs an engine.
 */
export function acceptsField(
  matcher: ModMatcher | undefined,
  name: string,
  actual: unknown,
): boolean {
  const field = matcher?.[name];
  if (field === undefined) return false;
  try {
    return toList(field).some((allowed) => localTest(allowed)(actual));
  } catch {
    return false; // an expression that does not compile is refused by `compileMatcher`, with its own message
  }
}

/**
 * Whether `event` passes `matcher` in this thread: every field the matcher names lets the event's
 * field through (a list, any of its values; a RegExp or `{ $regexp, flags }`, a string it matches;
 * any other value, itself). No matcher, or one with no field, passes every event; a field whose
 * expression does not compile passes none.
 */
export const matchesEvent = (matcher: ModMatcher | undefined, event: unknown): boolean =>
  Object.entries(matcher ?? {}).every(
    ([name, field]) => field === undefined || acceptsField(matcher, name, fieldOf(event, name)),
  );
