import type { Settings } from '../../protocol/official.ts';
import { unionOf } from '../canonical.ts';

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
function unionOrNone<E>(lists: readonly (readonly E[] | undefined)[]): E[] | undefined {
  const present = defined(lists);
  return present.length === 0 ? undefined : unionOf(present);
}

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
]);

/**
 * The fields the kit has no rule for here (the SDK adds some), taken from the highest file that sets
 * each. A field with a row of its own (`permissions.blockReadsOutsideWorkingDirectories`) is read
 * through that row, which holds its ladder: the block carries the highest file's value only.
 */
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
  const allow = unionOrNone(fieldOf(blocks, 'allow'));
  const ask = unionOrNone(fieldOf(blocks, 'ask'));
  const deny = unionOrNone(fieldOf(blocks, 'deny'));
  const additionalDirectories = unionOrNone(fieldOf(blocks, 'additionalDirectories'));
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

/**
 * The `permissions` blocks of the files as one: `allow`, `ask`, `deny` and `additionalDirectories`
 * are the union of every file's entries; the modes and locks come from the highest file that sets
 * each, and so does every other field; `defaultMode` comes from the highest file that sets it (settings.md,
 * "Settings precedence"). Which file's `defaultMode` is taken into account is decided by
 * `startingMode`, which needs the scope this function does not see.
 */
export function mergePermissionBlocks(blocks: readonly PermissionsBlock[]): PermissionsBlock {
  return {
    ...otherFields(blocks),
    ...listFields(blocks),
    ...modeFields(blocks),
  };
}

/** The `autoMode` lists: each is the union of every file's entries, left out when no file sets it. */
function autoModeLists(
  blocks: readonly AutoModeBlock[],
): Pick<AutoModeBlock, 'environment' | 'allow' | 'soft_deny' | 'hard_deny'> {
  const environment = unionOrNone(blocks.map((block) => block.environment));
  const allow = unionOrNone(blocks.map((block) => block.allow));
  const softDeny = unionOrNone(blocks.map((block) => block.soft_deny));
  const hardDeny = unionOrNone(blocks.map((block) => block.hard_deny));
  return {
    ...(environment === undefined ? {} : { environment }),
    ...(allow === undefined ? {} : { allow }),
    ...(softDeny === undefined ? {} : { soft_deny: softDeny }),
    ...(hardDeny === undefined ? {} : { hard_deny: hardDeny }),
  };
}

/**
 * The `autoMode` blocks of the files as one: "When more than one of those files sets the same array,
 * Claude Code concatenates the entries". `classifyAllShell` is the highest file's here; its own row
 * (`autoMode.classifyAllShell`) holds the ladder that decides it.
 */
export function mergeAutoModeBlocks(blocks: readonly AutoModeBlock[]): AutoModeBlock {
  const classifyAllShell = first(blocks.map((block) => block.classifyAllShell));
  return {
    ...autoModeLists(blocks),
    ...(classifyAllShell === undefined ? {} : { classifyAllShell }),
  };
}
