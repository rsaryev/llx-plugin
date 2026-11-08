import { error, type PluginIssue } from '../format/issues.ts';
import type { GitRepository } from '../ports/marketplace.ts';
import { isBlockedHost } from './blocked-hosts.ts';
import { npmRefusalMessage } from './install-failures.ts';
import { isDefaultRegistry, packageValueRefusal } from './node-deps-spec.ts';

/**
 * The checks made before anything is fetched (plugins/marketplace-reference.md, "url plugin
 * source", "git-subdir plugin source", "npm plugin source", "archive plugin source"): pure, they
 * return issues, and a refusal "names the value and the reason". The docs give the rules and, for
 * npm, the categories; the wording of each message is the kit's (spec/judgments.md).
 */

const SHORTHAND = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
/** The forms of a git URL: `https://`, `http://`, `file://` and `git@`. */
const GIT_URL = /^(?:https?:\/\/|file:\/\/|git@)/i;
/** Over `https` or SSH Claude Code asks the server for a partial clone. */
const PARTIAL_CLONE_URL = /^(?:https:\/\/|git@)/i;

export interface GitReading {
  readonly repo: GitRepository | undefined;
  readonly partialClone: boolean;
  readonly issues: readonly PluginIssue[];
}

/**
 * A git address in a `url` or `git-subdir` source. `url` "doesn't take `owner/repo` shorthand";
 * `git-subdir` accepts it as GitHub shorthand.
 */
export function readGitAddress(text: string, shorthand: boolean, path: string): GitReading {
  if (SHORTHAND.test(text)) {
    return shorthand
      ? { repo: { shorthand: text }, partialClone: true, issues: [] }
      : refused(
          path,
          `The url source takes a full git URL, not owner/repo shorthand ("${text}"). Use a github source for a GitHub repository`,
        );
  }
  if (!GIT_URL.test(text)) {
    return refused(
      path,
      `"${text}" is not a git URL: it must start with https://, http://, file:// or git@`,
    );
  }
  return { repo: { url: text }, partialClone: PARTIAL_CLONE_URL.test(text), issues: [] };
}

const refused = (path: string, message: string): GitReading => ({
  repo: undefined,
  partialClone: false,
  issues: [error(path, message)],
});

const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/;

/** GitHub naming rules for an owner and a repository ("Owner and repo must follow GitHub naming rules"). */
export function isGitHubRepository(owner: string, repo: string): boolean {
  return GITHUB_OWNER.test(owner) && GITHUB_REPOSITORY.test(repo) && repo !== '.' && repo !== '..';
}

/** `github` takes `owner/repo`: one rule for a plugin source, a marketplace source and `marketplace add`. */
export function githubRepoIssues(repo: string, path: string): PluginIssue[] {
  const [owner = '', name = '', ...rest] = repo.split('/');
  return rest.length === 0 && isGitHubRepository(owner, name)
    ? []
    : [error(path, `"${repo}" is not a GitHub repository in owner/repo form`)];
}

/** Absolute as `/x`, `\\x` (a UNC path too) or `C:\x` and `C:/x` (a drive, with or without a separator). */
const ABSOLUTE_PATH = /^(?:[\\/]|[A-Za-z]:)/;

/** A `git-subdir` path stays inside the repository (the docs say only "the subdirectory that holds the plugin"). */
export function subdirIssues(subdir: string, path: string): PluginIssue[] {
  const escapes = ABSOLUTE_PATH.test(subdir) || subdir.split(/[\\/]/).includes('..');
  return escapes
    ? [error(path, `The subdirectory "${subdir}" must be a path inside the repository`)]
    : [];
}

// ---- npm ----

export interface NpmSafety {
  /** The registry URL of the installing user's own npm configuration. */
  readonly defaultRegistry?: string;
}

/**
 * "Claude Code checks the `package` value before fetching anything." The kinds of value and what
 * each means are the registry-only rule of `node-deps-spec`, shared with the dependency install.
 */
export function npmPackageIssues(pkg: string, safety: NpmSafety, path: string): PluginIssue[] {
  const reason = packageValueRefusal(pkg, safety.defaultRegistry);
  return reason === undefined ? [] : [error(path, npmRefusalMessage(pkg, reason))];
}

/** The `registry` URL "must use `https` unless it is the installing user's own default npm registry". */
export function npmRegistryIssues(
  registry: string,
  safety: NpmSafety,
  path: string,
): PluginIssue[] {
  if (isDefaultRegistry(registry, safety.defaultRegistry) || /^https:\/\//i.test(registry)) {
    return [];
  }
  return [
    error(
      path,
      `The npm registry "${registry}" must use https unless it is your own default npm registry`,
    ),
  ];
}

// ---- archive ----

const hostOf = (link: string): string | undefined => {
  try {
    return new URL(link).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

/** `url` "must use `https://` and can't point at a loopback, link-local, or cloud-metadata host". */
export function archiveUrlIssues(url: string, path: string): PluginIssue[] {
  const host = hostOf(url);
  if (host === undefined) return [error(path, `"${url}" is not a URL`)];
  if (!/^https:\/\//i.test(url)) {
    return [error(path, `The archive URL "${url}" must use https://`)];
  }
  return isBlockedHost(host)
    ? [
        error(
          path,
          `The archive URL "${url}" points at a loopback, link-local or cloud-metadata host`,
        ),
      ]
    : [];
}
