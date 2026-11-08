import type { PermissionBehavior } from '../../protocol/official.ts';

/**
 * How deep a relative pattern matches (permissions.md, "How deep a pattern matches"): "A relative
 * pattern with a single directory segment, such as `src/**`, matches at different depths depending
 * on the rule type. Allow rules: `Edit(src/**)` matches only `<cwd>/src` and the files under it.
 * Deny and ask rules: `Read(secrets/**)` matches a directory named `secrets` at any depth under the
 * current directory. Every other pattern shape matches at the same depth in every rule type."
 *
 * "Single directory segment" is read as: one literal directory name (a wildcard is allowed in it, `**`
 * is not), one slash, and something below it (`src/**`, `src/*.ts`, `src/index.ts`). A pattern that
 * begins with `/`, `**` or `!`, or holds two directories, is another shape. Widening `src/index.ts` is
 * a judgment (the docs show `src/**` only); it errs towards blocking (spec/judgments.md).
 */
const SINGLE_DIRECTORY = /^(?!\*\*)(?!\.{1,2}\/)[^/!][^/]*\/[^/]+\/?$/;

const widen = (pattern: string): string =>
  SINGLE_DIRECTORY.test(pattern) ? `**/${pattern}` : pattern;

const KEEP = (pattern: string): string => pattern;

/** The pattern a rule of each behaviour matches with: only deny and ask rules reach every depth. */
export const DEPTH: { readonly [B in PermissionBehavior]: (pattern: string) => string } = {
  allow: KEEP,
  deny: widen,
  ask: widen,
};
