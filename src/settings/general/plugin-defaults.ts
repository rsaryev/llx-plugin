import type { PluginSettings } from '../../format/plugin-settings.ts';
import type { PolicyView } from '../view.ts';

/** plugins/components.md, "Default settings": last plugin wins, below every settings source. */
interface PluginDefaults {
  readonly settings: PluginSettings;
  readonly debug: readonly string[];
}

export function pluginDefaultsOf(
  plugins: readonly { readonly name: string; readonly settings: PluginSettings }[],
): PluginDefaults {
  const owners = new Map<keyof PluginSettings, string>();
  const settings: PluginSettings = {};
  const debug: string[] = [];
  const apply = <K extends keyof PluginSettings>(
    plugin: { name: string; settings: PluginSettings },
    key: K,
  ) => {
    const value = plugin.settings[key];
    if (value === undefined) return;
    const previous = owners.get(key);
    if (previous !== undefined)
      debug.push(`Plugin "${plugin.name}" overrides setting "${key}" set by plugin "${previous}"`);
    settings[key] = value;
    owners.set(key, plugin.name);
  };
  for (const plugin of plugins) {
    apply(plugin, 'agent');
    apply(plugin, 'subagentStatusLine');
  }
  return { settings, debug };
}

export function valueWithPluginDefaults<K extends keyof PluginSettings>(
  view: PolicyView,
  key: K,
  defaults: PluginDefaults,
): PluginSettings[K] {
  const agent = view.get('agent');
  const line = view.get('subagentStatusLine');
  const values: PluginSettings = {
    ...(agent === undefined ? {} : { agent }),
    ...(line === undefined ? {} : { subagentStatusLine: line }),
  };
  return values[key] ?? defaults.settings[key];
}
