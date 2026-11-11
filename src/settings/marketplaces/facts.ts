import type { SdkMarketplaceSource } from '../../protocol/official.ts';
import { canonicalRepo, githubRepo, type RepoId } from './git-url.ts';
import { hostOfGit, hostOfUrl } from './host-of.ts';
import { byKind, type ByKind, type SourceKind } from './source-kinds.ts';
import { canonicalJson } from '../../format/canonical-json.ts';

/**
 * What a matcher asks of a source or an entry, the same shape for every kind so a matcher never
 * branches on the kind of the thing it compares (rule K2).
 */
export interface Facts {
  readonly kind: SourceKind;
  /** Whether it names a place a marketplace comes from; `hostPattern`, `pathPattern`, `skills-dir` do not. */
  readonly concrete: boolean;
  /** The text an exact comparison uses: the repo, url, path, package or name. */
  readonly locator: string;
  readonly ref: string | undefined;
  /** The subdirectory of a `github` or `git` source (its `path` field). */
  readonly subpath: string | undefined;
  /** The repository identity of a source that clones one (`github`, `git`); `url` has one for entries. */
  readonly repo: RepoId | undefined;
  /** Whether the source is cloned from a repository, not fetched or read from a path. */
  readonly cloned: boolean;
  /** The path of a `file` or `directory` source. */
  readonly filePath: string | undefined;
  readonly registry: string | undefined;
  /** A `settings` source's inline catalog, in a form two identical catalogs share (key order aside). */
  readonly catalog: string | undefined;
  /** The host a `hostPattern` is matched against; the blocklist reads `wide` forms of git addresses. */
  readonly host: (wide: boolean) => string | undefined;
}

const NO_HOST = (): undefined => undefined;

const BASE: Facts = {
  kind: 'skills-dir',
  concrete: true,
  locator: '',
  ref: undefined,
  subpath: undefined,
  repo: undefined,
  cloned: false,
  filePath: undefined,
  registry: undefined,
  catalog: undefined,
  host: NO_HOST,
};

const notAPlace = (kind: SourceKind, locator: string): Facts => ({
  ...BASE,
  kind,
  concrete: false,
  locator,
});

const FACTS: ByKind<Facts> = {
  github: (source) => ({
    ...BASE,
    kind: source.source,
    locator: source.repo,
    ref: source.ref,
    subpath: source.path,
    repo: githubRepo(source.repo),
    cloned: true,
    host: () => 'github.com',
  }),
  git: (source) => ({
    ...BASE,
    kind: source.source,
    locator: source.url,
    ref: source.ref,
    subpath: source.path,
    repo: canonicalRepo(source.url),
    cloned: true,
    host: (wide) => hostOfGit(source.url, wide),
  }),
  url: (source) => ({
    ...BASE,
    kind: source.source,
    locator: source.url,
    repo: canonicalRepo(source.url),
    host: () => hostOfUrl(source.url),
  }),
  file: (source) => ({ ...BASE, kind: source.source, locator: source.path, filePath: source.path }),
  directory: (source) => ({
    ...BASE,
    kind: source.source,
    locator: source.path,
    filePath: source.path,
  }),
  // The docs' table has no row for these two; the SDK types them (spec/judgments.md).
  npm: (source) => ({
    ...BASE,
    kind: source.source,
    locator: source.package,
    registry: source.registry,
  }),
  settings: (source) => ({
    ...BASE,
    kind: source.source,
    locator: source.name,
    catalog: canonicalJson(source.plugins),
  }),
  hostPattern: (source) => notAPlace(source.source, source.hostPattern),
  pathPattern: (source) => notAPlace(source.source, source.pathPattern),
  'skills-dir': (source) => notAPlace(source.source, ''),
};

export const factsOf = (source: SdkMarketplaceSource): Facts => byKind(FACTS, source);
