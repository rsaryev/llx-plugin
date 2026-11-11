import type { Settings } from '../protocol/official.ts';
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

const isManaged = (holder: { readonly scope: string }): boolean => holder.scope === 'managed';
const isParent = (holder: { readonly scope: string }): boolean => holder.scope === 'parent';

/**
 * The admin tier's holders of a key: the highest managed source that sets it, else the parent's:
 * "the list from the highest-ranked admin source that sets one applies and blocks the parent's. The
 * parent's list applies only when no admin source sets one" (managed-settings.md, "Let an embedding
 * host add policy").
 */
function adminOrParent<K extends SettingsKey>(
  holders: readonly KeyHolder<K>[],
): readonly KeyHolder<K>[] {
  const admin = holders.find(isManaged);
  return admin === undefined ? holders.filter(isParent) : [admin];
}

/** The holders the key's `AdminTier` lets count (`ValueSpec.admin`). */
function countedHolders<K extends SettingsKey>(
  key: K,
  holders: readonly KeyHolder<K>[],
  managed: readonly Settings[],
): readonly KeyHolder<K>[] {
  const rule = SPECS[key].admin;
  if (rule === undefined) return holders;
  if (rule.pinnedWhen?.(managed) === true) return adminOrParent(holders);
  const admin = adminOrParent(holders);
  if (rule.owns === true && admin.length > 0) return admin;
  return rule.blocksParent === true && holders.some(isManaged)
    ? holders.filter((holder) => !isParent(holder))
    : holders;
}

/**
 * What the layers that set `key` come to: the row's merge over the holders that count, highest
 * first. A key whose managed value is not an override then lets a restrictive value of a lower scope
 * stand (settings.md, "Exceptions to managed settings precedence").
 */
function combine<K extends SettingsKey>(
  key: K,
  counted: readonly KeyHolder<K>[],
  floors: readonly ValueOf<K>[],
): ValueOf<K> | undefined {
  const spec = SPECS[key];
  const { exception } = spec;
  const byPrecedence = exception
    ? counted.filter((holder) => !exception.onlyWhenStricter.includes(holder.scope))
    : counted;
  const winning =
    byPrecedence.length === 0 ? undefined : spec.merge.combine(valuesOf(byPrecedence));
  if (!exception) return winning;
  const honored = counted.filter((holder) => exception.honoredFrom.includes(holder.scope));
  return honorException(exception, winning, [...valuesOf(honored), ...floors]);
}

/** The floors the layers' unreadable values of `key` set (`ManagedException.unreadable`). */
function floorsOf<K extends SettingsKey>(layers: readonly PolicyLayer[], key: K): ValueOf<K>[] {
  const rule = SPECS[key].exception?.unreadable;
  if (rule === undefined) return [];
  return layers.flatMap((layer) =>
    layer.invalid?.includes(key) === true && rule.from.includes(layer.scope) ? [rule.floor] : [],
  );
}

const valuesOf = <K extends SettingsKey>(holders: readonly KeyHolder<K>[]) =>
  holders.map((holder) => holder.value);

export function createPolicyView(given: readonly PolicyLayer[]): PolicyView {
  const layers = orderedLayers(given);
  const managed = layers.filter(isManaged).map((layer) => layer.settings);
  // The layers never change, so each key's holders are found once.
  const found = new Map<SettingsKey, readonly KeyHolder<SettingsKey>[]>();
  const holders = <K extends SettingsKey>(key: K): readonly KeyHolder<K>[] => {
    const known = found.get(key);
    // The map is keyed by `key`, so what it holds for `key` is that key's holders.
    if (known !== undefined) return known as readonly KeyHolder<K>[];
    const fresh = holdersOf(layers, key);
    found.set(key, fresh);
    return fresh;
  };
  return {
    layers,
    get: (key) => {
      const floors = floorsOf(layers, key);
      const counted = countedHolders(key, holders(key), managed);
      return counted.length === 0 && floors.length === 0
        ? undefined
        : combine(key, counted, floors);
    },
    winner: (key) => holders(key)[0],
    eachFromHighest: (key) => holders(key),
  };
}
