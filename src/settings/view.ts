import type { Settings } from '../protocol/official.ts';
import type { PolicyKey } from '../protocol/settings-keys.ts';
import { KEY_SPECS } from './key-spec.ts';
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
  get<K extends PolicyKey>(key: K): Settings[K] | undefined;
  /** The highest layer that sets the key. */
  winner<K extends PolicyKey>(key: K): KeyHolder<K> | undefined;
  /** Every layer that sets the key, highest first: what a key with its own rule walks. */
  eachFromHighest<K extends PolicyKey>(key: K): readonly KeyHolder<K>[];
}

export function createPolicyView(layers: readonly PolicyLayer[]): PolicyView {
  return {
    layers: orderedLayers(layers),
    get: (key) => {
      const holders = holdersOf(layers, key);
      if (holders.length === 0) return undefined;
      return KEY_SPECS[key].merge.combine(holders.map((holder) => holder.value));
    },
    winner: (key) => holdersOf(layers, key)[0],
    eachFromHighest: (key) => holdersOf(layers, key),
  };
}
