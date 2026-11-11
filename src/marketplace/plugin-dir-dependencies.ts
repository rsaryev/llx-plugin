import type { PluginIssue } from '../format/issues.ts';
import { type DependencyIssue, namesMarketplace, normalizeDependency } from './dependencies.ts';
import { checkDeclaredDependency, type CopyLookup, type GraphFacts } from './dependency-graph.ts';
import type { NormalizedDependency } from './types.ts';

/** A plugin a session loads with `--plugin-dir`: its name and its manifest's `dependencies`. */
export interface PluginDirPlugin {
  readonly name: string;
  readonly dependencies?: readonly unknown[] | undefined;
}

/** A `--plugin-dir` plugin that does not load, and the dependency issue that stops it. */
export interface UnloadedPlugin {
  readonly name: string;
  readonly issue: DependencyIssue;
}

const NO_FACTS: GraphFacts = { installed: [], enabled: {}, catalog: {}, allowlists: {} };

/** A `--plugin-dir` plugin is `<name>@inline`: its bare dependency names resolve there. */
const INLINE = 'inline';

const isDependency = (value: NormalizedDependency | PluginIssue): value is NormalizedDependency =>
  !('severity' in value);

function firstIssue(
  plugin: PluginDirPlugin,
  facts: GraphFacts,
  lookup: CopyLookup,
): DependencyIssue | undefined {
  for (const item of plugin.dependencies ?? []) {
    const dep = normalizeDependency(item, INLINE);
    if (!isDependency(dep)) continue;
    const issue = checkDeclaredDependency(dep, facts, {
      ...lookup,
      namesMarketplace: namesMarketplace(item),
    });
    if (issue !== undefined) return issue;
  }
  return undefined;
}

/** One pass: the plugins still loading that a dependency now stops. */
function pass(
  plugins: readonly PluginDirPlugin[],
  unloaded: ReadonlyMap<string, UnloadedPlugin>,
  facts: GraphFacts,
  lookup: CopyLookup,
): UnloadedPlugin[] {
  const loading = plugins.filter((plugin) => !unloaded.has(plugin.name));
  const copies = loading.map((plugin) => ({ name: plugin.name, enabled: true }));
  const withCopies = { ...facts, localCopies: [...(facts.localCopies ?? []), ...copies] };
  return loading.flatMap((plugin) => {
    const issue = firstIssue(plugin, withCopies, lookup);
    return issue === undefined ? [] : [{ name: plugin.name, issue }];
  });
}

/**
 * The `--plugin-dir` plugins of a session that do not load for a dependency (plugins/dependencies.md,
 * "Test a plugin and its dependency locally"): the session's other plugins are the local copies that
 * meet an entry, and a plugin "stops loading whenever the local copy is disabled or absent".
 * `facts` adds what is installed (an installed copy wins, `findDependencyCopy`). Judgments
 * (spec/judgments.md): oracle 2.1.319, a plugin that does not load is no copy, so a plugin that needs
 * it stops loading too; an entry `normalizeDependency` refuses is left to the manifest's validation.
 */
export function pluginDirDependencyIssues(
  plugins: readonly PluginDirPlugin[],
  facts: GraphFacts = NO_FACTS,
  lookup: CopyLookup = {},
): readonly UnloadedPlugin[] {
  const unloaded = new Map<string, UnloadedPlugin>();
  for (let found = pass(plugins, unloaded, facts, lookup); found.length > 0;) {
    for (const one of found) unloaded.set(one.name, one);
    found = pass(plugins, unloaded, facts, lookup);
  }
  return [...unloaded.values()];
}
