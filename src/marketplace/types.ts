import type { MarketplaceEntry, MarketplaceSource } from '../format/marketplace/types.ts';

/**
 * Contracts of the marketplace module (layer 3): the plans a host executes and the small values
 * several pieces share (docs/API.md, "Marketplace"). Planning is pure; these are what it returns.
 * Pages: plugins/marketplace-reference.md ("Plugin sources", "Marketplace sources"),
 * plugins/host-marketplace.md ("Stay within the download limits", "Rename or remove a plugin"),
 * plugins/dependencies.md.
 */

/** Header names are lower case, as on the ports (`HttpRequest`). */
export type HeaderMap = Readonly<Record<string, string>>;

/**
 * The headers a fetch or download sends, once any command has run. Wrapped, so that a result is
 * never mistaken for a `PluginIssue` (a header map is a record of strings, and so is an issue).
 */
export interface ResolvedHeaders {
  readonly headers: HeaderMap;
}

/** The download and extraction limits of an `archive` source (host-marketplace.md). */
export interface ArchiveLimits {
  readonly maxDownloadBytes: number;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly maxEntries: number;
  readonly maxFileBytes: number;
  readonly maxUncompressedBytes: number;
  /** Uncompressed content may be at most this many times the size of the zip. */
  readonly maxCompressionRatio: number;
}

export type GitFetchPlan = {
  readonly kind: 'git';
  readonly repo: { readonly shorthand: string } | { readonly url: string };
  readonly ref?: string;
  readonly sha?: string;
  /** What the clone ends on: `sha` wins over `ref`, which wins over the default branch. */
  readonly checkout: 'sha' | 'ref' | 'default-branch';
  readonly subdir?: string;
  readonly sparse: boolean;
  readonly partialClone: boolean;
};

export type NpmFetchPlan = {
  readonly kind: 'npm';
  readonly spec:
    | { readonly package: string; readonly version: string }
    | { readonly tarballUrl: string };
  readonly registry?: string;
  readonly runInstallScripts: false;
  readonly installDependencies: false;
};

export type ArchiveFetchPlan = {
  readonly kind: 'archive';
  readonly url: string;
  readonly sha256?: string;
  readonly limits: ArchiveLimits;
  readonly headers: HeaderMap;
  readonly rootDepth: 'top-or-one-down';
};

export type CommandFetchPlan = {
  readonly kind: 'command';
  readonly command: string;
  readonly shell: 'sh' | 'cmd';
  readonly cwd: 'home';
  readonly timeoutMs: number;
  readonly mode: 'copy' | 'link';
};

/**
 * Which of the marketplace repository's git submodules a local plugin needs (marketplace-
 * reference.md, "Git submodules in the marketplace repository"): `none` for a sparse checkout or a
 * marketplace that was not cloned, `plugin-subtree` for a plugin in a subdirectory (the submodules
 * it is in, holds or links into), `whole-repository` for a plugin at the root (all of them or none).
 * `selectSubmodules` applies the rule to the repository's files.
 */
export type SubmoduleRule = 'none' | 'plugin-subtree' | 'whole-repository';

/** How a plugin source is fetched, as data: the kit plans it, the host (or an engine over ports) runs it. */
export type FetchPlan =
  | {
      readonly kind: 'local';
      readonly fromMarketplaceRoot: string;
      readonly submodules: SubmoduleRule;
    }
  | GitFetchPlan
  | NpmFetchPlan
  | ArchiveFetchPlan
  | CommandFetchPlan;

export type FetchPlanKind = FetchPlan['kind'];

/** What planning a plugin fetch needs to know about the host and the marketplace it reads. */
export interface FetchPlanContext {
  readonly marketplaceOrigin?: MarketplaceSource;
  readonly platform: 'posix' | 'windows';
  /** The registry the user's own npm configuration names; the only `http://` or non-default one allowed. */
  readonly defaultNpmRegistry?: string;
  readonly sessionCwd?: string;
}

export type MarketplaceFetchPlan =
  | {
      readonly kind: 'git';
      readonly repo: { readonly shorthand: string } | { readonly url: string };
      readonly ref?: string;
      readonly path: string;
      readonly sparsePaths?: readonly string[];
    }
  | {
      readonly kind: 'http-file';
      readonly url: string;
      readonly maxBytes: 5242880;
      readonly timeoutMs: 10000;
      /** A redirect to a different origin: `https://` only, never a blocked host, no configured headers sent. */
      readonly redirects: {
        readonly crossOrigin: 'https-only';
        readonly blockedHosts: 'refused';
        readonly headersAcrossOrigins: 'none';
      };
      readonly headers: HeaderMap;
      readonly helper?: string;
    }
  | { readonly kind: 'read-file'; readonly path: string; readonly root: string }
  | { readonly kind: 'read-directory'; readonly root: string }
  | { readonly kind: 'inline'; readonly entries: readonly MarketplaceEntry[] };

/** A dependency with its defaults applied (plugins/dependencies.md): the marketplace is the declaring one when omitted. */
export interface NormalizedDependency {
  readonly name: string;
  readonly marketplace?: string;
  readonly range?: string;
}

export type RenameStatus =
  | { readonly status: 'current' }
  | { readonly status: 'renamed'; readonly to: string }
  | { readonly status: 'removed' }
  | { readonly status: 'unknown' };
