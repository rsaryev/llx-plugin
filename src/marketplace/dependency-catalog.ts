import type { PluginIssue } from '../format/issues.ts';
import type { PluginDependency, PluginManifest } from '../format/manifest-schema.ts';
import type { MarketplaceEntry } from '../format/marketplace/types.ts';
import type { DeclaredIn } from './cross-marketplace.ts';
import { namesMarketplace, normalizeDependency } from './dependencies.ts';
import type { DeclaredDependency } from './dependency-graph.ts';

/**
 * The `dependencies` of a `CatalogPlugin`: its `plugin.json`'s, then its marketplace entry's, in the
 * order `mergeEntryWithManifest` lists them, each with where it was declared, since a refused
 * cross-marketplace dependency refuses the install when the entry declares it and is left out when
 * `plugin.json` does (plugins/dependencies.md, "Depend on a plugin from another marketplace").
 * Bare names resolve against `marketplace`, the declaring plugin's own (manifest-reference.md,
 * `dependencies`). `manifest` is `undefined` for a plugin with no `plugin.json`, whose entry is the
 * manifest, and for one not fetched yet (then the host also sets `manifestUnread`). An item that does
 * not read is an issue at its place in its list and is left out.
 */
export function catalogDependencies(
  entry: MarketplaceEntry,
  marketplace: string,
  manifest: PluginManifest | undefined,
): {
  readonly dependencies: readonly DeclaredDependency[];
  readonly issues: readonly PluginIssue[];
} {
  const lists: readonly (readonly [DeclaredIn, readonly PluginDependency[] | undefined])[] = [
    ['plugin.json', manifest?.dependencies],
    ['entry', entry.dependencies],
  ];
  const dependencies: DeclaredDependency[] = [];
  const issues: PluginIssue[] = [];
  for (const [declaredIn, items] of lists) {
    for (const [index, item] of (items ?? []).entries()) {
      const dep = normalizeDependency(item, marketplace, `dependencies[${index}]`);
      if ('severity' in dep) {
        issues.push(dep);
        continue;
      }
      dependencies.push({
        dep,
        declaredIn,
        ...(namesMarketplace(item) ? { namesMarketplace: true } : {}),
      });
    }
  }
  return { dependencies, issues };
}
