import { error, type PluginIssue } from '../format/issues.ts';
import { checkInstalledDependency } from './dependencies.ts';
import type { ChosenScope } from './install-scopes.ts';

/**
 * What installing, enabling, disabling and uninstalling a plugin does to the plugins it depends on
 * (plugins/install.md, "Plugins with dependencies"; plugins/cli-reference.md, "plugin enable",
 * "plugin disable", "plugin prune"): plans over the graph of plugins a host knows, pure. The
 * declarations are read by `normalizeDependency`, and whether one is met by `checkInstalledDependency`;
 * a graph node already names its dependencies by id (`name@marketplace`).
 *
 * Judgments (spec/judgments.md): the wording the docs describe without quoting (the install line's
 * list of dependencies, the enable failure and the disable refusal); dependents are disabled
 * farthest first; a refused or failed plan changes nothing.
 */

export interface PluginNode {
  /** `name@marketplace`. */
  readonly id: string;
  readonly installed: boolean;
  readonly enabled: boolean;
  /** The ids of its declared dependencies. */
  readonly dependencies: readonly string[];
  /** Installed as a dependency of another plugin rather than by the user. */
  readonly autoInstalled?: boolean;
}

type Graph = readonly PluginNode[];

const find = (graph: Graph, id: string): PluginNode | undefined =>
  graph.find((one) => one.id === id);

/** Postorder over the dependencies from `id`: each plugin after what it depends on, once; ids the graph lacks are `absent`. */
function closure(
  graph: Graph,
  id: string,
): { readonly order: string[]; readonly absent: string[] } {
  const seen = new Set<string>();
  const order: string[] = [];
  const absent: string[] = [];
  const walk = (current: string): void => {
    if (seen.has(current)) return;
    seen.add(current);
    const one = find(graph, current);
    if (one === undefined) {
      absent.push(current);
      return;
    }
    one.dependencies.forEach(walk);
    order.push(current);
  };
  walk(id);
  return { order, absent };
}

const dependencyOf = (id: string): { readonly name: string; readonly marketplace?: string } => {
  const at = id.indexOf('@');
  return at < 0 ? { name: id } : { name: id.slice(0, at), marketplace: id.slice(at + 1) };
};

const installCommand = (id: string): string => `claude plugin install ${id}`;
const quotedList = (ids: readonly string[]): string => ids.map((id) => `"${id}"`).join(', ');

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
 * scope. The success message lists them."
 */
export function planInstall(id: string, scope: ChosenScope, graph: Graph): InstallPlan {
  const { order, absent } = closure(graph, id);
  const empty = { install: [], enable: [], autoInstalled: [], scope } as const;
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
  const install = nodes.filter((one) => !one.installed).map((one) => one.id);
  const autoInstalled = install.filter((one) => one !== id);
  const list =
    autoInstalled.length === 0
      ? ''
      : ` (+ ${autoInstalled.length} dependencies: ${autoInstalled.join(', ')})`;
  return {
    install,
    enable: nodes.filter((one) => !one.installed || !one.enabled).map((one) => one.id),
    autoInstalled,
    scope,
    message: `Successfully installed plugin: ${id} (scope: ${scope})${list}`,
  };
}

// ---- enable ----

export interface EnablePlan {
  readonly enable: readonly string[];
  readonly failure?: {
    readonly missing: readonly string[];
    readonly message: string;
    /** `claude plugin install` for each plugin that is missing. */
    readonly commands: readonly string[];
  };
}

const missingFailure = (missing: readonly string[]): EnablePlan => ({
  enable: [],
  failure: {
    missing,
    message:
      missing.length === 1
        ? `Dependency ${quotedList(missing)} is not installed. Install it first.`
        : `Dependencies ${quotedList(missing)} are not installed. Install them first.`,
    commands: missing.map(installCommand),
  },
});

/**
 * "Enable: Claude Code also enables the plugin's dependencies that are installed but disabled. If a
 * declared dependency isn't installed, the enable fails and the message tells you to install it
 * first": the command prints `claude plugin install` for each one that is missing.
 */
export function planEnable(id: string, graph: Graph): EnablePlan {
  const root = find(graph, id);
  if (root === undefined || !root.installed) {
    return {
      enable: [],
      failure: {
        missing: [id],
        message: `Plugin "${id}" is not installed. Install it first.`,
        commands: [installCommand(id)],
      },
    };
  }
  const { order, absent } = closure(graph, id);
  const notInstalled = order.filter((one) => find(graph, one)?.installed !== true);
  const missing = [...new Set([...absent, ...notInstalled])];
  if (missing.length > 0) return missingFailure(dependencyOrder(root, missing));
  return { enable: order.filter((one) => find(graph, one)?.enabled === false) };
}

/** The missing ones in the order the plugin declares them, then any found deeper. */
const dependencyOrder = (root: PluginNode, missing: readonly string[]): readonly string[] => [
  ...root.dependencies.filter((one) => missing.includes(one)),
  ...missing.filter((one) => !root.dependencies.includes(one)),
];

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
        one.enabled &&
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
  graph.filter((one) => one.installed && one.autoInstalled !== true).forEach((one) => mark(one.id));
  return graph
    .filter((one) => one.installed && one.autoInstalled === true && !needed.has(one.id))
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
    .filter((one) => find(graph, one)?.installed === true);
  const remaining = graph.filter((one) => one.id !== id);
  return {
    uninstall: [id],
    keptDependencies: kept,
    orphaned: planPrune(remaining).filter((one) => kept.includes(one)),
    pruneCommand: 'claude plugin prune',
  };
}
