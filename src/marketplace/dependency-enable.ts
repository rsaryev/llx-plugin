import { error, type PluginIssue } from '../format/issues.ts';
import { dependencyId } from './dependencies.ts';
import {
  SCOPES_BY_PRECEDENCE,
  dependenciesOf,
  effectiveEnabled,
  recordsOf,
  type GraphFacts,
} from './dependency-graph.ts';
import type { InstallScope } from './install-scopes.ts';

/**
 * Enabling a plugin that declares dependencies (plugins/install.md, "Plugins with dependencies":
 * "Claude Code also enables the plugin's dependencies that are installed but disabled. If a declared
 * dependency isn't installed, the enable fails and the message tells you to install it first";
 * plugins/cli-reference.md, `plugin enable`: the three ways it fails). Pure: the host writes the
 * settings the plan names.
 */

/** Why a dependency stops an enable. */
export type EnableBlock = 'not-installed' | 'policy-blocked' | 'disabled-at-higher-scope';

/** One dependency that stops the enable, with what the user can do about it. */
export interface EnableIssue extends PluginIssue {
  readonly block: EnableBlock;
  /** The dependency's id. */
  readonly dependency: string;
  /** `not-installed`: the `claude plugin install` command for it. */
  readonly command?: string;
  /** `disabled-at-higher-scope`: the scope that holds the `false`, where to enable it or to pass as `--scope`. */
  readonly scope?: InstallScope;
}

export interface EnablePlan {
  readonly ok: boolean;
  /** The dependencies to enable (installed but disabled), each after its own dependencies. */
  readonly enable: readonly string[];
  /** Every dependency that stops the enable; nothing is enabled when there is one. */
  readonly issues: readonly EnableIssue[];
}

const issueAt = (
  dependency: string,
  block: EnableBlock,
  message: string,
  extra: { readonly command?: string; readonly scope?: InstallScope } = {},
): EnableIssue => ({
  ...error(`dependencies.${dependency}`, message),
  block,
  dependency,
  ...extra,
});

/** The scope that holds a `false` for the dependency and wins over `target`, if there is one. */
const overriddenAbove = (
  dependency: string,
  target: InstallScope,
  facts: GraphFacts,
): InstallScope | undefined => {
  const above = SCOPES_BY_PRECEDENCE.slice(0, SCOPES_BY_PRECEDENCE.indexOf(target));
  return above.find((scope) => facts.enabled[scope]?.[dependency] === false);
};

/** What stops one dependency from being enabled at `target`, or `undefined`. */
function blockOf(
  dependency: string,
  target: InstallScope,
  facts: GraphFacts,
): EnableIssue | undefined {
  if (facts.blocked?.has(dependency) === true) {
    return issueAt(
      dependency,
      'policy-blocked',
      `Dependency "${dependency}" is blocked by your organization's plugin policy`,
    );
  }
  if (recordsOf(dependency, facts).length === 0) {
    const command = `claude plugin install ${dependency}`;
    return issueAt(
      dependency,
      'not-installed',
      `Dependency "${dependency}" is not installed; install it first: ${command}`,
      { command },
    );
  }
  const scope = overriddenAbove(dependency, target, facts);
  return scope === undefined
    ? undefined
    : issueAt(
        dependency,
        'disabled-at-higher-scope',
        `Dependency "${dependency}" is set to false at ${scope} scope, which takes precedence over ${target}; enable it at ${scope} scope or pass --scope ${scope}`,
        { scope },
      );
}

interface Walk {
  readonly target: InstallScope;
  readonly facts: GraphFacts;
  readonly seen: Set<string>;
  readonly enable: string[];
  readonly issues: EnableIssue[];
}

function visit(id: string, walk: Walk): void {
  for (const dep of dependenciesOf(id, walk.facts)) {
    const dependency = dependencyId(dep);
    if (walk.seen.has(dependency)) continue;
    walk.seen.add(dependency);
    const block = blockOf(dependency, walk.target, walk.facts);
    if (block !== undefined) {
      walk.issues.push(block);
      continue;
    }
    visit(dependency, walk);
    if (effectiveEnabled(dependency, walk.facts) !== true) walk.enable.push(dependency);
  }
}

/**
 * What enabling `id` at `target` does to its dependencies, transitively: the ones installed but
 * disabled are enabled, dependencies first; a dependency that is not installed, is blocked by the
 * plugin policy or is `false` at a scope that wins over `target` fails the enable (and so enables
 * nothing). Judgment: the cascade follows dependencies of dependencies, which the docs imply by
 * "the plugin's dependencies" being enabled so that the plugin loads; a dependency already enabled
 * by a winning scope is left alone, and one installed at any scope counts as installed.
 */
export function enablePlan(id: string, target: InstallScope, facts: GraphFacts): EnablePlan {
  const walk: Walk = { target, facts, seen: new Set([id]), enable: [], issues: [] };
  visit(id, walk);
  const ok = walk.issues.length === 0;
  return { ok, enable: ok ? walk.enable : [], issues: walk.issues };
}
