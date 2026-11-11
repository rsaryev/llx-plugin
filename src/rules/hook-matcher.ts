import { memoize } from './memo.ts';
/**
 * How a hook's `matcher` is evaluated (hooks.md, "Matcher patterns"). The characters a matcher
 * holds decide how it reads:
 *
 * - `"*"`, `""` or omitted: matches every occurrence of the event;
 * - only exact-match characters: an exact string, or a list of exact strings;
 * - any other character: a JavaScript regular expression, tested unanchored
 *   (`RegExp.prototype.test`, so it succeeds on a match anywhere in the value).
 *
 * `FileChanged` and `StopFailure` use the narrower `narrow` set, so a hyphen, space or comma sends
 * their matcher to the regular-expression path and only `|` separates alternatives. Every other
 * event with matcher support uses `standard`. Which value an event is matched against, and that an
 * event without matcher support ignores the matcher, is the caller's (hooks/select).
 */

export type MatcherMode = 'standard' | 'narrow';

interface Grammar {
  /** A matcher made only of these characters is an exact string or list. */
  readonly exact: RegExp;
  /** What separates the alternatives of such a list. */
  readonly separator: RegExp;
}

const GRAMMARS: { readonly [M in MatcherMode]: Grammar } = {
  standard: { exact: /^[A-Za-z0-9_\- ,|]+$/, separator: /[|,]/ },
  narrow: { exact: /^[A-Za-z0-9_|]+$/, separator: /\|/ },
};

const MATCH_ALL = new Set(['', '*']);

/** The value a list alternative is compared with: surrounding whitespace is optional. */
const alternatives = (matcher: string, separator: RegExp): string[] =>
  matcher
    .split(separator)
    .map((alternative) => alternative.trim())
    // Judgment (spec/judgments.md): an empty alternative such as the tail of `Edit|` names nothing.
    .filter((alternative) => alternative.length > 0);

type Selector = (value: string) => boolean;

/** JavaScript's `RegExp.prototype.test`; a pattern that does not compile matches nothing (judgment). */
function patternSelector(pattern: string): Selector {
  try {
    const compiled = new RegExp(pattern);
    return (value) => compiled.test(value);
  } catch {
    return () => false;
  }
}

/** How a matcher selects, read once per matcher text: the list it names, or its pattern compiled. */
const selectorOf =
  (grammar: Grammar) =>
  (matcher: string): Selector => {
    if (!grammar.exact.test(matcher)) return patternSelector(matcher);
    const names = new Set(alternatives(matcher, grammar.separator));
    return (value) => names.has(value);
  };

const SELECTORS: { readonly [M in MatcherMode]: (matcher: string) => Selector } = {
  standard: memoize(selectorOf(GRAMMARS.standard)),
  narrow: memoize(selectorOf(GRAMMARS.narrow)),
};

/**
 * Whether `matcher` selects `value`. A match-all matcher selects even an event that has no value
 * to filter on; any other matcher needs a value (judgment: it matches nothing without one).
 */
export function matchesMatcher(
  matcher: string | undefined,
  value: string | undefined,
  mode: MatcherMode = 'standard',
): boolean {
  if (matcher === undefined || MATCH_ALL.has(matcher)) return true;
  if (value === undefined) return false;
  return SELECTORS[mode](matcher)(value);
}
