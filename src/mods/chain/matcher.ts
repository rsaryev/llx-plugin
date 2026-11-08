import type { MatcherValue, ModMatcher } from '../../protocol/mods-events.ts';

/**
 * A matcher (events.md, "Filter which events a hook handles"): an object whose fields are compared
 * with the event's, and the hook runs only when every field matches. A field is a value, an array
 * of allowed values, or a regular expression.
 *
 * Judgments (spec/judgments.md): a regular expression is tested, unanchored, against string fields
 * only; a field the event lacks matches nothing; a field set to `undefined` is not a filter; a
 * `g` or `y` flag is ignored so a mod's expression never carries state between events.
 */
export interface CompiledMatcher {
  readonly test: (event: unknown) => boolean;
}

const isSerialisedRegExp = (value: MatcherValue): value is { $regexp: string; flags?: string } =>
  typeof value === 'object' && !(value instanceof RegExp);

const STATEFUL_FLAGS = /[gy]/g;

/** The test of one allowed value; throws a `SyntaxError` when a serialised expression does not compile. */
function valueTest(allowed: MatcherValue): (actual: unknown) => boolean {
  if (allowed instanceof RegExp || isSerialisedRegExp(allowed)) {
    const [source, flags] =
      allowed instanceof RegExp
        ? [allowed.source, allowed.flags]
        : [allowed.$regexp, allowed.flags ?? ''];
    const pattern = new RegExp(source, flags.replace(STATEFUL_FLAGS, ''));
    return (actual) => typeof actual === 'string' && pattern.test(actual);
  }
  return (actual) => actual === allowed;
}

const isList = (field: MatcherValue | readonly MatcherValue[]): field is readonly MatcherValue[] =>
  Array.isArray(field);

const toList = (field: MatcherValue | readonly MatcherValue[]): readonly MatcherValue[] =>
  isList(field) ? field : [field];

const fieldOf = (event: unknown, name: string): unknown =>
  typeof event === 'object' && event !== null ? Reflect.get(event, name) : undefined;

/** The matcher ready to test events, or the reason a field of it cannot be (a malformed regular expression). */
export function compileMatcher(
  matcher: ModMatcher | undefined,
): CompiledMatcher | { readonly problem: string } {
  const tests: { readonly name: string; readonly any: (actual: unknown) => boolean }[] = [];
  for (const [name, field] of Object.entries(matcher ?? {})) {
    if (field === undefined) continue;
    try {
      const alternatives = toList(field).map(valueTest);
      tests.push({ name, any: (actual) => alternatives.some((test) => test(actual)) });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return { problem: `matcher field "${name}" is not a valid regular expression: ${why}` };
    }
  }
  return { test: (event) => tests.every(({ name, any }) => any(fieldOf(event, name))) };
}

/** Whether `matcher` has no field that filters: such a hook handles every event. */
export const isUnfiltered = (matcher: ModMatcher | undefined): boolean =>
  Object.values(matcher ?? {}).every((field) => field === undefined);

/** Whether the field `name` of `matcher` would let the value `actual` through: the check behind the telemetry filter. */
export function acceptsField(
  matcher: ModMatcher | undefined,
  name: string,
  actual: unknown,
): boolean {
  const field = matcher?.[name];
  if (field === undefined) return false;
  const compiled = compileMatcher({ [name]: field });
  return 'test' in compiled && compiled.test({ [name]: actual });
}
