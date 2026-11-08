import { error, type PluginIssue } from '../format/issues.ts';
import type { PluginSourceKind } from '../format/marketplace/types.ts';
import { crossMarketplaceDecision } from './cross-marketplace.ts';
import { dependencyId } from './dependencies.ts';
import {
  dependenciesOf,
  localCopyOf,
  recordAt,
  type CatalogPlugin,
  type CopyLookup,
  type DeclaredDependency,
  type GraphFacts,
} from './dependency-graph.ts';
import type { InstallScope } from './install-scopes.ts';
import type { NormalizedDependency } from './types.ts';

/**
 * The walk over a plugin's declared dependencies that `installClosure` plans from
 * (plugins/dependencies.md, "Depend on a plugin from another marketplace", "Constrain a dependency
 * that has a non-git source"): it collects every dependency with everyone who asks for it and every
 * range on it, depth first, and leaves out what Claude Code does not install.
 */

/** Why Claude Code does not install a dependency itself. */
export type LeftOutReason = 'command-source' | 'headers-helper' | 'cross-marketplace';

/** A dependency the install leaves out; the dependent then fails to load until the user acts. */
export interface LeftOut {
  readonly id: string;
  readonly reason: LeftOutReason;
  readonly message: string;
  /** What the user runs first, when there is something. */
  readonly command?: string;
}

/** Node of the walk: one dependency id with everything that asks for it. */
export interface Node {
  readonly dep: NormalizedDependency;
  readonly requiredBy: string[];
  readonly ranges: string[];
}

export interface Parent {
  readonly id: string;
  readonly name: string;
  readonly marketplace: string;
}

export interface Walk {
  readonly facts: GraphFacts;
  readonly scope: InstallScope;
  /** The plugin whose dependencies are walked: a cycle back to it ends there. */
  readonly root: string;
  readonly rootMarketplace: string;
  /** The Claude Code version being emulated; absent means a current one (see `CopyLookup`). */
  readonly hostVersion?: string;
  /** The plugins whose declarations were read: their installed constraints are replaced by what was read. */
  readonly walked: Set<string>;
  readonly nodes: Map<string, Node>;
  /** Ids to act on or check, dependencies first. */
  readonly order: string[];
  readonly leftOut: LeftOut[];
  readonly issues: PluginIssue[];
}

/** Which source kinds Claude Code never installs as a dependency (a registry typed over the kinds). */
const NEVER_INSTALLED: { readonly [K in PluginSourceKind]: LeftOutReason | undefined } = {
  relative: undefined,
  github: undefined,
  url: undefined,
  'git-subdir': undefined,
  npm: undefined,
  archive: undefined,
  command: 'command-source',
};

const LEFT_TEXT: { readonly [R in LeftOutReason]: string } = {
  'command-source': 'has a command source, which Claude Code never installs as a dependency',
  'headers-helper': 'has a headersHelper, which Claude Code never runs for a dependency',
  'cross-marketplace': 'is in another marketplace that is not allowed',
};

/** A `headersHelper` wins over the source, as in the updates module. */
const leftReason = (entry: CatalogPlugin): LeftOutReason | undefined =>
  entry.headersHelper === undefined ? NEVER_INSTALLED[entry.source.kind] : 'headers-helper';

const leave = (id: string, reason: LeftOutReason, message?: string): LeftOut => {
  const command = `claude plugin install ${id}`;
  const user = reason !== 'cross-marketplace';
  return {
    id,
    reason,
    message: message ?? `Dependency "${id}" ${LEFT_TEXT[reason]}; install it first: ${command}`,
    ...(user ? { command } : {}),
  };
};

export const notListed = (id: string): PluginIssue =>
  error(
    `dependencies.${id}`,
    `Dependency "${id}" is not installed and its marketplace does not list it`,
  );

const nodeFor = (walk: Walk, dep: NormalizedDependency, by: string): Node => {
  const id = dependencyId(dep);
  const node = walk.nodes.get(id) ?? { dep, requiredBy: [], ranges: [] };
  walk.nodes.set(id, node);
  node.requiredBy.push(by);
  if (dep.range !== undefined) node.ranges.push(dep.range);
  return node;
};

export const declaredOf = (
  id: string,
  facts: GraphFacts,
): readonly DeclaredDependency[] | undefined => {
  const entry = facts.catalog[id];
  if (entry !== undefined) return entry.dependencies;
  const installed = facts.installed.some((record) => record.id === id);
  return installed
    ? dependenciesOf(id, facts).map((dep) => ({ dep, declaredIn: 'plugin.json' as const }))
    : undefined;
};

/** What the walk does with a dependency: walk into its declared dependencies, or leave it out (`undefined`). */
type Children = readonly DeclaredDependency[] | undefined;

/** The allowlist (plugins/dependencies.md, "Depend on a plugin from another marketplace"); a refusal is recorded as the declaration decides. */
function crossAllowed(
  dep: NormalizedDependency,
  declaredIn: DeclaredDependency['declaredIn'],
  parent: Parent,
  walk: Walk,
): boolean {
  const id = dependencyId(dep);
  const enabledAtScope = new Set(
    walk.facts.installed
      .filter(
        (one) => one.scope === walk.scope && walk.facts.enabled[walk.scope]?.[one.id] === true,
      )
      .map((one) => one.id),
  );
  const decision = crossMarketplaceDecision({
    dep,
    requiredBy: { name: parent.name, marketplace: parent.marketplace },
    root: {
      name: walk.rootMarketplace,
      allowCrossMarketplaceDependenciesOn: walk.facts.allowlists[walk.rootMarketplace] ?? [],
    },
    enabledAtScope,
    declaredIn,
  });
  if (decision.allowed) return true;
  if (decision.effect === 'refuse-install') {
    walk.issues.push(error(`dependencies.${id}`, decision.message));
  } else {
    walk.leftOut.push(leave(id, 'cross-marketplace', decision.message));
  }
  return false;
}

/** A dependency to install: the catalog must list it, and Claude Code must be willing to install it. */
function fromCatalog(id: string, walk: Walk): Children {
  const entry = walk.facts.catalog[id];
  if (entry === undefined) {
    walk.issues.push(notListed(id));
    return undefined;
  }
  const reason = leftReason(entry);
  if (reason === undefined) return entry.dependencies;
  walk.leftOut.push(leave(id, reason));
  return undefined;
}

/** Where a `--plugin-dir` copy meets this entry: the emulated host version and whether the entry names a marketplace. */
const copyLookup = (declared: DeclaredDependency, walk: Walk): CopyLookup => ({
  ...(walk.hostVersion === undefined ? {} : { hostVersion: walk.hostVersion }),
  ...(declared.namesMarketplace === true ? { namesMarketplace: true } : {}),
});

const hasLocalCopy = (declared: DeclaredDependency, walk: Walk): boolean =>
  localCopyOf(declared.dep, walk.facts, copyLookup(declared, walk)) !== undefined;

/**
 * What the walk does with one declared dependency. One installed and enabled at the scope (its own
 * `enabledPlugins` says so: another scope's value does not count) is met: it
 * gets no step, but its own declared dependencies are walked, since a re-run installs "any missing
 * declared dependency" (plugins/dependencies.md, "Constrain a dependency that has a non-git
 * source").
 */
function childrenOf(declared: DeclaredDependency, parent: Parent, walk: Walk): Children {
  const { dep, declaredIn } = declared;
  const id = dependencyId(dep);
  const record = recordAt(id, walk.scope, walk.facts);
  if (record !== undefined && walk.facts.enabled[walk.scope]?.[id] === true) {
    return declaredOf(id, walk.facts) ?? [];
  }
  if (record === undefined && hasLocalCopy(declared, walk)) return undefined;
  if (!crossAllowed(dep, declaredIn, parent, walk)) return undefined;
  return record === undefined ? fromCatalog(id, walk) : declaredOf(id, walk.facts);
}

/** Depth-first over declared dependencies, those of a met dependency too; a dependency met again only adds its asker and range, so a cycle ends. */
export function walkFrom(
  parent: Parent,
  declared: readonly DeclaredDependency[],
  walk: Walk,
): void {
  walk.walked.add(parent.id);
  for (const one of declared) {
    const { dep } = one;
    const id = dependencyId(dep);
    if (id === walk.root || id === parent.id) continue;
    const known = walk.nodes.has(id);
    nodeFor(walk, dep, parent.id);
    if (known) continue;
    const children = childrenOf(one, parent, walk);
    if (children === undefined) continue;
    const self = { id, name: dep.name, marketplace: dep.marketplace ?? parent.marketplace };
    walkFrom(self, children, walk);
    walk.order.push(id);
  }
}
