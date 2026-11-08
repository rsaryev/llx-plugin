import { toJsonValue, type JsonObject } from '../../foundation/index.ts';
import { orderedLayers, type PolicyLayer, type PolicyScope } from '../../settings/index.ts';
import type { SettingsLayer } from './ports.ts';

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
  const plugin = Object.assign({}, ...pluginSettings.map(objectOf));
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
