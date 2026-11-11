import { error, type PluginIssue } from '../format/issues.ts';
import type {
  MarketplaceSourceKind,
  PluginSource,
  PluginSourceKind,
  PluginSourceOf,
} from '../format/marketplace/types.ts';
import { LINKS_NEED_POSIX, linkOnWindowsIssue } from './command-mode.ts';
import { UNSUPPORTED_SOURCE_TYPE } from './install-failures.ts';
import type { ArchiveLimits, FetchPlan, FetchPlanContext } from './types.ts';
import {
  archiveUrlIssues,
  githubRepoIssues,
  npmPackageIssues,
  npmSpecOf,
  npmRegistryIssues,
  readGitAddress,
  refIssues,
  repositoryPathIssues,
} from './source-safety.ts';
import { submoduleRuleFor } from './submodules.ts';

/**
 * Planning how a plugin source is fetched (plugins/marketplace-reference.md, "Plugin sources" and
 * its sub-sections; plugins/host-marketplace.md, "Stay within the download limits for hosted
 * files"): pure, a source and what the host knows in, a `FetchPlan` or the issues that refuse it
 * out. Issue paths are relative to the entry (`source`, `source.url`): the caller prefixes
 * `plugins[i].`. Nothing is fetched here; a host runs the plan, or an engine over ports does.
 */

export interface Planned {
  readonly plan: FetchPlan | undefined;
  readonly issues: readonly PluginIssue[];
}

const planned = (plan: FetchPlan): Planned => ({ plan, issues: [] });
const refused = (issues: readonly PluginIssue[]): Planned => ({ plan: undefined, issues });

const MIB = 1024 * 1024;

/** The limits of an `archive` source: the download and the extraction ("Stay within the download limits"). */
export const ARCHIVE_LIMITS: ArchiveLimits = {
  maxDownloadBytes: 256 * MIB,
  timeoutMs: 120_000,
  maxRedirects: 5,
  maxEntries: 100_000,
  maxFileBytes: 512 * MIB,
  maxUncompressedBytes: 1024 * MIB,
  maxCompressionRatio: 50,
};

type Planner<K extends PluginSourceKind> = (
  source: PluginSourceOf<K>,
  context: FetchPlanContext,
) => Planned;

/** What a relative path means for each way the marketplace was added: the refusal, or `undefined` when its files are there. */
const ORIGIN_REFUSAL: {
  readonly [K in MarketplaceSourceKind]: ((path: string) => string) | undefined;
} = {
  github: undefined,
  git: undefined,
  file: undefined,
  directory: undefined,
  npm: undefined,
  'skills-dir': undefined,
  hostPattern: undefined,
  pathPattern: undefined,
  url: (path) =>
    `Relative path "${path}" cannot resolve: a marketplace added by URL has only its marketplace.json, so its marketplace entry path does not stay inside the marketplace directory. Give the entry a github, url or git-subdir source`,
  settings: (path) =>
    `Relative path "${path}" is rejected in a marketplace declared in settings: it has no files. Give the entry a github, url or git-subdir source`,
};

function planRelative(source: PluginSourceOf<'relative'>, context: FetchPlanContext): Planned {
  const refusal =
    context.marketplaceOrigin === undefined
      ? undefined
      : ORIGIN_REFUSAL[context.marketplaceOrigin.kind]?.(source.path);
  if (refusal !== undefined) return refused([error('source', refusal)]);
  return planned({
    kind: 'local',
    fromMarketplaceRoot: source.path,
    submodules: submoduleRuleFor(source.path, context.marketplaceOrigin),
  });
}

const checkoutOf = (ref: string | undefined, sha: string | undefined) => {
  if (sha !== undefined) return 'sha' as const;
  return ref === undefined ? ('default-branch' as const) : ('ref' as const);
};

interface Pin {
  readonly ref?: string;
  readonly sha?: string;
}

/** `ref` and `sha`: "When you set both, Claude Code checks out `sha`". */
const pinned = ({ ref, sha }: Pin) => ({
  ...(ref === undefined ? {} : { ref }),
  ...(sha === undefined ? {} : { sha }),
  checkout: checkoutOf(ref, sha),
});

function planGithub(source: PluginSourceOf<'github'>): Planned {
  const issues = [
    ...githubRepoIssues(source.repo, 'source.repo'),
    ...refIssues(source.ref, 'source.ref'),
  ];
  if (issues.length > 0) return refused(issues);
  return planned({
    kind: 'git',
    repo: { shorthand: source.repo },
    ...pinned(source),
    sparse: false,
    partialClone: false,
    lfs: 'pointer-files',
  });
}

function planUrl(source: PluginSourceOf<'url'>): Planned {
  const reading = readGitAddress(source.url, false, 'source.url');
  const issues = [...reading.issues, ...refIssues(source.ref, 'source.ref')];
  if (reading.repo === undefined || issues.length > 0) return refused(issues);
  return planned({
    kind: 'git',
    repo: reading.repo,
    ...pinned(source),
    sparse: false,
    partialClone: false,
    lfs: 'pointer-files',
  });
}

/** "Claude Code checks out only that subdirectory", with a partial clone over `https` or SSH. */
function planGitSubdir(source: PluginSourceOf<'git-subdir'>): Planned {
  const reading = readGitAddress(source.url, true, 'source.url');
  const issues = [
    ...reading.issues,
    ...repositoryPathIssues(source.path, 'source.path'),
    ...refIssues(source.ref, 'source.ref'),
  ];
  if (reading.repo === undefined || issues.length > 0) return refused(issues);
  return planned({
    kind: 'git',
    repo: reading.repo,
    ...pinned(source),
    subdir: source.path,
    sparse: true,
    partialClone: reading.partialClone,
    lfs: 'pointer-files',
  });
}

function planNpm(source: PluginSourceOf<'npm'>, context: FetchPlanContext): Planned {
  const safety =
    context.defaultNpmRegistry === undefined ? {} : { defaultRegistry: context.defaultNpmRegistry };
  const issues = [
    ...npmPackageIssues(source, safety, 'source'),
    ...(source.registry === undefined
      ? []
      : npmRegistryIssues(source.registry, safety, 'source.registry')),
  ];
  if (issues.length > 0) return refused(issues);
  return planned({
    kind: 'npm',
    spec: npmSpecOf(source.package, source.version),
    ...(source.registry === undefined ? {} : { registry: source.registry }),
    runInstallScripts: false,
    installDependencies: false,
  });
}

function planArchive(source: PluginSourceOf<'archive'>): Planned {
  const issues = archiveUrlIssues(source.url, 'source.url');
  if (issues.length > 0) return refused(issues);
  return planned({
    kind: 'archive',
    url: source.url,
    ...(source.sha256 === undefined ? {} : { sha256: source.sha256.toLowerCase() }),
    limits: ARCHIVE_LIMITS,
    // Entry and source headers are merged by the download-headers step; none are known here.
    headers: {},
    rootDepth: 'top-or-one-down',
  });
}

/** "Claude Code runs the command through `sh`, or through `cmd.exe` on Windows, from the user's home directory." */
function planCommand(source: PluginSourceOf<'command'>, context: FetchPlanContext): Planned {
  const windows = context.platform === 'windows';
  if (windows && LINKS_NEED_POSIX[source.mode]) return refused([linkOnWindowsIssue()]);
  return planned({
    kind: 'command',
    command: source.command,
    shell: windows ? 'cmd' : 'sh',
    cwd: 'home',
    timeoutMs: source.timeoutSeconds * 1000,
    mode: source.mode,
  });
}

const PLANNERS: { readonly [K in PluginSourceKind]: Planner<K> } = {
  relative: planRelative,
  github: planGithub,
  url: planUrl,
  'git-subdir': planGitSubdir,
  npm: planNpm,
  archive: planArchive,
  command: planCommand,
};

function planOf<K extends PluginSourceKind>(
  kind: K,
  source: PluginSourceOf<K>,
  context: FetchPlanContext,
): Planned {
  return PLANNERS[kind](source, context);
}

/**
 * How `source` is fetched, or why it may not be. A source kind this build has no planner for (an
 * entry written for a newer Claude Code) is refused with the message the docs print, "Update
 * Claude Code and try again" (plugins/troubleshooting.md, "This plugin uses a source type your
 * Claude Code version does not support"), instead of failing in the planner lookup.
 */
export function planPluginFetch(source: PluginSource, context: FetchPlanContext): Planned {
  if (!Object.hasOwn(PLANNERS, source.kind)) {
    return refused([error('source', UNSUPPORTED_SOURCE_TYPE)]);
  }
  return planOf(source.kind, source, context);
}
