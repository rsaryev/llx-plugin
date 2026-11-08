/**
 * The matcher both marketplace lists share (settings-reference.md, `strictKnownMarketplaces`
 * "Allowed source types", "Owner wildcards", "Exact matching"; plugins/org.md "How entries match",
 * "Blocklist with `blockedMarketplaces`"). The allowlist matches by exact entry, owner wildcard or
 * regular expression; the blocklist matches the same entries more widely: canonical git URLs,
 * `github` and `git` as one, owner comparison in any case, no `ref` or `path` meaning every one.
 */
import type { MarketplaceSource } from '../../protocol/official.ts';
import { sameRepo } from './git-url.ts';
import { factsOf, type Facts } from './facts.ts';
import { byKindWith, type Registry, type SourceKind, type SourceOf } from './source-kinds.ts';

/** Which list an entry is read as. */
export type ListKind = 'strict' | 'blocked';

type Matcher<K extends SourceKind> = (entry: SourceOf<K>, own: Facts, source: Facts) => boolean;
type Matchers = Registry<[own: Facts, source: Facts], boolean>;

/** `<owner>/*`: "Only the whole repository-name position can be a wildcard". */
const OWNER_WILDCARD = /^([^/*\s]+)\/\*$/;
/** `@scope/*`, the npm form (SDK type comment). */
const SCOPE_WILDCARD = /^(@[^/*\s]+)\/\*$/;

const ownerOf = (repo: string): string | undefined => OWNER_WILDCARD.exec(repo)?.[1];

/** A name with `*` that is not a valid wildcard is "ignored as invalid, so it matches nothing". */
const isBrokenWildcard = (repo: string): boolean =>
  repo.includes('*') && ownerOf(repo) === undefined;

const never = (): boolean => false;

/** Regex flavour is JavaScript's (spec/judgments.md); a pattern that does not compile matches nothing. */
function matchesPattern(pattern: string, text: string | undefined): boolean {
  if (text === undefined) return false;
  try {
    return new RegExp(pattern).test(text);
  } catch {
    return false;
  }
}

/** `repo`/`url`, `ref` and `path` "must match exactly, or both must be undefined". */
const sameExactly = (own: Facts, source: Facts): boolean =>
  own.kind === source.kind &&
  own.locator === source.locator &&
  own.ref === source.ref &&
  own.subpath === source.subpath;

const exact = (_entry: unknown, own: Facts, source: Facts): boolean =>
  source.concrete && sameExactly(own, source);

const pinned = (wanted: string | undefined, actual: string | undefined): boolean =>
  wanted === undefined || wanted === actual;

/** The two-segment `owner/name` of a repository on github.com, as its owner and name. */
function githubOwner(source: Facts): string | undefined {
  const [owner, name, ...deeper] = (
    source.repo?.host === 'github.com' ? source.repo.path : ''
  ).split('/');
  return owner !== undefined && name !== undefined && deeper.length === 0 && !name.includes('*')
    ? owner
    : undefined;
}

/** Owner-wildcard entry, allowlist: case-sensitive owner, exact `ref`, any `path` unless pinned. */
function strictWildcard(owner: string, own: Facts, source: Facts): boolean {
  const [sourceOwner, name, ...deeper] = source.locator.split('/');
  return (
    source.kind === own.kind &&
    sourceOwner === owner &&
    name !== undefined &&
    name !== '' &&
    !name.includes('*') &&
    deeper.length === 0 &&
    own.ref === source.ref &&
    pinned(own.subpath, source.subpath)
  );
}

const strictGithub: Matcher<'github'> = (entry, own, source) => {
  if (isBrokenWildcard(entry.repo)) return false;
  const owner = ownerOf(entry.repo);
  if (!source.concrete) return false;
  return owner === undefined ? sameExactly(own, source) : strictWildcard(owner, own, source);
};

/** Blocklist: an entry without `ref` or `path` blocks every one; a pinned value must be the same. */
const blockedRepoScope = (own: Facts, source: Facts): boolean =>
  pinned(own.ref, source.ref) && pinned(own.subpath, source.subpath);

function blockedWildcard(owner: string, own: Facts, source: Facts): boolean {
  const sourceOwner = githubOwner(source);
  return (
    sourceOwner !== undefined &&
    sourceOwner.toLowerCase() === owner.toLowerCase() &&
    blockedRepoScope(own, source)
  );
}

const blockedGithub: Matcher<'github'> = (entry, own, source) => {
  if (isBrokenWildcard(entry.repo) || !source.cloned) return false;
  const owner = ownerOf(entry.repo);
  if (owner !== undefined) return blockedWildcard(owner, own, source);
  return blockedRepoScope(own, source) && sameRepoOf(own, source);
};

const sameRepoOf = (own: Facts, source: Facts): boolean =>
  own.repo !== undefined && source.repo !== undefined && sameRepo(own.repo, source.repo);

const blockedGit: Matcher<'git'> = (_entry, own, source) =>
  source.cloned && blockedRepoScope(own, source) && sameRepoOf(own, source);

/** A `url` entry blocks that url, and a bare repository URL that is cloned (`.git` and `#ref` ignored). */
const blockedUrl: Matcher<'url'> = (_entry, own, source) =>
  source.cloned ? sameRepoOf(own, source) : source.concrete && sameExactly(own, source);

const npmMatch: Matcher<'npm'> = (entry, own, source) => {
  if (!source.concrete || source.kind !== own.kind) return false;
  const scope = SCOPE_WILDCARD.exec(entry.package)?.[1];
  const named =
    scope === undefined
      ? own.locator === source.locator
      : source.locator.startsWith(`${scope}/`) && source.locator.split('/').length === 2;
  return (
    named && (own.registry === undefined || (source.registry?.startsWith(own.registry) ?? false))
  );
};

const hostMatch =
  (wide: boolean): Matcher<'hostPattern'> =>
  (entry, _own, source) =>
    source.concrete && matchesPattern(entry.hostPattern, source.host(wide));

const pathMatch: Matcher<'pathPattern'> = (entry, _own, source) =>
  source.concrete && matchesPattern(entry.pathPattern, source.filePath);

const COMMON = {
  file: exact,
  directory: exact,
  settings: exact,
  npm: npmMatch,
  pathPattern: pathMatch,
  'skills-dir': never,
};

const STRICT: Matchers = {
  ...COMMON,
  github: strictGithub,
  git: exact,
  url: exact,
  hostPattern: hostMatch(false),
};

const BLOCKED: Matchers = {
  ...COMMON,
  github: blockedGithub,
  git: blockedGit,
  url: blockedUrl,
  hostPattern: hostMatch(true),
};

const LISTS: { readonly [L in ListKind]: Matchers } = { strict: STRICT, blocked: BLOCKED };

/**
 * Whether a list entry matches the source of a marketplace. `skills-dir` entries match no
 * marketplace; they only decide whether skills-directory plugins load (see `gate.ts`).
 */
export function matchMarketplaceSource(
  list: ListKind,
  entry: MarketplaceSource,
  source: MarketplaceSource,
): boolean {
  return byKindWith(LISTS[list], entry, [factsOf(entry), factsOf(source)]);
}
