/**
 * Compile-time checks that tie the kit's runtime lists to Claude Code's official types: `Equal`
 * is true only when two types are mutually assignable, and `Assert` accepts nothing but `true`.
 * A list that drifts from the SDK then fails the typecheck, never a test at runtime.
 */
/* oxlint-disable typescript/no-unnecessary-type-parameters -- the standard exact-equality idiom: each `T` is used once by design */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/* oxlint-enable typescript/no-unnecessary-type-parameters */

export type Assert<T extends true> = T;
