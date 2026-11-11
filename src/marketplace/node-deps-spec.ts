import { NOT_A_LINK } from './install-failures.ts';
import { isRecord } from '../protocol/is-record.ts';

/**
 * What counts as a registry package (plugins/loading.md, "Limits on the dependency install":
 * "every dependency must be a registry package ... A plugin with a git, GitHub, folder, workspace,
 * or linked dependency gets no install", "a download link in the lockfile must use `https`, unless
 * it points at the installing user's own default npm registry"; plugins/marketplace-reference.md,
 * "npm plugin source": a git address, a folder or `file:` path, an `npm:` alias and some tarball
 * links are refused). One classifier of a specifier serves the `package` value of an npm source and
 * the dependencies of a plugin's `package.json`; a registry of rules typed over the kinds says what
 * each kind means for each of the two (K1).
 */

export type SpecifierKind =
  | 'registry'
  | 'alias'
  | 'folder'
  | 'git-scheme'
  | 'git-address'
  | 'workspace'
  | 'linked'
  | 'tarball-host'
  | 'tarball-http'
  | 'tarball-https';

const LINK = /^https?:\/\//i;

/** Hosts whose tarball links are refused, GitHub release downloads included. */
const REFUSED_TARBALL_HOSTS = [
  'github.com',
  'gist.github.com',
  'gitlab.com',
  'bitbucket.org',
  'git.sr.ht',
];
const GITLAB_REGISTRY_PATH = '/api/v4/';

const urlOf = (link: string): URL | undefined => {
  try {
    return new URL(link);
  } catch {
    return undefined;
  }
};

const onRefusedHost = (link: string): boolean => {
  const url = urlOf(link);
  if (url === undefined) return false;
  const host = url.hostname.toLowerCase();
  const named = REFUSED_TARBALL_HOSTS.some((name) => host === name || host.endsWith(`.${name}`));
  return named && !(host === 'gitlab.com' && url.pathname.startsWith(GITLAB_REGISTRY_PATH));
};

interface Detector {
  readonly kind: SpecifierKind;
  readonly matches: (value: string) => boolean;
}

/** In the order the docs list them; the first that matches is the kind. */
const DETECTORS: readonly Detector[] = [
  { kind: 'alias', matches: (value) => /^npm:/i.test(value) || value.includes('@npm:') },
  {
    kind: 'folder',
    matches: (value) =>
      /^file:/i.test(value) ||
      /^(?:\.{1,2}(?:[\\/]|$)|[\\/]|~(?:[\\/]|$)|[A-Za-z]:[\\/])/.test(value),
  },
  {
    // "github:acme/formatter" is the docs' own example of a value that "is not an http or https link".
    kind: 'git-scheme',
    matches: (value) => /^(?:git\+|git:|git@|ssh:|github:|gitlab:|bitbucket:|gist:)/i.test(value),
  },
  { kind: 'workspace', matches: (value) => /^workspace:/i.test(value) },
  { kind: 'linked', matches: (value) => /^link:/i.test(value) },
  {
    kind: 'git-address',
    matches: (value) =>
      (LINK.test(value) && /\.git(?:[#?].*)?$/i.test(value)) ||
      (!value.startsWith('@') && /^[^\s/:@]+\/[^\s/:]+(?:#.*)?$/.test(value)),
  },
  { kind: 'tarball-host', matches: (value) => LINK.test(value) && onRefusedHost(value) },
  { kind: 'tarball-http', matches: (value) => /^http:\/\//i.test(value) },
  { kind: 'tarball-https', matches: (value) => /^https:\/\//i.test(value) },
];

export function classifySpecifier(value: string): SpecifierKind {
  return DETECTORS.find((detector) => detector.matches(value))?.kind ?? 'registry';
}

// ---- links to the user's own default registry ----

const trailingSlash = (url: string): string => url.replace(/\/+$/, '');

/** True when `link` lies under the installing user's own default npm registry (compared by whole segments). */
const isDefaultRegistryLink = (link: string, defaultRegistry: string | undefined): boolean =>
  defaultRegistry !== undefined &&
  `${trailingSlash(link)}/`
    .toLowerCase()
    .startsWith(`${trailingSlash(defaultRegistry)}/`.toLowerCase());

/** True when `registry` is the user's own default registry itself. */
export const isDefaultRegistry = (registry: string, defaultRegistry: string | undefined): boolean =>
  defaultRegistry !== undefined &&
  trailingSlash(registry).toLowerCase() === trailingSlash(defaultRegistry).toLowerCase();

/**
 * The refusal of a download link: it "must use `https`, unless it points at the installing user's
 * own default npm registry". Any other scheme (`ftp:`, `file:`) and a link with none is refused too.
 */
export function downloadLinkRefusal(
  link: string,
  defaultRegistry: string | undefined,
): string | undefined {
  return /^https:\/\//i.test(link) || isDefaultRegistryLink(link, defaultRegistry)
    ? undefined
    : `the download link ${link} does not use https`;
}

// ---- what each kind means ----

/** Where a specifier is read: the `package` value of an npm source, or a dependency of `package.json`. */
interface KindRule {
  /** The reason an npm `package` value of this kind is refused, if it is. */
  readonly packageValue: (value: string, defaultRegistry: string | undefined) => string | undefined;
  /** The reason a `package.json` dependency of this kind gets no install, if it gets none. */
  readonly dependency: string | undefined;
}

const never = (): undefined => undefined;
const always = (reason: string) => (): string => reason;

const NOT_A_REGISTRY_PACKAGE = 'it is a tarball link, not a registry package';
const GIT_DEPENDENCY = 'it is a git or GitHub dependency';

const KIND_RULES: { readonly [K in SpecifierKind]: KindRule } = {
  registry: { packageValue: never, dependency: undefined },
  // "use the package's own name" for the source; the alias still resolves from the registry (judgment).
  alias: {
    packageValue: always("it is an npm: alias; use the package's own name"),
    dependency: undefined,
  },
  folder: {
    packageValue: always(
      'it is a folder or file: path; use a relative path source for a folder in the marketplace',
    ),
    dependency: 'it is a folder dependency',
  },
  'git-scheme': { packageValue: always(NOT_A_LINK), dependency: GIT_DEPENDENCY },
  'git-address': { packageValue: always('it is a git address'), dependency: GIT_DEPENDENCY },
  workspace: {
    packageValue: always('it is a workspace link, not a registry package'),
    dependency: 'it is a workspace dependency',
  },
  linked: {
    packageValue: always('it is a link: dependency, not a registry package'),
    dependency: 'it is a linked dependency',
  },
  'tarball-host': {
    packageValue: always(
      'it is a tarball link on github.com, gist.github.com, gitlab.com, bitbucket.org or git.sr.ht (only a GitLab npm registry link under gitlab.com/api/v4/ is allowed)',
    ),
    dependency: NOT_A_REGISTRY_PACKAGE,
  },
  'tarball-http': {
    packageValue: (value, defaultRegistry) =>
      isDefaultRegistryLink(value, defaultRegistry)
        ? undefined
        : 'it is a tarball link over http, which is allowed only on your own default npm registry',
    dependency: NOT_A_REGISTRY_PACKAGE,
  },
  'tarball-https': { packageValue: never, dependency: NOT_A_REGISTRY_PACKAGE },
};

/** Why an npm source's `package` value is refused before anything is fetched. */
export function packageValueRefusal(
  value: string,
  defaultRegistry: string | undefined,
): string | undefined {
  return KIND_RULES[classifySpecifier(value)].packageValue(value, defaultRegistry);
}

/** Why a `package.json` dependency specifier gets no install; `undefined` for a registry package. */
export function dependencyRefusal(specifier: string): string | undefined {
  return KIND_RULES[classifySpecifier(specifier)].dependency;
}

/** Which kinds a lockfile entry may have and still be a registry package, by where the value is read. */
const REGISTRY_KINDS: {
  readonly [K in SpecifierKind]: { readonly resolved: boolean; readonly id: boolean };
} = {
  registry: { resolved: true, id: true },
  alias: { resolved: true, id: true },
  folder: { resolved: false, id: false },
  'git-scheme': { resolved: false, id: false },
  'git-address': { resolved: false, id: false },
  workspace: { resolved: false, id: false },
  linked: { resolved: false, id: false },
  'tarball-host': { resolved: false, id: false },
  // A `resolved` link is how npm records a registry download; a bun id with a link is a tarball dependency.
  'tarball-http': { resolved: true, id: false },
  'tarball-https': { resolved: true, id: false },
};

/** Whether an npm lockfile `resolved` value is a registry download (its scheme is checked as a download link). */
export const isRegistryOrigin = (resolved: string): boolean =>
  REGISTRY_KINDS[classifySpecifier(resolved)].resolved;

/** Whether the specifier of a `bun.lock` entry id (`name@spec`) is a registry package. */
export const isRegistryId = (specifier: string): boolean =>
  REGISTRY_KINDS[classifySpecifier(specifier)].id;

// ---- package.json ----

export const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;
export type DependencySection = (typeof DEPENDENCY_SECTIONS)[number];

export type DependencyMap = Readonly<Record<string, string>>;

/** The parts of a plugin's `package.json` the dependency install looks at. */
export interface PackageJson {
  readonly dependencies?: DependencyMap;
  readonly devDependencies?: DependencyMap;
  readonly optionalDependencies?: DependencyMap;
  readonly peerDependencies?: DependencyMap;
  /** npm `overrides`, present as written. */
  readonly overrides?: unknown;
  /** Bun `patchedDependencies`, present as written. */
  readonly patchedDependencies?: unknown;
}

/** The string entries of a dependency object; anything else lists nothing. */
export function readDependencyMap(value: unknown): DependencyMap {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/** A `package.json` that is there but is not a JSON object. */
export type ReadPackageJson = PackageJson | 'unreadable';

/** A parsed `package.json` value narrowed to the parts the install reads; `'unreadable'` for a value that is not an object. */
export function readPackageJson(value: unknown): ReadPackageJson {
  if (!isRecord(value)) return 'unreadable';
  const sections = DEPENDENCY_SECTIONS.flatMap((section) => {
    const map = readDependencyMap(value[section]);
    return Object.keys(map).length === 0 ? [] : [[section, map]];
  });
  return {
    ...Object.fromEntries(sections),
    ...('overrides' in value ? { overrides: value.overrides } : {}),
    ...('patchedDependencies' in value ? { patchedDependencies: value.patchedDependencies } : {}),
  };
}

export interface SpecifierRefusal {
  readonly section: DependencySection;
  readonly name: string;
  readonly specifier: string;
  readonly reason: string;
}

/** Every dependency of `package.json` that is not a registry package, with the reason. */
export function specifierRefusals(packageJson: PackageJson): readonly SpecifierRefusal[] {
  return DEPENDENCY_SECTIONS.flatMap((section) =>
    Object.entries(packageJson[section] ?? {}).flatMap(([name, specifier]) => {
      const reason = dependencyRefusal(specifier);
      return reason === undefined ? [] : [{ section, name, specifier, reason }];
    }),
  );
}
