/**
 * Canonical identity of a git repository address, the comparison `blockedMarketplaces` makes
 * ("Git URLs are canonicalized, so the `git@` and `https://` forms, `.git` suffixes, and trailing
 * slashes of one `github.com` repository all match the same entry", plugins/org.md).
 */

/** A repository as the blocklist compares it: the host (lower case) and the path on it. */
export interface RepoId {
  readonly host: string;
  readonly path: string;
}

/** `https://`, `ssh://` and the like. */
export const SCHEME_URL = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

/** `[user@]host:path`, git's SSH address without a scheme (judgment: the user part is optional here). */
const SCP_ADDRESS = /^(?:[^@/\s]+@)?([^@:/\s]+):(?!\/\/)(.*)$/;

const TRAILING_SLASHES = /\/+$/;
const GIT_SUFFIX = /\.git$/;

/** The path without a `#ref`, trailing slashes and a `.git` suffix. */
const tidyPath = (path: string): string => {
  const withoutFragment = path.split('#')[0] ?? '';
  return withoutFragment
    .replace(TRAILING_SLASHES, '')
    .replace(GIT_SUFFIX, '')
    .replace(TRAILING_SLASHES, '');
};

function parseSchemeUrl(text: string): RepoId | undefined {
  try {
    const parsed = new URL(text);
    return {
      host: parsed.hostname.toLowerCase(),
      path: tidyPath(parsed.pathname.replace(/^\/+/, '')),
    };
  } catch {
    return undefined;
  }
}

/**
 * A repository address as one identity. Scheme, user and port do not count (judgment: `https://`
 * and `ssh://` reach the same repository, and the blocklist is the wider list), the host is lower
 * case, and the path keeps its case (the docs make only an `owner/*` owner case-insensitive). An
 * address with no host, such as a local path, is its own identity under the empty host.
 */
export function canonicalRepo(address: string): RepoId | undefined {
  if (SCHEME_URL.test(address)) return parseSchemeUrl(address);
  const [, host = '', path = ''] = SCP_ADDRESS.exec(address) ?? [];
  // One letter before the colon is a Windows drive, which git reads as a path.
  if (host.length > 1)
    return { host: host.toLowerCase(), path: tidyPath(path.replace(/^\/+/, '')) };
  return { host: '', path: tidyPath(address) };
}

/** `owner/repo` of a `github` source as a repository on github.com. */
export const githubRepo = (repo: string): RepoId => ({
  host: 'github.com',
  path: tidyPath(repo),
});

export const sameRepo = (a: RepoId, b: RepoId): boolean => a.host === b.host && a.path === b.path;
