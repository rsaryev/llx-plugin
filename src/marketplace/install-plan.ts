import { error, type PluginIssue } from '../format/issues.ts';
import type { PluginSource } from '../format/marketplace/types.ts';
import { samePath } from './command-output.ts';
import { planPluginFetch } from './fetch-plan.ts';
import { decideInstallMode, type InstallDecision } from './install-mode.ts';
import type { InstallScope } from './install-scopes.ts';
import type { InstalledRecords, InstallRecord } from './installed-plugins.ts';
import { dirsToOrphan } from './orphan-cleanup.ts';
import { isVersionSegment, type PluginVersion } from './version-resolution.ts';
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
  readonly platform: 'posix' | 'windows';
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
  /** The host copies the fetched files into `destination`; false for link mode, which copies nothing, and for a plugin loaded in place. */
  readonly copy: boolean;
  readonly links: readonly CacheLink[];
  /** Link mode: "Keep the directory in place". The links point into this directory, so it must stay where it is. */
  readonly mustStayAt?: string;
  readonly record?: InstallRecord;
  /** The records to write; `existing` when nothing could be planned. */
  readonly records: InstalledRecords;
  /** The version directories the update left behind: write `.orphaned_at` into each. */
  readonly orphaned: readonly string[];
  readonly issues: readonly PluginIssue[];
}

const problem = (message: string): PluginIssue => error('source', message);

/**
 * The record that this install replaces: the same scope, and for a project or local install the
 * same folder, whatever way the platform spells it (on Windows `C:\work\app` and `c:\work\app`
 * are one folder, and two records of it are what plugins/troubleshooting.md describes).
 */
function sameInstall(one: InstallRecord, input: InstallFinish): boolean {
  if (one.scope !== input.scope) return false;
  if (one.projectPath === undefined || input.projectPath === undefined) {
    return one.projectPath === input.projectPath;
  }
  return samePath(one.projectPath, input.projectPath, input.platform);
}

/** A top-level name that cannot be a link in the cache entry: empty, a dot entry, or with a separator. */
const unsafeLinkName = (name: string): boolean =>
  name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\0');

/** Link mode needs the printed directory and what is in it, and names that stay inside the cache entry. */
function linkProblem(input: InstallFinish): PluginIssue | undefined {
  if (!input.decision.linked) return undefined;
  const names = input.topLevel ?? [];
  if (input.sourceDirectory === undefined || names.length === 0) {
    return problem('A link-mode plugin needs the printed directory and its top-level entries');
  }
  const unsafe = names.find(unsafeLinkName);
  return unsafe === undefined
    ? undefined
    : problem(
        `The printed directory has an entry that cannot be linked into the cache: "${unsafe}"`,
      );
}

/** Where the plugin's files are, as `installed_plugins.json` records it, and the cache folder. */
interface Place {
  readonly versionDir: string;
  readonly installPath: string;
}

/**
 * The cache folder (`cache/<marketplace>/<plugin>/<version>/`) and the recorded path, or why they
 * cannot be named. Only a plugin with a folder in the cache needs a version that can name one; a
 * plugin loaded in place is recorded with the directory it lies in (judgment).
 */
function placeOf(input: InstallFinish): Place | PluginIssue {
  const { cached } = input.decision;
  if (cached && !isVersionSegment(input.version.version)) {
    return problem(`The version "${input.version.version}" cannot name a folder`);
  }
  const versionDir = input.layout.versionDir(input.marketplace, input.name, input.version.version);
  if (cached) return { versionDir, installPath: versionDir };
  return input.sourceDirectory === undefined
    ? problem('A plugin loaded in place needs the directory it lies in')
    : { versionDir, installPath: input.sourceDirectory };
}

const NO_CHANGE = (input: InstallFinish, issues: readonly PluginIssue[]): InstallFinished => ({
  copy: false,
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
 * After the fetch: the cache folder and the record. An update puts the new record in the old one's
 * place and orphans the version folder it leaves behind, "so a session that already loaded the old
 * version keeps running"; a folder outside the cache (a plugin loaded in place) is never marked,
 * since a sweep would delete the user's own files. Link mode copies nothing: it links each
 * top-level entry of the printed directory, which `mustStayAt` says must stay where it is.
 */
export function planInstallFinish(input: InstallFinish): InstallFinished {
  const place = placeOf(input);
  if ('severity' in place) return NO_CHANGE(input, [place]);
  const refused = linkProblem(input);
  if (refused !== undefined) return NO_CHANGE(input, [refused]);
  const id = `${input.name}@${input.marketplace}`;
  const before = input.existing[id] ?? [];
  const replaced = before.find((one) => sameInstall(one, input));
  const record = recordOf(input, place.installPath, replaced);
  const records = {
    ...input.existing,
    [id]: [...before.filter((one) => one !== replaced), record],
  };
  return {
    ...(input.decision.cached ? { destination: place.versionDir } : {}),
    copy: input.decision.cached && !input.decision.linked,
    links: linksOf(input),
    ...(input.decision.linked && input.sourceDirectory !== undefined
      ? { mustStayAt: input.sourceDirectory }
      : {}),
    record,
    records,
    orphaned: dirsToOrphan(
      replaced === undefined ? [] : [replaced],
      Object.values(records).flat(),
      input.layout,
    ),
    issues: [],
  };
}
