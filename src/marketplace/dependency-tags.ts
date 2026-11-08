import { error, type PluginIssue } from '../format/issues.ts';
import type { PluginSource, PluginSourceKind } from '../format/marketplace/types.ts';
import { dependencyId } from './dependencies.ts';
import {
  highestSatisfying,
  highestVersion,
  isValidRange,
  rangesOverlap,
  satisfiesRange,
  strictVersion,
} from './semver.ts';
import type { NormalizedDependency } from './types.ts';

/**
 * How a dependency's version constraint meets git tags (plugins/dependencies.md, "Release a plugin
 * that others depend on", "How a constraint resolves against tags", "Combine constraints from
 * several plugins"). A dependency with a range installs at the highest tag `<plugin-name>--v<version>`
 * that satisfies it; tags come from the `GitTags` port, so everything here is pure.
 */

/** A release tag and the version it names. */
export interface ReleaseTag {
  readonly tag: string;
  readonly version: string;
}

/** `<plugin-name>--v<version>` (plugins/dependencies.md, "Create a release tag"). */
export const releaseTag = (name: string, version: string): string => `${name}--v${version}`;

/**
 * The version a tag names for `name`, or `undefined` for another plugin's tag or one whose version
 * is not strict semver. Judgment (spec/judgments.md): a `v`, `=` or blank before the version
 * (`name--vv2.1.0`) is not a release tag; the docs name only `<name>--v<version>`.
 */
export function parseReleaseTag(tag: string, name: string): string | undefined {
  const prefix = releaseTag(name, '');
  return tag.startsWith(prefix) ? strictVersion(tag.slice(prefix.length)) : undefined;
}

const releaseTags = (tags: readonly string[], name: string): readonly ReleaseTag[] =>
  tags.flatMap((tag) => {
    const version = parseReleaseTag(tag, name);
    return version === undefined ? [] : [{ tag, version }];
  });

/** The release tag at `version`, among those already parsed. */
const tagAt = (found: readonly ReleaseTag[], version: string | undefined): ReleaseTag | undefined =>
  found.find((one) => one.version === version);

/**
 * The highest tag of `name` that satisfies `range`, with node-semver's rules: a range never matches
 * a pre-release unless it opts in (`^2.0.0-0`). `undefined` when none does.
 */
export function selectTag(
  tags: readonly string[],
  name: string,
  range: string,
): ReleaseTag | undefined {
  const found = releaseTags(tags, name);
  return tagAt(
    found,
    highestSatisfying(
      found.map((one) => one.version),
      range,
    ),
  );
}

/** The id, not the bare name, names the dependency: two marketplaces can host the same plugin name (troubleshooting.md uses `"<dep>"`). */
const problem = (dep: NormalizedDependency, what: string): PluginIssue =>
  error(`dependencies.${dependencyId(dep)}`, `Dependency "${dependencyId(dep)}" ${what}`);

/**
 * The tag a dependency resolves to when several installed plugins constrain it: the highest that
 * satisfies every range. A `PluginIssue` when the ranges cannot all hold: `has an invalid version
 * requirement`, `has version requirements too complex to intersect` or `has conflicting version
 * requirements` (with the ranges listed); `undefined` when they overlap but no tag falls in the
 * overlap, which is when the marketplace's current copy is fetched (`autoUpdateDecision` decides
 * what that means). The dependency's `name` reads the tags; its id names it in a message. Judgment:
 * the text after the quoted words, and 64 combinations of `||` alternatives as the limit of "too complex".
 */
export function combineRanges(
  ranges: readonly string[],
  tags: readonly string[],
  dep: NormalizedDependency,
): ReleaseTag | PluginIssue | undefined {
  const distinct = [...new Set(ranges)];
  if (distinct.length === 0) return undefined;
  const invalid = distinct.find((range) => !isValidRange(range));
  if (invalid !== undefined) {
    return problem(dep, `has an invalid version requirement: "${invalid}"`);
  }
  const overlap = rangesOverlap(distinct);
  if (overlap === undefined)
    return problem(dep, 'has version requirements too complex to intersect');
  if (!overlap) return problem(dep, `has conflicting version requirements: ${distinct.join(', ')}`);
  const fits = releaseTags(tags, dep.name).filter((one) =>
    distinct.every((range) => satisfiesRange(one.version, range)),
  );
  return tagAt(fits, highestVersion(fits.map((one) => one.version)));
}

/** What auto-update does with a dependency that installed plugins constrain (plugins/dependencies.md, "Combine constraints from several plugins"). */
export type AutoUpdateDecision =
  | {
      readonly outcome: 'update';
      readonly via: 'tag';
      readonly tag: string;
      readonly version: string;
    }
  | { readonly outcome: 'update'; readonly via: 'current-copy'; readonly version?: string }
  | { readonly outcome: 'skip'; readonly reason: 'ranges-conflict'; readonly issue: PluginIssue }
  | {
      readonly outcome: 'skip';
      readonly reason: 'current-copy-out-of-range';
      readonly version?: string;
    };

export interface AutoUpdateInput {
  readonly dep: NormalizedDependency;
  /** The range of every installed plugin that constrains the dependency. */
  readonly ranges: readonly string[];
  readonly tags: readonly string[];
  /** The `version` in the plugin.json of the marketplace's current copy. */
  readonly currentCopyVersion?: string;
}

const currentCopyDecision = (input: AutoUpdateInput): AutoUpdateDecision => {
  const version = input.currentCopyVersion;
  const fits =
    version !== undefined && input.ranges.every((range) => satisfiesRange(version, range));
  const found = version === undefined ? {} : { version };
  return fits || input.ranges.length === 0
    ? { outcome: 'update', via: 'current-copy', ...found }
    : { outcome: 'skip', reason: 'current-copy-out-of-range', ...found };
};

/**
 * Whether auto-update moves a constrained dependency, and to what (plugins/dependencies.md, "Combine
 * constraints from several plugins"): to the highest tag that satisfies every installed plugin's
 * range; when the ranges do not overlap, nowhere (the dependency stays at its current version and
 * the Errors tab names the constraining plugin: `issue` is that conflict); when they overlap and no
 * tag falls in the overlap, to the marketplace's current copy, unless its `version` falls outside any
 * range, which skips the update. A copy that states no version satisfies no range (judgment).
 */
export function autoUpdateDecision(input: AutoUpdateInput): AutoUpdateDecision {
  const combined = combineRanges(input.ranges, input.tags, input.dep);
  if (combined === undefined) return currentCopyDecision(input);
  if ('severity' in combined) {
    return { outcome: 'skip', reason: 'ranges-conflict', issue: combined };
  }
  return { outcome: 'update', via: 'tag', tag: combined.tag, version: combined.version };
}

/** What the constraint was checked against: a tag, or the marketplace's current copy (`version` is its `plugin.json` version, absent when it has none). */
export interface ResolvedVersion {
  readonly via: 'tag' | 'current-copy';
  readonly tag?: string;
  readonly version?: string;
}

export interface DependencyResolution {
  readonly dep: NormalizedDependency;
  readonly source: PluginSource;
  /** The tags of the repository that hosts the plugin (empty for a source with none, or a folder that is not a git repository). */
  readonly tags: readonly string[];
  /** The `version` in the plugin.json of the marketplace's current copy. */
  readonly currentCopyVersion?: string;
}

const currentCopy = (input: DependencyResolution): ResolvedVersion => ({
  via: 'current-copy',
  ...(input.currentCopyVersion === undefined ? {} : { version: input.currentCopyVersion }),
});

const byTag = (found: ReleaseTag): ResolvedVersion => ({
  via: 'tag',
  tag: found.tag,
  version: found.version,
});

/** The highest satisfying tag, or `undefined` when the dependency has no range or no tag fits. */
const tagFor = (input: DependencyResolution): ReleaseTag | undefined =>
  input.dep.range === undefined
    ? undefined
    : selectTag(input.tags, input.dep.name, input.dep.range);

/** A plugin with its own repository: no tag in range fails the install. */
const ownRepository = (input: DependencyResolution): ResolvedVersion | PluginIssue => {
  const found = tagFor(input);
  if (found !== undefined) return byTag(found);
  if (input.dep.range === undefined) return currentCopy(input);
  return error(
    `dependencies.${dependencyId(input.dep)}`,
    `Dependency "${dependencyId(input.dep)}" has no git tag satisfying ${input.dep.range}`,
  );
};

/** A plugin in the marketplace repository: no tag in range installs the current copy, checked at load. */
const marketplaceRepository = (input: DependencyResolution): ResolvedVersion => {
  const found = tagFor(input);
  return found === undefined ? currentCopy(input) : byTag(found);
};

/** `npm`, `archive` and `command`: the range does not choose the version, the plugin.json version is checked at load. */
const pluginJson = (input: DependencyResolution): ResolvedVersion => currentCopy(input);

const RESOLVERS: {
  readonly [K in PluginSourceKind]: (input: DependencyResolution) => ResolvedVersion | PluginIssue;
} = {
  github: ownRepository,
  url: ownRepository,
  'git-subdir': ownRepository,
  relative: marketplaceRepository,
  npm: pluginJson,
  archive: pluginJson,
  command: pluginJson,
};

/**
 * What a dependency's constraint resolves against, by the kind of its plugin source: a tag of its
 * own repository (`github`, `url`, `git-subdir`: none in range is `has no git tag satisfying`), a
 * tag of the marketplace repository or else its current copy (`relative`), or the `plugin.json`
 * version of the fetched plugin (`npm`, `archive`, `command`). The `version` returned is the one a
 * constraint is checked against: the tag's, which beats `plugin.json`, when resolved by tag.
 */
export function resolveDependencyVersion(
  input: DependencyResolution,
): ResolvedVersion | PluginIssue {
  return RESOLVERS[input.source.kind](input);
}
