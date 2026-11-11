/** The matcher of a hook (`on(event, hook, matcher)`): a leaf, so a runtime in an isolate can name it. */

/** A value a matcher field can hold: a literal, or a regular expression (serialisable as `{ $regexp, flags }`). */
export type ModMatcherValue =
  | string
  | number
  | boolean
  | RegExp
  | { $regexp: string; flags?: string };
/** A filter on an event's fields (events.md, "Filter which events a hook handles"). */
export interface ModMatcher {
  readonly [field: string]: ModMatcherValue | readonly ModMatcherValue[] | undefined;
}
