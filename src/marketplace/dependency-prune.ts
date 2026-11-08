import { dependencyId } from './dependencies.ts';
import { constraintsOn, type GraphFacts, type InstalledRecord } from './dependency-graph.ts';
import type { InstallScope } from './install-scopes.ts';

/**
 * Pruning and uninstalling (plugins/cli-reference.md, `plugin prune`: "Remove auto-installed
 * dependencies that no installed plugin needs anymore. The command never removes a plugin you
 * installed yourself"; `plugin uninstall --prune`: "Also remove auto-installed dependencies that no
 * remaining plugin needs"; plugins/install.md, "Plugins with dependencies": "auto-installed
 * dependencies stay until you run `claude plugin prune`"; plugins/dependencies.md, "Combine
 * constraints from several plugins": "When a user uninstalls the last plugin that constrains a
 * dependency, the dependency ... resumes tracking its marketplace entry"). Pure over `GraphFacts`.
 */

const atScope = (facts: GraphFacts, scope: InstallScope): readonly InstalledRecord[] =>
  facts.installed.filter((record) => record.scope === scope);

/** The ids reachable from `roots` through declared dependencies, among `records` only. */
function reachable(
  roots: readonly InstalledRecord[],
  records: readonly InstalledRecord[],
): ReadonlySet<string> {
  const byId = new Map(records.map((record) => [record.id, record]));
  const seen = new Set<string>();
  const pending = roots.map((record) => record.id);
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (seen.has(id)) continue;
    seen.add(id);
    const wanted = (byId.get(id)?.dependencies ?? []).map(dependencyId);
    pending.push(...wanted.filter((one) => !seen.has(one)));
  }
  return seen;
}

/**
 * The auto-installed plugins at `scope` that no remaining plugin needs, transitive orphans
 * included. A plugin the user installed is a root: never removed, and everything it needs, directly
 * or through other dependencies, stays. Judgment: only plugins installed at the same scope count as
 * needing, since a dependency is installed "at the same scope" as its dependent; a user-installed
 * plugin that is disabled still needs its dependencies (it is installed); dependencies that only
 * each other need are orphans.
 */
export function orphanedAutoInstalled(facts: GraphFacts, scope: InstallScope): readonly string[] {
  const records = atScope(facts, scope);
  const needed = reachable(
    records.filter((record) => record.autoInstalled !== true),
    records,
  );
  return records.filter((r) => r.autoInstalled === true && !needed.has(r.id)).map((r) => r.id);
}

/** The facts with one install removed. */
const withoutInstall = (facts: GraphFacts, id: string, scope: InstallScope): GraphFacts => ({
  ...facts,
  installed: facts.installed.filter((record) => record.id !== id || record.scope !== scope),
});

/** What prune shows and does, by the flags and the terminal (cli-reference.md, `plugin prune`). */
export interface PruneRun {
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  /** Both stdin and stdout are a terminal. */
  readonly tty: boolean;
}

export type PruneOutcome =
  | { readonly kind: 'nothing'; readonly message: string }
  | { readonly kind: 'listed'; readonly orphans: readonly string[]; readonly message: string }
  | { readonly kind: 'ask'; readonly orphans: readonly string[]; readonly prompt: string }
  | { readonly kind: 'refused'; readonly orphans: readonly string[]; readonly message: string }
  | { readonly kind: 'removed'; readonly orphans: readonly string[]; readonly message: string };

/**
 * `claude plugin prune` as a decision (cli-reference.md, `plugin prune`): with none to remove a line
 * that starts `Nothing to prune`; `--dry-run` lists them and ends `(dry run — nothing removed)`;
 * `-y` removes them and prints `Removed N auto-installed plugins: <names>`; an interactive terminal
 * without `-y` asks `Remove? [y/N]`; a pipe without `-y` lists them, prints
 * ``Not a TTY — run `claude plugin prune -y` to remove.`` and removes nothing.
 */
export function planPrune(facts: GraphFacts, scope: InstallScope, run: PruneRun): PruneOutcome {
  const orphans = orphanedAutoInstalled(facts, scope);
  if (orphans.length === 0) return { kind: 'nothing', message: 'Nothing to prune' };
  const list = orphans.join(', ');
  if (run.dryRun === true) {
    return { kind: 'listed', orphans, message: `${list}\n(dry run — nothing removed)` };
  }
  if (run.yes === true) {
    return {
      kind: 'removed',
      orphans,
      message: `Removed ${orphans.length} auto-installed plugins: ${list}`,
    };
  }
  if (run.tty) return { kind: 'ask', orphans, prompt: 'Remove? [y/N]' };
  return {
    kind: 'refused',
    orphans,
    message: `${list}\nNot a TTY — run \`claude plugin prune -y\` to remove.`,
  };
}

export interface UninstallPlan {
  /** The plugin removed from `scope`. */
  readonly remove: string;
  /** With `--prune`: the auto-installed dependencies no remaining plugin needs, removed with it. */
  readonly pruned: readonly string[];
  /**
   * The dependencies the plugin constrained that no other installed plugin constrains any more:
   * each resumes tracking its marketplace entry on the next update.
   */
  readonly released: readonly string[];
}

/** The dependencies `id` put a range on that nobody else still does once it is gone. */
function released(id: string, facts: GraphFacts, after: GraphFacts): readonly string[] {
  const own = facts.installed
    .filter((record) => record.id === id)
    .flatMap((record) => record.dependencies)
    .filter((dep) => dep.range !== undefined)
    .map(dependencyId);
  return [...new Set(own)].filter(
    (dependency) =>
      constraintsOn(dependency, facts).length > 0 && constraintsOn(dependency, after).length === 0,
  );
}

/**
 * `claude plugin uninstall <id> [--prune]` as a decision: the plugin goes; its auto-installed
 * dependencies stay unless `prune` is set, then those no remaining plugin needs go too (transitive
 * ones included). Judgment: uninstalling a plugin other plugins depend on is not refused, since the
 * docs state no such check for uninstall (they do for disable); the dependents then fail to load
 * with `is not installed`.
 */
export function planUninstall(
  id: string,
  scope: InstallScope,
  facts: GraphFacts,
  prune: boolean,
): UninstallPlan {
  const afterOne = withoutInstall(facts, id, scope);
  const pruned = prune ? orphanedAutoInstalled(afterOne, scope) : [];
  const after = pruned.reduce((so, one) => withoutInstall(so, one, scope), afterOne);
  const gone = new Set([id, ...pruned]);
  const freed = [id, ...pruned].flatMap((one) => released(one, facts, after));
  return { remove: id, pruned, released: [...new Set(freed)].filter((one) => !gone.has(one)) };
}
