import type { Settings } from '../protocol/official.ts';
import type { SettingsKey, ValueOf } from './general/keys.ts';
import { SPECS, admits } from './key-spec.ts';

/**
 * Where a settings object comes from, highest precedence first (settings.md, "Settings
 * precedence": managed, command line, project local, shared project, user). `flag` is the
 * `--settings` JSON. `parent` is the policy-tier settings an embedding host passes through the
 * Agent SDK's `managedSettings`; `addDir` is a `--add-dir` directory's `.claude/settings*.json`,
 * which carries two keys only. The docs rank `parent` nowhere (spec/judgments.md); they rank `addDir`
 * lowest of the sources of `enabledPlugins` (plugins/loading.md, "Find where a plugin is enabled").
 */
export const POLICY_SCOPES = [
  'managed',
  'parent',
  'flag',
  'local',
  'project',
  'user',
  'addDir',
] as const;
export type PolicyScope = (typeof POLICY_SCOPES)[number];

/** A higher number wins. */
export const SCOPE_RANK: { readonly [S in PolicyScope]: number } = {
  managed: 7,
  parent: 6,
  flag: 5,
  local: 4,
  project: 3,
  user: 2,
  addDir: 1,
};

export interface PolicyLayer {
  readonly scope: PolicyScope;
  readonly settings: Settings;
}

/** The layers, highest precedence first; two layers of one scope keep the order they were given. */
export const orderedLayers = (layers: readonly PolicyLayer[]): readonly PolicyLayer[] =>
  layers.toSorted((a, b) => SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope]);

/** One layer's value of a key, with the layer it came from. */
export interface KeyHolder<K extends SettingsKey> {
  readonly scope: PolicyScope;
  /** Position among the ordered layers: two files of one scope have two positions. */
  readonly position: number;
  readonly value: NonNullable<ValueOf<K>>;
}

/**
 * The key's value in one settings object: where its row reads it (a key inside a block), else the
 * key's own name. A row is typed over its key's value, so what it reads has that type.
 */
function valueIn<K extends SettingsKey>(settings: Settings, key: K): ValueOf<K> | undefined {
  const { read } = SPECS[key];
  // A top-level key has the type its `Settings` entry declares; TypeScript cannot relate the
  // generic key to that entry through the open index signature, so the type is asserted here once.
  return read ? read(settings) : (settings[key] as ValueOf<K> | undefined);
}

/**
 * Every layer that sets `key` to a value its scope admits, highest precedence first. A layer that
 * does not carry the key (the key's scope line, or the `--add-dir` rule) is skipped even when the
 * layer was built by hand rather than read.
 */
export function holdersOf<K extends SettingsKey>(
  layers: readonly PolicyLayer[],
  key: K,
): readonly KeyHolder<K>[] {
  return orderedLayers(layers).flatMap((layer, position) => {
    const value = valueIn(layer.settings, key);
    if (value === undefined || value === null || !admits(key, layer.scope, value)) return [];
    return [{ scope: layer.scope, position, value }];
  });
}
