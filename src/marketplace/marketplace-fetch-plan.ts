import { error, type PluginIssue } from '../format/issues.ts';
import type {
  MarketplaceSource,
  MarketplaceSourceKind,
  MarketplaceSourceOf,
} from '../format/marketplace/types.ts';
import { normalizeHeaders } from './header-map.ts';
import { githubRepoIssues } from './source-safety.ts';
import type { MarketplaceFetchPlan } from './types.ts';

/**
 * Planning how a marketplace source is fetched (plugins/marketplace-reference.md, "Marketplace
 * sources" and "Fields by type"; plugins/host-marketplace.md, "Stay within the download limits for
 * hosted files"): pure, a source in, the plan or the issue that refuses it out. Nothing is read
 * here; the host runs the plan. Issue paths are relative to the source object.
 */

type Planned = MarketplaceFetchPlan | PluginIssue;
type Planner<K extends MarketplaceSourceKind> = (source: MarketplaceSourceOf<K>) => Planned;

/** The limits of a `marketplace.json` downloaded from a `url` source: 5 MiB, 10 seconds. */
const MARKETPLACE_DOWNLOAD = { maxBytes: 5_242_880, timeoutMs: 10_000 } as const;

function planUrl(source: MarketplaceSourceOf<'url'>): Planned {
  return {
    kind: 'http-file',
    url: source.url,
    ...MARKETPLACE_DOWNLOAD,
    headers: normalizeHeaders(source.headers ?? {}),
    ...(source.headersHelper === undefined ? {} : { helper: source.headersHelper }),
  };
}

/** The clone of a `github` or `git` source: its ref and sparse checkout when it has them. */
const cloneOf = (
  repo: { readonly shorthand: string } | { readonly url: string },
  source: MarketplaceSourceOf<'github'> | MarketplaceSourceOf<'git'>,
): MarketplaceFetchPlan => ({
  kind: 'git',
  repo,
  ...(source.ref === undefined ? {} : { ref: source.ref }),
  path: source.path,
  ...(source.sparsePaths === undefined ? {} : { sparsePaths: source.sparsePaths }),
});

/** `repo` names one repository: an owner wildcard is taken literally and the clone fails. */
function planGithub(source: MarketplaceSourceOf<'github'>): Planned {
  const refused = githubRepoIssues(source.repo, 'source.repo');
  return refused[0] ?? cloneOf({ shorthand: source.repo }, source);
}

const planGit = (source: MarketplaceSourceOf<'git'>): Planned =>
  cloneOf({ url: source.url }, source);

/** Where a path stops being its directory: the last `/`, or `\` for a Windows path. */
const lastSeparator = (path: string): number =>
  Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));

/** The directory two levels above the file: `<root>/.claude-plugin/marketplace.json` gives `<root>`. */
function twoLevelsUp(path: string): string {
  const parent = path.slice(0, Math.max(lastSeparator(path), 0));
  const root = parent.slice(0, Math.max(lastSeparator(parent), 0));
  return root === '' && /^[\\/]/.test(path) ? path.slice(0, 1) : root;
}

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
  npm: refusal('NPM marketplace sources not yet implemented'),
  file: planFile,
  directory: (source) => ({ kind: 'read-directory', root: source.path }),
  settings: (source) => ({ kind: 'inline', entries: source.plugins }),
  'skills-dir': refusal('Unsupported marketplace source type'),
  hostPattern: refusal('Unsupported marketplace source type'),
  pathPattern: refusal('Unsupported marketplace source type'),
};

function planOf<K extends MarketplaceSourceKind>(kind: K, source: MarketplaceSourceOf<K>): Planned {
  return PLANNERS[kind](source);
}

/** How the marketplace file is fetched, or why it cannot be. */
export function planMarketplaceFetch(source: MarketplaceSource): Planned {
  return planOf(source.kind, source);
}
