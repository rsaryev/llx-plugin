import { error, type PluginIssue } from '../format/issues.ts';
import type { GitRepository } from '../ports/marketplace.ts';
import { isBlockedHost } from './blocked-hosts.ts';
import { npmRefusalMessage } from './install-failures.ts';
import { isDefaultRegistry, packageValueRefusal } from './node-deps-spec.ts';
import { isValidRange } from './semver.ts';
import { escapesAsWritten } from '../format/path-text.ts';

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
 * A git address in a `url` or `git-subdir` plugin source, or a `git` marketplace source. `url`
 * "doesn't take `owner/repo` shorthand", nor does a marketplace's `git`; `git-subdir` accepts it
 * as GitHub shorthand.
 */
export function readGitAddress(text: string, shorthand: boolean, path: string): GitReading {
  if (SHORTHAND.test(text)) {
    return shorthand
      ? { repo: { shorthand: text }, partialClone: true, issues: [] }
      : refused(
          path,
          `A full git URL is needed here, not owner/repo shorthand ("${text}"). Use a github source for a GitHub repository`,
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

/**
 * A path inside a cloned repository stays there: a `git-subdir` path (the docs say only "the
 * subdirectory that holds the plugin"), and a marketplace's `path` and each of its `sparsePaths`.
 */
export function repositoryPathIssues(inside: string, path: string): PluginIssue[] {
  return escapesAsWritten(inside, 'windows')
    ? [error(path, `The path "${inside}" must be inside the repository`)]
    : [];
}

/**
 * What git refuses in a branch or tag name (`git check-ref-format`): a control character or space,
 * `~ ^ : ? * [ \`, `..`, `@{`, `//`, a component starting with `.`, a name starting with `-` (git
 * would read it as an option) or `/`, and one ending in `/`, `.` or `.lock`.
 */
const NOT_A_REF = /[\p{Cc}\s~^:?*[\\]|\.\.|@\{|\/\/|\/\.|^[-/.]|[/.]$|\.lock$/u;

/** `ref` is "a branch or tag": one rule for the plugin and the marketplace git sources. */
export function refIssues(ref: string | undefined, path: string): PluginIssue[] {
  return ref !== undefined && NOT_A_REF.test(ref)
    ? [error(path, `"${ref}" is not a branch or tag name`)]
    : [];
}

// ---- npm ----

export interface NpmSafety {
  /** The registry URL of the installing user's own npm configuration. */
  readonly defaultRegistry?: string;
}

/** What an npm source names: a tarball link, or a package name and the version npm fetches. */
export type NpmSpec =
  | { readonly tarballUrl: string }
  | { readonly package: string; readonly version: string };

const TARBALL = /^https?:\/\//i;

/**
 * `package` as npm reads it: a tarball link, or a name with a version appended after the first `@`
 * past a scope (it wins over `version`), or a bare name whose version is `version`, else `latest`.
 * A package name holds no other `@`, so `x@git+ssh://git@host/x.git` appends `git+ssh://git@host/x.git`.
 */
export function npmSpecOf(pkg: string, version: string | undefined): NpmSpec {
  if (TARBALL.test(pkg)) return { tarballUrl: pkg };
  const at = pkg.indexOf('@', 1);
  const appended = at < 0 ? '' : pkg.slice(at + 1);
  const name = at < 0 ? pkg : pkg.slice(0, at);
  return { package: name, version: appended === '' ? (version ?? 'latest') : appended };
}

/**
 * npm's naming rule for a package: an optional `@scope/`, URL-safe characters, and no leading `.`,
 * `_` or `-` (a leading `-` would read as an option of the npm client).
 */
const NPM_NAME = /^(?:@[a-z0-9~][\w.~-]*\/)?[a-z0-9~][\w.~-]*$/i;
/** A dist-tag such as `latest` or `beta`: npm requires a tag to be URL-safe. */
const DIST_TAG = /^[a-z0-9][\w.-]*$/i;

/**
 * Why a version is refused: "a version, a semver range, or a dist-tag" is all the field takes, so a
 * git, folder, alias or tarball specifier after the name is refused with the reason of its kind.
 */
function versionRefusal(version: string, safety: NpmSafety): string | undefined {
  const kind = packageValueRefusal(version, safety.defaultRegistry);
  if (kind !== undefined) return kind;
  return isValidRange(version) || DIST_TAG.test(version)
    ? undefined
    : 'its version is not a version, a semver range or a dist-tag';
}

/** Whether the `version` field, not text appended to `package`, supplied the version. */
const versionFromField = (source: NpmPackageSource): boolean => {
  const at = source.package.indexOf('@', 1);
  return source.version !== undefined && (at < 0 || at === source.package.length - 1);
};

interface NpmPackageSource {
  readonly package: string;
  readonly version?: string;
}

interface Refusal {
  readonly field: 'package' | 'version';
  readonly value: string;
  readonly reason: string;
}

/** The refusal of the name and the version a package value names. */
function specRefusal(source: NpmPackageSource, safety: NpmSafety): Refusal | undefined {
  const spec = npmSpecOf(source.package, source.version);
  if ('tarballUrl' in spec) return undefined;
  const named = { field: 'package', value: source.package } as const;
  if (!NPM_NAME.test(spec.package)) return { ...named, reason: 'it is not an npm package name' };
  const reason = versionRefusal(spec.version, safety);
  if (reason === undefined) return undefined;
  return versionFromField(source)
    ? { field: 'version', value: spec.version, reason }
    : { ...named, reason };
}

/**
 * "Claude Code checks the `package` value before fetching anything." The kinds of value and what
 * each means are the registry-only rule of `node-deps-spec`, shared with the dependency install;
 * the same rule judges the version a name carries or the `version` field gives, so `name@<git
 * address>` is refused as the git address is. `path` is the source's (`source`).
 */
export function npmPackageIssues(
  source: NpmPackageSource,
  safety: NpmSafety,
  path: string,
): PluginIssue[] {
  const whole = packageValueRefusal(source.package, safety.defaultRegistry);
  const refusal: Refusal | undefined =
    whole === undefined
      ? specRefusal(source, safety)
      : { field: 'package', value: source.package, reason: whole };
  return refusal === undefined
    ? []
    : [error(`${path}.${refusal.field}`, npmRefusalMessage(refusal.value, refusal.reason))];
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
