import type { Settings } from '../../protocol/official.ts';
import { POLICY_KEYS } from '../../protocol/settings-keys.ts';
import { SPECS, scopeCarries } from '../key-spec.ts';
import { MERGES } from '../merge.ts';
import { withValueAt } from '../paths.ts';
import { createPolicyView, type PolicyView } from '../view.ts';
import type { PolicyLayer } from '../layers.ts';
import { GENERAL_KEYS, type SettingsKey } from './keys.ts';

/**
 * The policy view, plus every setting of the files as one object. There is one view: the
 * general keys are rows beside the policy keys, so `get`, `winner` and `eachFromHighest` answer for
 * them too, and `merged` is the whole of settings.md, "Settings precedence" and "Lists merge instead
 * of overriding" for a host that wants an object rather than a key.
 */
export interface GeneralView extends PolicyView {
  /**
   * What Claude Code applies, key by key: every key with a row as its row combines it, every other
   * key by the general rule (blocks merge, lists union, a single value comes from the highest file).
   */
  merged(): Settings;
}

const KEY_NAMES: ReadonlySet<string> = new Set([...POLICY_KEYS, ...GENERAL_KEYS]);
const isSettingsKey = (name: string): name is SettingsKey => KEY_NAMES.has(name);

/**
 * The top-level names any layer carries, first the highest layer's. A key a layer recorded as invalid
 * counts: no value is kept for it, but its floor still applies (`crossSessionInbound` holds messages).
 */
function namesOf(layers: readonly PolicyLayer[]): readonly string[] {
  const names = layers.flatMap((layer) =>
    [...Object.keys(layer.settings), ...(layer.invalid ?? [])].filter((name) =>
      scopeCarries(layer.scope, name),
    ),
  );
  return [...new Set(names)];
}

/** A key with no row: the layers that carry it, highest first, merged by the general rule. */
function generalValue(layers: readonly PolicyLayer[], name: string): unknown {
  const values = layers
    .filter((layer) => scopeCarries(layer.scope, name))
    .map((layer) => layer.settings[name])
    .filter((value) => value !== undefined && value !== null);
  return values.length === 0 ? undefined : MERGES.deepMerge.combine(values);
}

function mergedOf(view: PolicyView): Settings {
  const entries = namesOf(view.layers).map((name): [string, unknown] => [
    name,
    isSettingsKey(name) ? view.get(name) : generalValue(view.layers, name),
  ]);
  // `Object.fromEntries` defines own properties, so a JSON-parsed `__proto__` name stays a name.
  const combined: Settings = Object.fromEntries(entries.filter(([, value]) => value !== undefined));
  // A key inside a block has a rule of its own: the block's merge must not carry a value that rule refused.
  return GENERAL_KEYS.reduce<Settings>((settings, key) => {
    const { path } = SPECS[key];
    return path === undefined ? settings : withValueAt(settings, path, view.get(key));
  }, combined);
}

export function createGeneralView(layers: readonly PolicyLayer[]): GeneralView {
  const view = createPolicyView(layers);
  return { ...view, merged: () => mergedOf(view) };
}
