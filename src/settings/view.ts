import { honorException } from './general/exceptions.ts';
import type { SettingsKey, ValueOf } from './general/keys.ts';
import { SPECS } from './key-spec.ts';
import { holdersOf, orderedLayers, type KeyHolder, type PolicyLayer } from './layers.ts';

/**
 * Typed questions over the ordered layers, the one thing every area resolver asks (docs/API.md,
 * "Settings"). A resolver never walks the layers itself, so none of them repeats the precedence
 * order, the scope lines or the merge rules.
 */
export interface PolicyView {
  /** The layers, highest precedence first. */
  readonly layers: readonly PolicyLayer[];
  /** The key as the files combine it (`undefined` when no file sets it). */
  get<K extends SettingsKey>(key: K): ValueOf<K> | undefined;
  /** The highest layer that sets the key. */
  winner<K extends SettingsKey>(key: K): KeyHolder<K> | undefined;
  /** Every layer that sets the key, highest first: what a key with its own rule walks. */
  eachFromHighest<K extends SettingsKey>(key: K): readonly KeyHolder<K>[];
}

/** The tiers an administrator controls: managed settings and the parent settings of an embedding host. */
const MANAGED_TIER: readonly string[] = ['managed', 'parent'];

/**
 * What the layers that set `key` come to: the row's merge over the values, highest first. A key
 * whose managed value is not an override then lets a restrictive value of a lower scope stand
 * (settings.md, "Exceptions to managed settings precedence"); a key managed settings own takes the
 * managed tier's values alone when it sets one.
 */
function combine<K extends SettingsKey>(
  key: K,
  holders: readonly KeyHolder<K>[],
): ValueOf<K> | undefined {
  const spec = SPECS[key];
  const managed = holders.filter((holder) => MANAGED_TIER.includes(holder.scope));
  const counted = spec.managedOwns && managed.length > 0 ? managed : holders;
  const { exception } = spec;
  const byPrecedence = exception
    ? counted.filter((holder) => !exception.onlyWhenStricter.includes(holder.scope))
    : counted;
  const winning =
    byPrecedence.length === 0 ? undefined : spec.merge.combine(valuesOf(byPrecedence));
  if (!exception) return winning;
  const honored = counted.filter((holder) => exception.honoredFrom.includes(holder.scope));
  return honorException(exception, winning, valuesOf(honored));
}

const valuesOf = <K extends SettingsKey>(holders: readonly KeyHolder<K>[]) =>
  holders.map((holder) => holder.value);

export function createPolicyView(layers: readonly PolicyLayer[]): PolicyView {
  return {
    layers: orderedLayers(layers),
    get: (key) => {
      const holders = holdersOf(layers, key);
      return holders.length === 0 ? undefined : combine(key, holders);
    },
    winner: (key) => holdersOf(layers, key)[0],
    eachFromHighest: (key) => holdersOf(layers, key),
  };
}
