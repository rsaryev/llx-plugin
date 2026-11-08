import {
  isEnabled,
  isInstalled,
  closure,
  find,
  installCommand,
  quotedList,
  type Graph,
  type PluginNode,
} from './install-dependency-graph.ts';
import { SCOPE_PRECEDENCE, type ChosenScope } from './install-scopes.ts';

/**
 * Enabling a plugin and the dependencies it needs (plugins/install.md, "Plugins with dependencies";
 * plugins/cli-reference.md, "plugin enable"): "Claude Code also enables the plugin's dependencies
 * that are installed but disabled", and the command fails in three cases: a dependency that is not
 * installed (it prints the `claude plugin install` command for each), a dependency blocked by the
 * organization's plugin policy (it names the blocked dependency), and a dependency set to `false`
 * at a scope with higher precedence than the target scope ("Enable the dependency at that scope, or
 * pass `--scope` to write there").
 *
 * Judgments (spec/judgments.md): the wording of the missing and the overridden failures; the policy
 * failure is the docs' `Plugin "<name>" depends on "<dep>", which is blocked by your organization's
 * policy`; a failed plan changes nothing; when several cases hold, the message names the first in
 * the docs' order and every case is listed in its own field.
 */

export interface EnableOverride {
  /** The dependency. */
  readonly id: string;
  /** The higher-precedence scope that sets it to `false`. */
  readonly scope: ChosenScope;
}

export interface EnablePlan {
  readonly enable: readonly string[];
  readonly failure?: {
    /** Plugins that are not installed. */
    readonly missing: readonly string[];
    /** Dependencies the organization's plugin policy blocks. */
    readonly blocked: readonly string[];
    /** Dependencies set to `false` above the target scope. */
    readonly overridden: readonly EnableOverride[];
    readonly message: string;
    /** `claude plugin install` for each plugin that is missing. */
    readonly commands: readonly string[];
  };
}

const failure = (
  parts: Partial<NonNullable<EnablePlan['failure']>> & { readonly message: string },
): EnablePlan => ({
  enable: [],
  failure: { missing: [], blocked: [], overridden: [], commands: [], ...parts },
});

const missingFailure = (missing: readonly string[]): EnablePlan =>
  failure({
    missing,
    message:
      missing.length === 1
        ? `Dependency ${quotedList(missing)} is not installed. Install it first.`
        : `Dependencies ${quotedList(missing)} are not installed. Install them first.`,
    commands: missing.map(installCommand),
  });

/** The missing ones in the order the plugin declares them, then any found deeper. */
const dependencyOrder = (root: PluginNode, missing: readonly string[]): readonly string[] => [
  ...root.dependencies.filter((one) => missing.includes(one)),
  ...missing.filter((one) => !root.dependencies.includes(one)),
];

/** The scopes that take precedence over `scope`. */
const above = (scope: ChosenScope): readonly ChosenScope[] =>
  SCOPE_PRECEDENCE.slice(0, SCOPE_PRECEDENCE.indexOf(scope));

const overrideOf = (node: PluginNode, scope: ChosenScope): EnableOverride | undefined => {
  const higher = above(scope).find((one) => node.enabledIn[one] === false);
  return higher === undefined ? undefined : { id: node.id, scope: higher };
};

const overrideFailure = (root: string, override: EnableOverride, target: ChosenScope): EnablePlan =>
  failure({
    overridden: [override],
    message: `Plugin "${root}" depends on "${override.id}", which is disabled at ${override.scope} scope, which takes precedence over ${target}. Enable it at ${override.scope} scope, or pass --scope ${override.scope} to write there.`,
  });

/**
 * Enabling `id` at `scope`: the plugin and the dependencies of it that are installed but off, the
 * dependencies first, or the first failure the docs list.
 */
export function planEnable(id: string, scope: ChosenScope, graph: Graph): EnablePlan {
  const root = find(graph, id);
  if (root === undefined || !isInstalled(root)) {
    return failure({
      missing: [id],
      message: `Plugin "${id}" is not installed. Install it first.`,
      commands: [installCommand(id)],
    });
  }
  const { order, absent } = closure(graph, id);
  const needed = order.flatMap((one) => (one === id ? [] : (find(graph, one) ?? [])));
  const notInstalled = needed.filter((one) => !isInstalled(one)).map((one) => one.id);
  const missing = [...new Set([...absent, ...notInstalled])];
  if (missing.length > 0) return missingFailure(dependencyOrder(root, missing));
  const blocked = needed.find((one) => one.blockedByPolicy === true);
  if (blocked !== undefined) {
    return failure({
      blocked: [blocked.id],
      message: `Plugin "${id}" depends on "${blocked.id}", which is blocked by your organization's policy`,
    });
  }
  const override = needed.map((one) => overrideOf(one, scope)).find((one) => one !== undefined);
  if (override !== undefined) return overrideFailure(id, override, scope);
  return { enable: order.filter((one) => !isEnabled(find(graph, one) ?? root)) };
}
