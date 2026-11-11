import type { PluginIssue } from '../format/issues.ts';
import { namesMarketplace, normalizeDependency } from '../marketplace/dependencies.ts';
import type { DependencyIssue } from '../marketplace/dependencies.ts';
import { checkDeclaredDependency, type GraphFacts } from '../marketplace/dependency-graph.ts';
import type { NormalizedDependency } from '../marketplace/types.ts';
import type { PluginRun } from './plugin-set.ts';
import type { HostedPlugin, HostPlugin } from './types.ts';

/**
 * Which plugins stay off for a dependency (plugins/troubleshooting.md, "Dependency errors": "Claude
 * Code keeps the affected plugin disabled until you resolve it"; plugins/dependencies.md, "Test a
 * plugin and its dependency locally"). The plugins given are what is installed or loaded for the
 * session: one that runs is a copy that meets an entry, one given with `enabled: false` is a
 * disabled copy (`is disabled — enable it or remove the dependency`), one not given is
 * `is not installed`. A `<name>@inline` plugin is the `--plugin-dir` copy (no range checked); any
 * other is installed under its id. Oracle 2.1.322 (spec/judgments.md): with `b@mk` uninstalled or
 * set to `false`, the enabled `a@mk` that depends on it loads nothing, and a plugin that does not
 * load meets no entry, so what needs it stops too (oracle 2.1.319 for `--plugin-dir`).
 */

const INLINE = 'inline';

const isDependency = (value: NormalizedDependency | PluginIssue): value is NormalizedDependency =>
  !('severity' in value);

/** The marketplace a bare dependency name resolves to: the declaring plugin's own (`inline` for a `--plugin-dir` one). */
const marketplaceOf = (id: string): string | undefined => {
  const at = id.lastIndexOf('@');
  return at < 0 ? undefined : id.slice(at + 1);
};

const declares = (run: PluginRun): boolean =>
  run.enabled && (run.entry.plugin.manifest?.dependencies?.length ?? 0) > 0;

const versionOf = (run: PluginRun): { readonly version?: string } => {
  const version = run.entry.plugin.manifest?.version;
  return typeof version === 'string' ? { version } : {};
};

/** The plugins given as the facts a declared dependency is checked against. */
function factsOf(runs: readonly PluginRun[]): GraphFacts {
  const local = runs.filter((run) => marketplaceOf(run.entry.id) === INLINE);
  const installed = runs.filter((run) => marketplaceOf(run.entry.id) !== INLINE);
  return {
    installed: installed.map((run) => ({
      id: run.entry.id,
      scope: 'user',
      dependencies: [],
      ...versionOf(run),
    })),
    enabled: { user: Object.fromEntries(installed.map((run) => [run.entry.id, run.enabled])) },
    catalog: {},
    allowlists: {},
    localCopies: local.map((run) => ({
      name: run.entry.plugin.name,
      enabled: run.enabled,
      ...versionOf(run),
    })),
  };
}

function firstIssue(run: PluginRun, facts: GraphFacts): DependencyIssue | undefined {
  const declared = run.entry.plugin.manifest?.dependencies ?? [];
  for (const item of declared) {
    const dep = normalizeDependency(item, marketplaceOf(run.entry.id));
    if (!isDependency(dep)) continue;
    const issue = checkDeclaredDependency(dep, facts, { namesMarketplace: namesMarketplace(item) });
    if (issue !== undefined) return issue;
  }
  return undefined;
}

/** The runs with every plugin whose dependency is not met turned off, and one error per such plugin under its id. */
export function withDependencies(runs: readonly PluginRun[]): {
  readonly runs: readonly PluginRun[];
  readonly issues: readonly DependencyIssue[];
} {
  let current = runs;
  const issues: DependencyIssue[] = [];
  if (!runs.some(declares)) return { runs, issues };
  for (;;) {
    const facts = factsOf(current);
    const stopped = new Map<string, DependencyIssue>();
    for (const run of current) {
      const issue = declares(run) ? firstIssue(run, facts) : undefined;
      if (issue !== undefined) stopped.set(run.entry.id, issue);
    }
    if (stopped.size === 0) return { runs: current, issues };
    for (const [id, issue] of stopped) issues.push({ ...issue, path: id });
    current = current.map((run) => (stopped.has(run.entry.id) ? { ...run, enabled: false } : run));
  }
}

/**
 * The load-time dependency verdict without a host or a session (docs/API.md, "Host and sessions"):
 * each plugin given with whether it is on, and back whether it runs once every plugin whose
 * dependency is not met is off, transitively, with one error per such plugin under its id (the
 * `errorType` of `claude plugin list --json`). A host gives every installed plugin, a disabled one
 * with `enabled: false`; one not given reads as not installed. The sessions use the same verdict.
 */
export function pluginsWithDependencies(
  plugins: readonly Required<Pick<HostPlugin, 'id' | 'plugin' | 'enabled'>>[],
): { readonly plugins: readonly HostedPlugin[]; readonly issues: readonly DependencyIssue[] } {
  const verdict = withDependencies(
    plugins.map(({ id, plugin, enabled }) => ({ entry: { id, plugin }, enabled })),
  );
  return {
    plugins: verdict.runs.map(({ entry, enabled }) => ({
      id: entry.id,
      name: entry.plugin.name,
      enabled,
    })),
    issues: verdict.issues,
  };
}
