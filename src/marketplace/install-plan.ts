import { error, type PluginIssue } from '../format/issues.ts';
import type { PluginSource } from '../format/marketplace/types.ts';
import { planPluginFetch } from './fetch-plan.ts';
import { decideInstallMode, type InstallDecision } from './install-mode.ts';
import type { InstallScope } from './install-scopes.ts';
import type { InstalledRecords, InstallRecord } from './installed-plugins.ts';
import { isWithin } from './link-rule.ts';
import { dirsToOrphan } from './orphan-cleanup.ts';
import { isVersionSegment, type PluginVersion } from './plugin-version.ts';
import type { PathJoin, StoreLayout } from './store-layout.ts';
import type { FetchPlan, FetchPlanContext } from './types.ts';

/**
 * Installing a marketplace plugin as two pure steps (plugins/loading.md, "Find plugins on disk",
 * "In-place and copied plugins", "Cleanup of previous versions"; plugins/marketplace-reference.md,
 * "Copy mode and link mode"): what to fetch and how it will be installed, then, once the host has
 * fetched it and the version is known, where it goes and what `installed_plugins.json` becomes.
 * The kit moves nothing; the host runs the fetch, the copy or the links and writes the file.
 */

export interface InstallStart {
  /** What to fetch; `undefined` when the source is refused. */
  readonly fetch: FetchPlan | undefined;
  readonly decision: InstallDecision | undefined;
  readonly issues: readonly PluginIssue[];
}

export interface InstallStartInput {
  readonly source: PluginSource;
  /** `marketplaceOrigin` is how the marketplace the plugin is listed in was added. */
  readonly fetch: FetchPlanContext;
}

/** Before the fetch: its plan and how the plugin will be installed. A refusal of either is an issue and plans nothing. */
export function planInstallStart(input: InstallStartInput): InstallStart {
  const planned = planPluginFetch(input.source, input.fetch);
  if (planned.plan === undefined)
    return { fetch: undefined, decision: undefined, issues: planned.issues };
  const decided = decideInstallMode({
    origin: {
      kind: 'marketplace',
      source: input.source,
      ...(input.fetch.marketplaceOrigin === undefined
        ? {}
        : { marketplace: input.fetch.marketplaceOrigin.kind }),
    },
    platform: input.fetch.platform,
  });
  return 'severity' in decided
    ? { fetch: undefined, decision: undefined, issues: [decided] }
    : { fetch: planned.plan, decision: decided, issues: [] };
}

/** A link of a link-mode cache entry: one per top-level entry of the printed directory. */
export interface CacheLink {
  /** The entry's name inside the cache directory. */
  readonly name: string;
  /** What it links to: that entry of the printed directory. */
  readonly target: string;
}

export interface InstallFinish {
  readonly name: string;
  readonly marketplace: string;
  readonly decision: InstallDecision;
  readonly version: PluginVersion;
  readonly layout: StoreLayout;
  /** The host's path join, for the targets of the links. */
  readonly join: PathJoin;
  readonly scope: InstallScope;
  /** The folder of a `project` or `local` install. */
  readonly projectPath?: string;
  /** Where a plugin loaded in place lies, or the directory a `command` source printed. */
  readonly sourceDirectory?: string;
  /** The top-level names of the printed directory, for link mode. */
  readonly topLevel?: readonly string[];
  /** The commit a git-sourced plugin was installed at. */
  readonly gitCommitSha?: string;
  /** The records now in `installed_plugins.json`. */
  readonly existing: InstalledRecords;
  /** The time of the install, as the text the file records (the kit reads no clock). */
  readonly at: string;
}

export interface InstallFinished {
  /** The folder a copy is committed to, or a link-mode entry is filled in; `undefined` for a plugin loaded in place. */
  readonly destination?: string;
  readonly links: readonly CacheLink[];
  readonly record?: InstallRecord;
  /** The records to write; `existing` when nothing could be planned. */
  readonly records: InstalledRecords;
  /** The version directories the update left behind: write `.orphaned_at` into each. */
  readonly orphaned: readonly string[];
  readonly issues: readonly PluginIssue[];
}

const slash = (path: string): string => path.replaceAll('\\', '/');

/** Whether a directory is inside the plugin cache: only those are marked, and later swept, as orphans. */
const inCache = (layout: StoreLayout, dir: string): boolean =>
  isWithin(slash(layout.cache()), slash(dir));

/** The version folders an update leaves, inside the cache and in use by no record. */
const orphansOf = (
  layout: StoreLayout,
  replaced: InstallRecord | undefined,
  remaining: readonly InstallRecord[],
): readonly string[] =>
  dirsToOrphan(replaced === undefined ? [] : [replaced], remaining).filter((dir) =>
    inCache(layout, dir),
  );

const problem = (message: string): PluginIssue => error('source', message);

/** The record that this install replaces: the same scope, and for a project or local install the same folder. */
const sameInstall = (one: InstallRecord, scope: InstallScope, projectPath?: string): boolean =>
  one.scope === scope && one.projectPath === projectPath;

/** Where the plugin's files are, as `installed_plugins.json` records it. */
function installPathOf(input: InstallFinish, versionDir: string): string | undefined {
  return input.decision.cached ? versionDir : input.sourceDirectory;
}

const NO_CHANGE = (input: InstallFinish, issues: readonly PluginIssue[]): InstallFinished => ({
  links: [],
  records: input.existing,
  orphaned: [],
  issues,
});

/** The links of a link-mode entry: "a link to each top-level entry of the printed directory". */
function linksOf(input: InstallFinish): readonly CacheLink[] {
  const printed = input.sourceDirectory;
  if (!input.decision.linked || printed === undefined) return [];
  return (input.topLevel ?? []).map((name) => ({
    name,
    target: input.join(printed, name),
  }));
}

function recordOf(
  input: InstallFinish,
  installPath: string,
  replaced?: InstallRecord,
): InstallRecord {
  return {
    scope: input.scope,
    installPath,
    version: input.version.version,
    installedAt: replaced?.installedAt ?? input.at,
    lastUpdated: input.at,
    ...(input.gitCommitSha === undefined ? {} : { gitCommitSha: input.gitCommitSha }),
    ...(input.projectPath === undefined ? {} : { projectPath: input.projectPath }),
  };
}

/**
 * After the fetch: the cache folder (`cache/<marketplace>/<plugin>/<version>/`) and the record. An
 * update puts the new record in the old one's place and orphans the version folder it leaves
 * behind, "so a session that already loaded the old version keeps running"; a folder outside the
 * cache (a plugin loaded in place) is never marked, since a sweep would delete the user's own files.
 */
export function planInstallFinish(input: InstallFinish): InstallFinished {
  if (!isVersionSegment(input.version.version)) {
    return NO_CHANGE(input, [
      problem(`The version "${input.version.version}" cannot name a folder`),
    ]);
  }
  const versionDir = input.layout.versionDir(input.marketplace, input.name, input.version.version);
  const installPath = installPathOf(input, versionDir);
  if (installPath === undefined) {
    return NO_CHANGE(input, [problem('A plugin loaded in place needs the directory it lies in')]);
  }
  const id = `${input.name}@${input.marketplace}`;
  const before = input.existing[id] ?? [];
  const replaced = before.find((one) => sameInstall(one, input.scope, input.projectPath));
  const record = recordOf(input, installPath, replaced);
  const after = [...before.filter((one) => one !== replaced), record];
  const records = { ...input.existing, [id]: after };
  return {
    ...(input.decision.cached ? { destination: versionDir } : {}),
    links: linksOf(input),
    record,
    records,
    orphaned: orphansOf(input.layout, replaced, Object.values(records).flat()),
    issues: [],
  };
}
