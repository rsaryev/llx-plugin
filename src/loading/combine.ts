import type { CombineMode } from '../format/layout.ts';

/**
 * How a manifest key combines with its default location (plugins/manifest-reference.md, "How each
 * key combines with its default location"). `declared` is `undefined` when the manifest does not set
 * the key; the result is the entries to load, in loading order.
 *
 * - `replace`: a key that is set replaces the default, so the default is not scanned (an empty list
 *   included: the key is still set).
 * - `add`: the default and the listed entries load; one named twice loads once.
 * - `merge`: the default loads first, what the manifest declares after it, in the order declared;
 *   merging the content (a later server name replaces an earlier one) is the reader's.
 */
type Combine = <T>(defaults: readonly T[], declared: readonly T[] | undefined) => T[];

export const COMBINE: { readonly [M in CombineMode]: Combine } = {
  replace: (defaults, declared) => [...(declared ?? defaults)],
  add: (defaults, declared) => [...new Set([...defaults, ...(declared ?? [])])],
  merge: (defaults, declared) => [...defaults, ...(declared ?? [])],
};
