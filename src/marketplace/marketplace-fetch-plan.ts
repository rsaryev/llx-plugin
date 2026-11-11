import { error, type PluginIssue } from '../format/issues.ts';
import type {
  MarketplaceSource,
  MarketplaceSourceKind,
  MarketplaceSourceOf,
} from '../format/marketplace/types.ts';
import { normalizeHeaders } from './header-map.ts';
import {
  githubRepoIssues,
  readGitAddress,
  refIssues,
  repositoryPathIssues,
} from './source-safety.ts';
import type { MarketplaceFetchPlan } from './types.ts';
import { SOURCE_FAILURE } from '../format/marketplace/source-failures.ts';

/**
 * Planning how a marketplace source is fetched (plugins/marketplace-reference.md, "Marketplace
 * sources" and "Fields by type"; plugins/host-marketplace.md, "Stay within the download limits for
 * hosted files"): pure, a source in, the plan or the issue that refuses it out. Nothing is read
 * here; the host runs the plan. Issue paths are relative to the source object.
 */

type Planned = MarketplaceFetchPlan | PluginIssue;
type Planner<K extends MarketplaceSourceKind> = (source: MarketplaceSourceOf<K>) => Planned;

/**
 * The limits of a `marketplace.json` downloaded from a `url` source: 5 MiB, 10 seconds, and the
 * redirect rule of "Stay within the download limits for hosted files": a redirect to a different
 * origin must use `https://` and can't point at a loopback, link-local or cloud-metadata host
 * (`isBlockedHost`), and the request it sends carries none of the configured headers.
 */
const MARKETPLACE_DOWNLOAD = {
  maxBytes: 5_242_880,
  timeoutMs: 10_000,
  redirects: {
    crossOrigin: 'https-only',
    blockedHosts: 'refused',
    headersAcrossOrigins: 'none',
  },
} as const;

function planUrl(source: MarketplaceSourceOf<'url'>): Planned {
  return {
    kind: 'http-file',
    url: source.url,
    ...MARKETPLACE_DOWNLOAD,
    headers: normalizeHeaders(source.headers ?? {}),
    ...(source.headersHelper === undefined ? {} : { helper: source.headersHelper }),
  };
}

type Cloned = MarketplaceSourceOf<'github'> | MarketplaceSourceOf<'git'>;

/** The clone of a `github` or `git` source: its ref and sparse checkout when it has them. */
const cloneOf = (
  repo: { readonly shorthand: string } | { readonly url: string },
  source: Cloned,
): MarketplaceFetchPlan => ({
  kind: 'git',
  repo,
  ...(source.ref === undefined ? {} : { ref: source.ref }),
  path: source.path,
  ...(source.sparsePaths === undefined ? {} : { sparsePaths: source.sparsePaths }),
  lfs: 'pointer-files',
});

/**
 * What either clone refuses before it runs (spec/judgments.md): a `ref` git cannot name or would
 * read as an option, and a `path` or sparse path that leaves the repository.
 */
const cloneIssues = (source: Cloned): readonly PluginIssue[] => [
  ...refIssues(source.ref, 'ref'),
  ...repositoryPathIssues(source.path, 'path'),
  ...(source.sparsePaths ?? []).flatMap((sparse, at) =>
    repositoryPathIssues(sparse, `sparsePaths[${at}]`),
  ),
];

/** `repo` names one repository: an owner wildcard is taken literally and the clone fails. */
function planGithub(source: MarketplaceSourceOf<'github'>): Planned {
  const refused = [...githubRepoIssues(source.repo, 'repo'), ...cloneIssues(source)];
  return refused[0] ?? cloneOf({ shorthand: source.repo }, source);
}

/** `url` takes the git URL forms a `url` plugin source takes. */
function planGit(source: MarketplaceSourceOf<'git'>): Planned {
  const reading = readGitAddress(source.url, false, 'url');
  const refused = [...reading.issues, ...cloneIssues(source)];
  return refused[0] ?? cloneOf(reading.repo ?? { url: source.url }, source);
}

/** Where a path stops being its directory: the last `/`, or `\` for a Windows path. */
const lastSeparator = (path: string): number =>
  Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));

/**
 * The directory that holds a path, as `dirname` gives it: `.` for a bare name, the separator for a
 * file at the root, and the drive with its separator (`C:\`) for a file directly under a drive.
 */
function directoryOf(path: string): string {
  const at = lastSeparator(path);
  if (at < 0) return '.';
  if (at === 0) return path.slice(0, 1);
  return /^[A-Za-z]:$/.test(path.slice(0, at)) ? path.slice(0, at + 1) : path.slice(0, at);
}

/**
 * The directory two levels above the file: `<root>/.claude-plugin/marketplace.json` gives `<root>`.
 * A relative path with fewer directories stops at `.` (spec/judgments.md).
 */
const twoLevelsUp = (path: string): string => directoryOf(directoryOf(path));

const planFile = (source: MarketplaceSourceOf<'file'>): Planned => ({
  kind: 'read-file',
  path: source.path,
  root: twoLevelsUp(source.path),
});

const refusal = (message: string) => (): Planned => error('source', message);

const PLANNERS: { readonly [K in MarketplaceSourceKind]: Planner<K> } = {
  url: planUrl,
  github: planGithub,
  git: planGit,
  npm: refusal(SOURCE_FAILURE.npm),
  file: planFile,
  directory: (source) => ({ kind: 'read-directory', root: source.path }),
  settings: (source) => ({ kind: 'inline', entries: source.plugins }),
  'skills-dir': refusal(SOURCE_FAILURE.policyOnly),
  hostPattern: refusal(SOURCE_FAILURE.policyOnly),
  pathPattern: refusal(SOURCE_FAILURE.policyOnly),
};

function planOf<K extends MarketplaceSourceKind>(kind: K, source: MarketplaceSourceOf<K>): Planned {
  return PLANNERS[kind](source);
}

/** How the marketplace file is fetched, or why it cannot be. */
export function planMarketplaceFetch(source: MarketplaceSource): Planned {
  return planOf(source.kind, source);
}
