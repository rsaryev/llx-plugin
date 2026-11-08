import type { ChosenScope, InstallScope } from './install-scopes.ts';
import { SCOPE_PRECEDENCE } from './install-scopes.ts';

/**
 * The graph of plugins the dependency plans work over (plugins/install.md, "Plugins with
 * dependencies"): what a host knows about each plugin, per scope. A node already names its
 * dependencies by id (`name@marketplace`); the declarations are read by `normalizeDependency`.
 */

export interface PluginNode {
  /** `name@marketplace`. */
  readonly id: string;
  /** Every scope the plugin is installed at; none when it is not installed. */
  readonly installedScopes: readonly InstallScope[];
  /** The `enabledPlugins` value of the plugin in each settings scope that lists it. */
  readonly enabledIn: Readonly<Partial<Record<ChosenScope, boolean>>>;
  /** The ids of its declared dependencies. */
  readonly dependencies: readonly string[];
  /** Installed as a dependency of another plugin rather than by the user. */
  readonly autoInstalled?: boolean;
  /** Managed settings (the organization's plugin policy) block the plugin. */
  readonly blockedByPolicy?: boolean;
  /** The author set `defaultEnabled: false`: the plugin is installed and stays off until turned on. */
  readonly defaultEnabled?: boolean;
}

export type Graph = readonly PluginNode[];

export const find = (graph: Graph, id: string): PluginNode | undefined =>
  graph.find((one) => one.id === id);

/** Installed at any scope. */
export const isInstalled = (node: PluginNode): boolean => node.installedScopes.length > 0;

export const isInstalledAt = (node: PluginNode, scope: InstallScope): boolean =>
  node.installedScopes.includes(scope);

/**
 * Whether the plugin is on: the value of the highest-precedence scope that lists it ("the local
 * setting overrides the project setting, and the project setting overrides the user setting"); a
 * plugin no scope lists is off.
 */
export const isEnabled = (node: PluginNode): boolean =>
  SCOPE_PRECEDENCE.map((scope) => node.enabledIn[scope]).find((value) => value !== undefined) ===
  true;

/** Postorder over the dependencies from `id`: each plugin after what it depends on, once; ids the graph lacks are `absent`. */
export function closure(
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

export const installCommand = (id: string): string => `claude plugin install ${id}`;
export const quotedList = (ids: readonly string[]): string => ids.map((id) => `"${id}"`).join(', ');
