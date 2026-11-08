import type { Settings } from '../../protocol/official.ts';

/** The `permissions` object of the SDK's settings type, and the `autoMode` object. */
export type PermissionsBlock = NonNullable<Settings['permissions']>;
export type AutoModeBlock = NonNullable<Settings['autoMode']>;

/**
 * How the permission keys of several files combine. Every function takes the value of each file
 * that sets the key, highest precedence first (`KeyHolder` order), and returns one value.
 */

const defined = <T>(values: readonly (T | undefined)[]): T[] =>
  values.filter((value): value is T => value !== undefined);

/**
 * Every file's entries, none removing another's, each once, highest source first (settings.md,
 * "Lists merge instead of overriding"); `undefined` when no file sets the list.
 */
function unionOf<E>(lists: readonly (readonly E[] | undefined)[]): E[] | undefined {
  const present = defined(lists);
  return present.length === 0 ? undefined : [...new Set(present.flat())];
}

/** A Boolean where one value wins whenever any file sets it, else the highest file's value. */
const anyOf = (winning: boolean, values: readonly (boolean | undefined)[]): boolean | undefined =>
  values.includes(winning) ? winning : values.find((value) => value !== undefined);

/** `permissions.block*OutsideWorkingDirectories`, `classifyAllShell`: "A `true` in any file applies". */
export const anyTrue = (values: readonly (boolean | undefined)[]): boolean | undefined =>
  anyOf(true, values);

/** `useAutoModeDuringPlan`: "A `false` in any of these files ... turns it off". */
export const anyFalse = (values: readonly (boolean | undefined)[]): boolean | undefined =>
  anyOf(false, values);

const first = <T>(values: readonly (T | undefined)[]): T | undefined =>
  values.find((value) => value !== undefined);

/** Fields of the block with a rule of their own; the rest are the highest file's. */
const RULED: ReadonlySet<string> = new Set([
  'allow',
  'ask',
  'deny',
  'additionalDirectories',
  'defaultMode',
  'disableBypassPermissionsMode',
  'disableAutoMode',
  'blockReadsOutsideWorkingDirectories',
  'blockWritesOutsideWorkingDirectories',
]);

/** The fields the kit has no rule for (the SDK adds some), taken from the highest file that sets each. */
function otherFields(blocks: readonly PermissionsBlock[]): Record<string, unknown> {
  const names = new Set(blocks.flatMap((block) => Object.keys(block)));
  const entries = [...names]
    .filter((name) => !RULED.has(name))
    .map((name): [string, unknown] => [name, first(blocks.map((block) => block[name]))]);
  return Object.fromEntries(entries);
}

/**
 * A field that is present only when some file sets it. TypeScript types a computed key as a string
 * index, so the one-field object is asserted to the mapped type it is by construction.
 */
const present = <K extends string, V>(name: K, value: V | undefined): { [P in K]?: V } =>
  value === undefined ? {} : ({ [name]: value } as { [P in K]?: V });

/**
 * The `permissions` blocks of the files as one: `allow`, `ask`, `deny` and `additionalDirectories`
 * are the union of every file's entries; a lock is on when any file sets it; a block flag is `true`
 * when any file sets `true`; `defaultMode` comes from the highest file that sets it (settings.md,
 * "Settings precedence"). Which file's `defaultMode` is taken into account is decided by
 * `startingMode`, which needs the scope this function does not see.
 */
export function mergePermissionBlocks(blocks: readonly PermissionsBlock[]): PermissionsBlock {
  const field = <K extends keyof PermissionsBlock>(name: K) => blocks.map((block) => block[name]);
  return {
    ...otherFields(blocks),
    ...present('allow', unionOf(field('allow'))),
    ...present('ask', unionOf(field('ask'))),
    ...present('deny', unionOf(field('deny'))),
    ...present('additionalDirectories', unionOf(field('additionalDirectories'))),
    ...present('defaultMode', first(field('defaultMode'))),
    ...present('disableBypassPermissionsMode', first(field('disableBypassPermissionsMode'))),
    ...present('disableAutoMode', first(field('disableAutoMode'))),
    ...present(
      'blockReadsOutsideWorkingDirectories',
      anyTrue(field('blockReadsOutsideWorkingDirectories')),
    ),
    ...present(
      'blockWritesOutsideWorkingDirectories',
      anyTrue(field('blockWritesOutsideWorkingDirectories')),
    ),
  };
}

/**
 * The `autoMode` blocks of the files as one: "When more than one of those files sets the same array,
 * Claude Code concatenates the entries", and a `classifyAllShell` of `true` from any file applies
 * (settings.md, "Exceptions to managed settings precedence").
 */
export function mergeAutoModeBlocks(blocks: readonly AutoModeBlock[]): AutoModeBlock {
  const list = (name: 'environment' | 'allow' | 'soft_deny' | 'hard_deny') =>
    unionOf(blocks.map((block) => block[name]));
  return {
    ...present('environment', list('environment')),
    ...present('allow', list('allow')),
    ...present('soft_deny', list('soft_deny')),
    ...present('hard_deny', list('hard_deny')),
    ...present('classifyAllShell', anyTrue(blocks.map((block) => block.classifyAllShell))),
  };
}
