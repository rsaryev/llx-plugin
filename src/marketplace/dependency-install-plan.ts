import { error, type PluginIssue } from '../format/issues.ts';
import { checkInstalledDependency, type DependencyIssue } from './dependencies.ts';
import {
  declaredOf,
  notListed,
  walkFrom,
  type LeftOut,
  type Node,
  type Walk,
} from './dependency-install-walk.ts';
import {
  combineRanges,
  resolveDependencyVersion,
  resolvedVersionLabel,
  type ResolvedVersion,
} from './dependency-tags.ts';
import {
  constraintsOn,
  effectiveEnabled,
  recordAt,
  type CatalogPlugin,
  type GraphFacts,
} from './dependency-graph.ts';
import type { InstallScope } from './install-scopes.ts';
import { satisfiesRange } from './semver.ts';
import type { NormalizedDependency } from './types.ts';

/**
 * The transitive install plan of a plugin's dependencies (plugins/install.md, "Plugins with
 * dependencies": "Claude Code also installs and enables the plugin's declared dependencies at the
 * same scope"; plugins/dependencies.md). Pure over `GraphFacts`: the plan says what to install, in
 * which order and at which version, or why nothing is installed; the host does it.
 */

/**
 * The operations that install any missing declared dependency (plugins/dependencies.md, "Constrain
 * a dependency that has a non-git source"): `claude plugin install`, `/reload-plugins`, auto-update
 * of the dependent plugin's marketplace, re-running `claude plugin install` on the dependent, and
 * `claude plugin marketplace add`. The docs give the five one behaviour, so the plan does not depend
 * on which runs (judgment, spec/judgments.md); the plan only names it, for the host's report.
 */
export const DEPENDENCY_INSTALL_OPERATIONS = [
  'install',
  'reload-plugins',
  'auto-update',
  'reinstall',
  'marketplace-add',
] as const;
export type DependencyInstallOperation = (typeof DEPENDENCY_INSTALL_OPERATIONS)[number];

export interface InstallRequest {
  /** The plugin whose dependencies are installed, `name@marketplace`: the one being installed, or an installed one whose dependencies are missing. */
  readonly root: string;
  readonly scope: InstallScope;
  readonly operation: DependencyInstallOperation;
  /** The Claude Code version being emulated, for what only newer versions do (a local copy meeting an entry that names a marketplace, from 2.1.242); absent means a current one. */
  readonly hostVersion?: string;
}

/** `install`: not installed; `enable`: installed and disabled; `update`: installed at a version the combined ranges rule out. */
export type StepAction = 'install' | 'enable' | 'update';

export interface InstallStep {
  /** `name@marketplace`. */
  readonly id: string;
  readonly action: StepAction;
  /** The plugins that declare it, the ones in this plan and the root. */
  readonly requiredBy: readonly string[];
  /** Every range that constrains it: the ones of this plan's plugins and of the installed plugins. */
  readonly ranges: readonly string[];
  /** What the ranges resolved against; absent for `enable`, which fetches nothing. */
  readonly resolution?: ResolvedVersion;
  /** The version `claude plugin list` shows (a tag's, with its 12-character commit suffix). */
  readonly version?: string;
  /** Range problems the fetched copy will have when the plugin loads (a current copy outside a range): the dependent stays disabled. */
  readonly loadIssues: readonly DependencyIssue[];
}

export interface InstallPlan {
  readonly operation: DependencyInstallOperation;
  /** Dependencies before the plugins that need them. Empty when `issues` is not. */
  readonly steps: readonly InstallStep[];
  readonly leftOut: readonly LeftOut[];
  /** Why the install is refused whole; nothing is installed or changed then. */
  readonly issues: readonly PluginIssue[];
  readonly ok: boolean;
}

/**
 * Every range on a dependency: this plan's plugins' and the installed ones'. A plugin the walk read
 * from the catalog (the root above all) speaks with its new declaration only: its installed range
 * is replaced, not combined ("publish a new version of your plugin with a wider constraint").
 */
const rangesFor = (id: string, node: Node, walk: Walk): readonly string[] => [
  ...new Set([
    ...node.ranges,
    ...constraintsOn(id, walk.facts)
      .filter((one) => !walk.walked.has(one.by))
      .map((one) => one.range),
  ]),
];

function actionFor(
  id: string,
  ranges: readonly string[],
  walk: Walk,
): { readonly action: StepAction } | undefined {
  const record = recordAt(id, walk.scope, walk.facts);
  if (record === undefined) return { action: 'install' };
  const fits = ranges.every(
    (range) => record.version !== undefined && satisfiesRange(record.version, range),
  );
  if (!fits) return { action: 'update' };
  return effectiveEnabled(id, walk.facts) === true ? undefined : { action: 'enable' };
}

const loadIssues = (
  dep: NormalizedDependency,
  resolution: ResolvedVersion,
  ranges: readonly string[],
): readonly DependencyIssue[] =>
  ranges.flatMap((range) => {
    const found = checkInstalledDependency(
      { ...dep, range },
      {
        enabled: true,
        ...(resolution.version === undefined ? {} : { version: resolution.version }),
      },
    );
    return found === undefined ? [] : [found];
  });

/** Whether a step changes the plugin's files: only `enable` does not, so it has nothing to resolve. */
const FETCHES: { readonly [A in StepAction]: boolean } = {
  install: true,
  enable: false,
  update: true,
};

interface Asked {
  readonly id: string;
  readonly action: StepAction;
  readonly node: Node;
  readonly ranges: readonly string[];
  readonly entry: CatalogPlugin;
}

/** The fetched step: what the ranges resolve against, the version it shows, and what will fail at load. */
function fetchStep(asked: Asked): InstallStep | PluginIssue {
  const { id, action, node, ranges, entry } = asked;
  const resolution = resolveDependencyVersion({
    dep: node.dep,
    ranges,
    source: entry.source,
    tags: entry.tags ?? [],
    ...(entry.currentCopyVersion === undefined
      ? {}
      : { currentCopyVersion: entry.currentCopyVersion }),
  });
  if ('severity' in resolution) return resolution;
  const commit = resolution.tag === undefined ? undefined : entry.tagCommits?.[resolution.tag];
  const version = resolvedVersionLabel(resolution, commit);
  return {
    id,
    action,
    requiredBy: [...new Set(node.requiredBy)],
    ranges,
    resolution,
    ...(version === undefined ? {} : { version }),
    loadIssues: loadIssues(node.dep, resolution, ranges),
  };
}

/** One step of the plan, or the issue that refuses the install, or nothing for a dependency already met. */
function stepFor(id: string, walk: Walk): InstallStep | PluginIssue | undefined {
  const node = walk.nodes.get(id);
  if (node === undefined) return undefined;
  const ranges = rangesFor(id, node, walk);
  const entry = walk.facts.catalog[id];
  const conflict =
    ranges.length > 1 ? combineRanges(ranges, entry?.tags ?? [], node.dep) : undefined;
  if (conflict !== undefined && 'severity' in conflict) return conflict;
  const planned = actionFor(id, ranges, walk);
  if (planned === undefined) return undefined;
  if (!FETCHES[planned.action]) {
    return { id, ...planned, requiredBy: [...new Set(node.requiredBy)], ranges, loadIssues: [] };
  }
  return entry === undefined ? notListed(id) : fetchStep({ id, ...planned, node, ranges, entry });
}

const isIssue = (value: InstallStep | PluginIssue | undefined): value is PluginIssue =>
  value !== undefined && 'severity' in value;

const isStep = (value: InstallStep | PluginIssue | undefined): value is InstallStep =>
  value !== undefined && !('severity' in value);

const idParts = (id: string): { readonly name: string; readonly marketplace: string } => {
  const at = id.indexOf('@');
  return at < 0
    ? { name: id, marketplace: '' }
    : { name: id.slice(0, at), marketplace: id.slice(at + 1) };
};

const refused = (
  request: InstallRequest,
  issues: readonly PluginIssue[],
  leftOut: readonly LeftOut[],
): InstallPlan => ({
  operation: request.operation,
  steps: [],
  leftOut,
  issues,
  ok: false,
});

/**
 * The plan that installs, enables or updates the dependencies of `request.root`, transitively and
 * dependencies first. Per dependency: one already installed, enabled and inside every range is met
 * and needs no step, though its own declared dependencies are still planned; installed and disabled is enabled; installed outside the combined ranges is
 * updated; otherwise installed from the catalog. Each step carries its reason (`requiredBy`), the
 * ranges and what they resolve against (plugins/dependencies.md, "How a constraint resolves
 * against tags", "Combine constraints from several plugins"). A dependency in another marketplace
 * follows `crossMarketplaceDecision` with the root plugin's marketplace as the root: one declared in
 * a marketplace entry refuses the install, one in `plugin.json` is left out; a `command` source and
 * a `headersHelper` entry are left to the user. A conflict between ranges, a range no tag in an own
 * repository meets, or a dependency its marketplace does not list refuses the whole plan:
 * `steps` is empty and nothing changes ("Plugin A and the dependency stay as they were").
 * Judgments (spec/judgments.md): the docs are silent on cycles and on depth, so each plugin is
 * planned once and the walk has no limit; a dependency left out does not fail the install; a plugin
 * read from the catalog (the root above all) replaces its installed ranges with its new ones.
 */
export function installClosure(request: InstallRequest, facts: GraphFacts): InstallPlan {
  const declared = declaredOf(request.root, facts);
  if (declared === undefined) {
    return refused(
      request,
      [
        error(
          `dependencies.${request.root}`,
          `Plugin "${request.root}" is not in the marketplace catalog`,
        ),
      ],
      [],
    );
  }
  const parts = idParts(request.root);
  const walk: Walk = {
    facts,
    scope: request.scope,
    root: request.root,
    rootMarketplace: facts.catalog[request.root]?.marketplace ?? parts.marketplace,
    ...(request.hostVersion === undefined ? {} : { hostVersion: request.hostVersion }),
    walked: new Set(),
    nodes: new Map(),
    order: [],
    leftOut: [],
    issues: [],
  };
  walkFrom({ id: request.root, ...parts }, declared, walk);
  const results = walk.order.map((id) => stepFor(id, walk));
  const failures = [...walk.issues, ...results.filter(isIssue)];
  if (failures.length > 0) return refused(request, failures, walk.leftOut);
  const steps = results.filter(isStep);
  return { operation: request.operation, steps, leftOut: walk.leftOut, issues: [], ok: true };
}
