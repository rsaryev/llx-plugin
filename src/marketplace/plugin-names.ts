import type { EntryMerge } from '../format/marketplace/entry-merge.ts';
import type { MarketplaceEntry } from '../format/marketplace/types.ts';
import { pluginNotFound, type PluginNotFound } from './install-errors.ts';

/**
 * The two names of a marketplace plugin (plugins/loading.md, "Entry name and manifest name";
 * plugins/create-marketplace.md, "Keep the entry name and the manifest name the same"). The entry
 * name in `marketplace.json` is "the install and enable key": what goes in `enabledPlugins`, what
 * the cache directory is named after and what `claude plugin list` shows. The `name` in the manifest
 * is "what the plugin's components are namespaced under, and what name conflicts compare".
 */

export interface PluginNames {
  /** `<entry name>@<marketplace>`: the install id, the `enabledPlugins` key and the id `claude plugin list` shows. */
  readonly installId: string;
  /** The `<plugin>` of `cache/<marketplace>/<plugin>/<version>/`. */
  readonly cacheName: string;
  /** The manifest name (the entry name when there is no `plugin.json`): the components' namespace and the name conflicts compare. */
  readonly namespace: string;
}

/** The names of a plugin from its entry merge; a plugin that fails to load keeps its entry name, as it still has an id. */
export function pluginNames(merge: EntryMerge, marketplace: string): PluginNames {
  return {
    installId: `${merge.installName}@${marketplace}`,
    cacheName: merge.installName,
    namespace: merge.manifest?.name ?? merge.installName,
  };
}

export type PluginLookup =
  | { readonly entry: MarketplaceEntry }
  | { readonly notFound: PluginNotFound };

/**
 * Installing looks a plugin up by its entry name only: "When the two names differ and someone
 * installs by the manifest name, Claude Code reports `Plugin "<manifest-name>" not found in
 * marketplace "<marketplace>"`." The catalog is entries, so a manifest name never matches.
 */
export function lookupPlugin(
  entries: readonly MarketplaceEntry[],
  name: string,
  marketplace: string,
  refresh: { readonly done: boolean; readonly failure?: string },
): PluginLookup {
  const entry = entries.find((one) => one.name === name);
  return entry === undefined ? { notFound: pluginNotFound(name, marketplace, refresh) } : { entry };
}
