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

const fieldOf = <K extends keyof PermissionsBlock>(
  blocks: readonly PermissionsBlock[],
  name: K,
): (PermissionsBlock[K] | undefined)[] => blocks.map((block) => block[name]);

/** The four lists of the block: the union of every file's entries, left out when no file sets one. */
function listFields(
  blocks: readonly PermissionsBlock[],
): Pick<PermissionsBlock, 'allow' | 'ask' | 'deny' | 'additionalDirectories'> {
  const allow = unionOf(fieldOf(blocks, 'allow'));
  const ask = unionOf(fieldOf(blocks, 'ask'));
  const deny = unionOf(fieldOf(blocks, 'deny'));
  const additionalDirectories = unionOf(fieldOf(blocks, 'additionalDirectories'));
  return {
    ...(allow === undefined ? {} : { allow }),
    ...(ask === undefined ? {} : { ask }),
    ...(deny === undefined ? {} : { deny }),
    ...(additionalDirectories === undefined ? {} : { additionalDirectories }),
  };
}

/** The modes and locks: the highest file that sets each. */
function modeFields(
  blocks: readonly PermissionsBlock[],
): Pick<PermissionsBlock, 'defaultMode' | 'disableBypassPermissionsMode' | 'disableAutoMode'> {
  const defaultMode = first(fieldOf(blocks, 'defaultMode'));
  const disableBypassPermissionsMode = first(fieldOf(blocks, 'disableBypassPermissionsMode'));
  const disableAutoMode = first(fieldOf(blocks, 'disableAutoMode'));
  return {
    ...(defaultMode === undefined ? {} : { defaultMode }),
    ...(disableBypassPermissionsMode === undefined ? {} : { disableBypassPermissionsMode }),
    ...(disableAutoMode === undefined ? {} : { disableAutoMode }),
  };
}

/** The block flags: `true` when any file sets `true`. */
function flagFields(
  blocks: readonly PermissionsBlock[],
): Pick<
  PermissionsBlock,
  'blockReadsOutsideWorkingDirectories' | 'blockWritesOutsideWorkingDirectories'
> {
  const blockReadsOutsideWorkingDirectories = anyTrue(
    fieldOf(blocks, 'blockReadsOutsideWorkingDirectories'),
  );
  const blockWritesOutsideWorkingDirectories = anyTrue(
    fieldOf(blocks, 'blockWritesOutsideWorkingDirectories'),
  );
  return {
    ...(blockReadsOutsideWorkingDirectories === undefined
      ? {}
      : { blockReadsOutsideWorkingDirectories }),
    ...(blockWritesOutsideWorkingDirectories === undefined
      ? {}
      : { blockWritesOutsideWorkingDirectories }),
  };
}

/**
 * The `permissions` blocks of the files as one: `allow`, `ask`, `deny` and `additionalDirectories`
 * are the union of every file's entries; a lock is on when any file sets it; a block flag is `true`
 * when any file sets `true`; `defaultMode` comes from the highest file that sets it (settings.md,
 * "Settings precedence"). Which file's `defaultMode` is taken into account is decided by
 * `startingMode`, which needs the scope this function does not see.
 */
export function mergePermissionBlocks(blocks: readonly PermissionsBlock[]): PermissionsBlock {
  return {
    ...otherFields(blocks),
    ...listFields(blocks),
    ...modeFields(blocks),
    ...flagFields(blocks),
  };
}

/** The `autoMode` lists: each is the union of every file's entries, left out when no file sets it. */
function autoModeLists(
  blocks: readonly AutoModeBlock[],
): Pick<AutoModeBlock, 'environment' | 'allow' | 'soft_deny' | 'hard_deny'> {
  const environment = unionOf(blocks.map((block) => block.environment));
  const allow = unionOf(blocks.map((block) => block.allow));
  const softDeny = unionOf(blocks.map((block) => block.soft_deny));
  const hardDeny = unionOf(blocks.map((block) => block.hard_deny));
  return {
    ...(environment === undefined ? {} : { environment }),
    ...(allow === undefined ? {} : { allow }),
    ...(softDeny === undefined ? {} : { soft_deny: softDeny }),
    ...(hardDeny === undefined ? {} : { hard_deny: hardDeny }),
  };
}

/**
 * The `autoMode` blocks of the files as one: "When more than one of those files sets the same array,
 * Claude Code concatenates the entries", and a `classifyAllShell` of `true` from any file applies
 * (settings.md, "Exceptions to managed settings precedence").
 */
export function mergeAutoModeBlocks(blocks: readonly AutoModeBlock[]): AutoModeBlock {
  const classifyAllShell = anyTrue(blocks.map((block) => block.classifyAllShell));
  return {
    ...autoModeLists(blocks),
    ...(classifyAllShell === undefined ? {} : { classifyAllShell }),
  };
}
