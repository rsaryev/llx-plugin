import type { HooksSettings } from '../protocol/hook-config.ts';
import { isHooksSettings, mergeHookSettings } from './hooks-merge.ts';
import {
  anyFalse,
  anyTrue,
  mergeAutoModeBlocks,
  mergePermissionBlocks,
} from './permissions/merge.ts';
import { isRecord } from './record.ts';

/**
 * How the layers that set one key combine into its value. A strategy is typed over the key's own
 * value type `V`: `combine` takes the key's value in every layer that sets it, highest precedence
 * first, and returns a `V`. So a row of `KEY_SPECS` cannot name a merge that returns another shape,
 * and the policy view needs no cast. One strategy per kind, never a branch.
 */
export const MERGE_KINDS = [
  'highestWins',
  'unionArrays',
  'perKeyHighestWins',
  'hookGroups',
  'permissionBlocks',
  'autoModeBlocks',
  'anyTrue',
  'anyFalse',
] as const;
export type MergeKind = (typeof MERGE_KINDS)[number];

export interface Merge<V> {
  readonly kind: MergeKind;
  readonly combine: (values: readonly NonNullable<V>[]) => V;
}

/** What every strategy has, whatever value type it is typed over. */
interface AnyMerge {
  readonly kind: MergeKind;
  readonly combine: (values: readonly never[]) => unknown;
}

/** settings.md, "Settings precedence": the value from the highest level that sets the key. */
const highestWins = {
  kind: 'highestWins',
  combine: <T>(values: readonly T[]): T | undefined => values[0],
} as const satisfies AnyMerge;

/** settings.md, "Lists merge instead of overriding": every file adds its entries, none removes. */
const unionArrays = {
  kind: 'unionArrays',
  combine: <E>(values: readonly (readonly E[])[]): E[] =>
    values.flatMap((value) => (Array.isArray(value) ? value : [])),
} as const satisfies AnyMerge;

/** An object keyed by name: per name the highest level that sets it wins, whole. */
const perKeyHighestWins = {
  kind: 'perKeyHighestWins',
  combine: <T>(values: readonly Readonly<Record<string, T>>[]): Record<string, T> => {
    const merged = new Map<string, T>();
    for (const value of values.toReversed()) {
      if (isRecord(value))
        for (const [name, entry] of Object.entries(value)) merged.set(name, entry);
    }
    // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
    return Object.fromEntries(merged);
  },
} as const satisfies AnyMerge;

const hookGroups = {
  kind: 'hookGroups',
  combine: (values: readonly HooksSettings[]): HooksSettings =>
    mergeHookSettings(values.filter(isHooksSettings)),
} as const satisfies AnyMerge;

/** The `permissions` object: lists unite, locks and block flags hold when any file sets them (permissions/merge.ts). */
const permissionBlocks = {
  kind: 'permissionBlocks',
  combine: mergePermissionBlocks,
} as const satisfies AnyMerge;

const autoModeBlocks = {
  kind: 'autoModeBlocks',
  combine: mergeAutoModeBlocks,
} as const satisfies AnyMerge;

/** A Boolean on when any file sets `true`: `skipDangerousModePermissionPrompt`, `skipAutoPermissionPrompt`. */
const anyTrueMerge = {
  kind: 'anyTrue',
  combine: (values: readonly boolean[]): boolean | undefined => anyTrue(values),
} as const satisfies AnyMerge;

/** A Boolean off when any file sets `false`: `useAutoModeDuringPlan`. */
const anyFalseMerge = {
  kind: 'anyFalse',
  combine: (values: readonly boolean[]): boolean | undefined => anyFalse(values),
} as const satisfies AnyMerge;

export const MERGES = {
  highestWins,
  unionArrays,
  perKeyHighestWins,
  hookGroups,
  permissionBlocks,
  autoModeBlocks,
  anyTrue: anyTrueMerge,
  anyFalse: anyFalseMerge,
} as const;
