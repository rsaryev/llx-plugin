import { mergeHookSettings, isHooksSettings } from './hooks-merge.ts';

/**
 * How the layers that set one key combine into its value. `values` is the key's value in every
 * layer that sets it, highest precedence first. One strategy per kind, so what differs per key is
 * a row of `KEY_SPECS`, never a branch.
 */
export const MERGE_KINDS = [
  'highestWins',
  'unionArrays',
  'perKeyHighestWins',
  'hookGroups',
] as const;
export type MergeKind = (typeof MERGE_KINDS)[number];

type Merger = (values: readonly unknown[]) => unknown;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** settings.md, "Settings precedence": the value from the highest level that sets the key. */
const highestWins: Merger = (values) => values[0];

/** settings.md, "Lists merge instead of overriding": every file adds its entries, none removes. */
const unionArrays: Merger = (values) =>
  values.flatMap((value) => (Array.isArray(value) ? value : []));

/** An object keyed by name: per name the highest level that sets it wins, whole. */
const perKeyHighestWins: Merger = (values) => {
  const merged = new Map<string, unknown>();
  for (const value of values.toReversed()) {
    if (isRecord(value)) for (const [name, entry] of Object.entries(value)) merged.set(name, entry);
  }
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  return Object.fromEntries(merged);
};

const hookGroups: Merger = (values) => mergeHookSettings(values.filter(isHooksSettings));

export const MERGERS: { readonly [M in MergeKind]: Merger } = {
  highestWins,
  unionArrays,
  perKeyHighestWins,
  hookGroups,
};
