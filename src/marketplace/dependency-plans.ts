import { error, type PluginIssue } from '../format/issues.ts';
import { checkInstalledDependency } from './dependencies.ts';
import {
  closure,
  find,
  isEnabled,
  isInstalled,
  isInstalledAt,
  quotedList,
  type Graph,
} from './dependency-graph.ts';
import { alreadyInstalledAtScope } from './install-errors.ts';
import type { ChosenScope } from './install-scopes.ts';

/**
 * What installing, disabling and uninstalling a plugin does to the plugins it depends on
 * (plugins/install.md, "Plugins with dependencies"; plugins/cli-reference.md, "plugin install",
 * "plugin disable", "plugin prune"): plans over the graph of plugins a host knows, pure; enabling is
 * `dependency-enable.ts`. The declarations are read by `normalizeDependency`, and whether one is met
 * by `checkInstalledDependency`.
 *
 * Judgments (spec/judgments.md): the wording the docs describe without quoting (the install line's
 * list of dependencies, the disable refusal); dependents are disabled farthest first; a refused or
 * failed plan changes nothing; a dependency installed at another scope is installed again at the
 * target scope, since the docs install "at the same scope".
 */

const dependencyOf = (id: string): { readonly name: string; readonly marketplace?: string } => {
  const at = id.indexOf('@');
  return at < 0 ? { name: id } : { name: id.slice(0, at), marketplace: id.slice(at + 1) };
};

// ---- install ----

export interface InstallPlan {
  /** To install, dependencies first. */
  readonly install: readonly string[];
  /** To switch on: the new plugins and the dependencies that were installed but disabled. */
  readonly enable: readonly string[];
  /** The dependencies this install brings in, which `claude plugin prune` can later remove. */
  readonly autoInstalled: readonly string[];
  readonly scope: ChosenScope;
  readonly message?: string;
  /** A declared dependency the catalog does not list: the install changes nothing. */
  readonly refused?: PluginIssue;
}

/**
 * "Install: Claude Code also installs and enables the plugin's declared dependencies at the same
 * scope. The success message lists them." Each plugin is installed and enabled at the target scope
 * when it is not already, so a dependency that exists only at another scope is installed here too.
 * A plugin whose author set `defaultEnabled: false` "is installed but stays off until you turn it
 * on" (install.md, "Choose an install scope"), so it is installed and not in `enable`; a dependency is
 * enabled whatever its own default, since the plugin that needs it would not work otherwise
 * (judgment). A plugin already installed at the scope prints `Plugin "<id>" is already installed (scope:
 * <scope>)` and changes nothing (cli-reference.md, "plugin install").
 */
export function planInstall(id: string, scope: ChosenScope, graph: Graph): InstallPlan {
  const empty = { install: [], enable: [], autoInstalled: [], scope } as const;
  const root = find(graph, id);
  if (root !== undefined && isInstalledAt(root, scope)) {
    return { ...empty, message: alreadyInstalledAtScope(id, scope) };
  }
  const { order, absent } = closure(graph, id);
  const [first] = absent;
  if (first !== undefined) {
    const refused =
      first === id
        ? error('plugin', `Plugin "${id}" not found in any marketplace`)
        : (checkInstalledDependency(dependencyOf(first), undefined) ??
          error('dependencies', `Dependency "${first}" is not installed`));
    return { ...empty, refused };
  }
  const nodes = order.flatMap((one) => find(graph, one) ?? []);
  const install = nodes.filter((one) => !isInstalledAt(one, scope)).map((one) => one.id);
  const autoInstalled = install.filter((one) => one !== id);
  const list =
    autoInstalled.length === 0
      ? ''
      : ` (+ ${autoInstalled.length} dependencies: ${autoInstalled.join(', ')})`;
  return {
    install,
    enable: nodes
      .filter((one) => !isInstalledAt(one, scope) || one.enabledIn[scope] !== true)
      .filter((one) => !(one.id === id && one.defaultEnabled === false))
      .map((one) => one.id),
    autoInstalled,
    scope,
    message: `Successfully installed plugin: ${id} (scope: ${scope})${list}`,
  };
}

// ---- disable ----

export interface DisablePlan {
  readonly disable: readonly string[];
  readonly refusal?: {
    /** The enabled plugins that still need it, farthest first. */
    readonly dependents: readonly string[];
    readonly message: string;
    /** One chained command that disables them and then the plugin, in the right order. */
    readonly command: string;
  };
}

/** The enabled plugins that need `id`, directly or through other enabled ones, with their distance from it. */
function dependentsOf(
  graph: Graph,
  id: string,
): readonly { readonly id: string; readonly distance: number }[] {
  const found: { id: string; distance: number }[] = [];
  let frontier = [id];
  for (let distance = 1; frontier.length > 0; distance += 1) {
    const next = graph.filter(
      (one) =>
        isEnabled(one) &&
        one.id !== id &&
        !found.some((seen) => seen.id === one.id) &&
        one.dependencies.some((dep) => frontier.includes(dep)),
    );
    found.push(...next.map((one) => ({ id: one.id, distance })));
    frontier = next.map((one) => one.id);
  }
  return found;
}

/**
 * "Disable: when another enabled plugin still needs the one you named, Claude Code refuses and
 * prints a chained command that disables both in the right order": the plugins that need it go
 * first, the farthest first, and the one you named last.
 */
export function planDisable(id: string, graph: Graph): DisablePlan {
  const dependents = dependentsOf(graph, id)
    .toSorted((a, b) => b.distance - a.distance)
    .map((one) => one.id);
  if (dependents.length === 0) return { disable: [id] };
  const verb = dependents.length === 1 ? 'still needs' : 'still need';
  return {
    disable: [],
    refusal: {
      dependents,
      message: `Cannot disable "${id}": ${quotedList(dependents)} ${verb} it.`,
      command: [...dependents, id].map((one) => `claude plugin disable ${one}`).join(' && '),
    },
  };
}

// ---- uninstall and prune ----

/**
 * The auto-installed plugins no installed plugin needs any more: `claude plugin prune` removes them
 * and "never removes a plugin you installed yourself". A plugin is needed when one you installed
 * yourself reaches it through dependencies.
 */
export function planPrune(graph: Graph): readonly string[] {
  const needed = new Set<string>();
  const mark = (id: string): void => {
    if (needed.has(id)) return;
    needed.add(id);
    find(graph, id)?.dependencies.forEach(mark);
  };
  graph
    .filter((one) => isInstalled(one) && one.autoInstalled !== true)
    .forEach((one) => mark(one.id));
  return graph
    .filter((one) => isInstalled(one) && one.autoInstalled === true && !needed.has(one.id))
    .map((one) => one.id);
}

export interface UninstallPlan {
  readonly uninstall: readonly string[];
  /** Its installed dependencies: they stay. */
  readonly keptDependencies: readonly string[];
  /** The auto-installed ones among them that nothing left needs: `claude plugin prune` removes them. */
  readonly orphaned: readonly string[];
  readonly pruneCommand: string;
}

/**
 * "Uninstall: auto-installed dependencies stay until you run `claude plugin prune` in your shell."
 */
export function planUninstall(id: string, graph: Graph): UninstallPlan {
  const kept = closure(graph, id)
    .order.filter((one) => one !== id)
    .filter((one) => {
      const node = find(graph, one);
      return node !== undefined && isInstalled(node);
    });
  const remaining = graph.filter((one) => one.id !== id);
  return {
    uninstall: [id],
    keptDependencies: kept,
    orphaned: planPrune(remaining).filter((one) => kept.includes(one)),
    pruneCommand: 'claude plugin prune',
  };
}
