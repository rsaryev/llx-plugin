import type { Settings } from '../protocol/official.ts';
import type { PolicyKey } from '../protocol/settings-keys.ts';
import { KEY_SPECS } from './key-spec.ts';
import { holdersOf, orderedLayers, type KeyHolder, type SettingsLayer } from './layers.ts';
import { MERGERS } from './merge.ts';

/**
 * Typed questions over the ordered layers, the one thing every area resolver asks (docs/API.md,
 * "Settings"). A resolver never walks the layers itself, so none of them repeats the precedence
 * order, the scope lines or the merge rules.
 */
export interface PolicyView {
  /** The layers, highest precedence first. */
  readonly layers: readonly SettingsLayer[];
  /** The key as the files combine it (`undefined` when no file sets it). */
  get<K extends PolicyKey>(key: K): Settings[K] | undefined;
  /** The highest layer that sets the key. */
  winner<K extends PolicyKey>(key: K): KeyHolder<K> | undefined;
  /** Every layer that sets the key, highest first: what a key with its own rule walks. */
  eachFromHighest<K extends PolicyKey>(key: K): readonly KeyHolder<K>[];
}

export function createPolicyView(layers: readonly SettingsLayer[]): PolicyView {
  return {
    layers: orderedLayers(layers),
    get: (key) => {
      const holders = holdersOf(layers, key);
      if (holders.length === 0) return undefined;
      const merged = MERGERS[KEY_SPECS[key].merge](holders.map((holder) => holder.value));
      // The merge kind of a key keeps the shape of the key's type (a list of lists is a list, a map of
      // maps is a map), but the registry returns `unknown`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above: the row of KEY_SPECS decides the merge, not the caller
      return merged as Settings[typeof key];
    },
    winner: (key) => holdersOf(layers, key)[0],
    eachFromHighest: (key) => holdersOf(layers, key),
  };
}
