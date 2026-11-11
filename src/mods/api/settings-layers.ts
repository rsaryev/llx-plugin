import { toJsonValue, type JsonObject } from '../../foundation/index.ts';
import { readSettingsLayer, type PolicyLayer, type PolicyScope } from '../../settings/index.ts';
import { createGeneralView } from '../../settings/general/index.ts';
import { readPluginSettings } from '../../format/plugin-settings.ts';
import type { ModSettingsReader, SettingsLayer } from './ports.ts';
import { orderedLayers } from '../../settings/layers.ts';

/**
 * `e.layers` of a `settings.read` event (events.md, "What a `settings.read` hook receives"): "One
 * `{ source, settings }` object for each source in use that holds settings, lowest precedence first:
 * `plugin`, `user`, `project`, `local`, `flag`, `policy`." `flag` holds the settings passed with
 * `--settings` and `policy` holds managed settings. The settings stream names the sources its own
 * way (`managed`, `flag`, `local`, `project`, `user`), so this maps them.
 */

/** The name of each source of the settings stream in `e.layers`; a scope the docs give no name has none (judgment). */
const LAYER_NAMES: { readonly [S in PolicyScope]: string | undefined } = {
  user: 'user',
  project: 'project',
  local: 'local',
  flag: 'flag',
  managed: 'policy',
  // Judgment: the six names of the page leave out the settings an embedding host passes and a `--add-dir` directory's.
  parent: undefined,
  addDir: undefined,
};

const isEmpty = (settings: JsonObject): boolean => Object.keys(settings).length === 0;

function objectOf(settings: unknown): JsonObject {
  const json = toJsonValue(settings);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return {};
  return Object.fromEntries(Object.entries(json));
}

/**
 * The layers a `settings.read` hook receives: the settings enabled plugins supply (`plugin`, lowest,
 * "a layer name only") and each source of `layers` that holds settings, lowest precedence first.
 */
export function settingsLayersForMods(
  layers: readonly PolicyLayer[],
  pluginSettings: readonly unknown[] = [],
): readonly SettingsLayer[] {
  const plugin = pluginSettings.reduce<JsonObject>(
    (merged, settings) => ({ ...merged, ...objectOf(settings) }),
    {},
  );
  const fromPlugins: SettingsLayer[] = isEmpty(plugin)
    ? []
    : [{ source: 'plugin', settings: plugin }];
  const fromSources = orderedLayers(layers)
    .toReversed()
    .flatMap((layer): SettingsLayer[] => {
      const source = LAYER_NAMES[layer.scope];
      const settings = objectOf(layer.settings);
      return source === undefined || isEmpty(settings) ? [] : [{ source, settings }];
    });
  return [...fromPlugins, ...fromSources];
}

interface DecodedLayer {
  readonly policy?: PolicyLayer;
  readonly defaults?: JsonObject;
}

const fromPolicy =
  (scope: PolicyScope) =>
  (settings: JsonObject): DecodedLayer => ({
    policy: readSettingsLayer(scope, settings).layer,
  });

const DECODERS = {
  plugin: (settings: JsonObject): DecodedLayer => ({
    defaults: objectOf(readPluginSettings(settings, 'plugin settings').settings),
  }),
  user: fromPolicy('user'),
  project: fromPolicy('project'),
  local: fromPolicy('local'),
  flag: fromPolicy('flag'),
  policy: fromPolicy('managed'),
};
const isLayerSource = (source: string): source is keyof typeof DECODERS =>
  Object.hasOwn(DECODERS, source);

/** The same key-specific merge and managed exceptions as the host's settings, not a shallow merge. */
export function mergeModSettingsLayers(
  layers: readonly SettingsLayer[],
  floors: readonly PolicyLayer[] = [],
): JsonObject {
  const decoded = layers.flatMap((layer) =>
    isLayerSource(layer.source) ? [DECODERS[layer.source](layer.settings)] : [],
  );
  const defaults = decoded.reduce<JsonObject>(
    (value, layer) => ({ ...value, ...layer.defaults }),
    {},
  );
  const policies = decoded.flatMap((layer) => (layer.policy ? [layer.policy] : []));
  const view = createGeneralView([...policies, ...floors]);
  return { ...defaults, ...objectOf(view.merged()) };
}

/** A repaired-away managed value must not lose its fail-closed floor when converted to JSON layers. */
const floorsOf = (layers: readonly PolicyLayer[]): readonly PolicyLayer[] =>
  layers.flatMap((layer) => (layer.invalid?.length ? [{ ...layer, settings: {} }] : []));

/** Builds the reader used by both engine and mod reads from the settings layers the kit owns. */
export function createModSettingsReader(input: {
  readonly layers: () => readonly PolicyLayer[];
  readonly plugins?: () => readonly unknown[];
  readonly merged?: ModSettingsReader['merged'];
}): ModSettingsReader {
  return {
    layers: () => Promise.resolve(settingsLayersForMods(input.layers(), input.plugins?.() ?? [])),
    merged: input.merged ?? ((layers) => mergeModSettingsLayers(layers, floorsOf(input.layers()))),
  };
}
