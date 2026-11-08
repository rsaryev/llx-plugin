import type { LockfileFacts, LockfileName, RootDependencies } from './node-deps-lockfile.ts';
import {
  DEPENDENCY_SECTIONS,
  dependencyRefusal,
  downloadLinkRefusal,
  specifierRefusals,
  type PackageJson,
} from './node-deps-spec.ts';
import {
  skip,
  type DepsOrigin,
  type NodeDepsInput,
  type NodeDepsSkip,
  type PackageManager,
} from './node-deps-types.ts';

/** The checks that decide whether the dependency install applies and may run (plugins/loading.md, "When the dependency install runs", "Limits on the dependency install"). */

// ---- lockfiles: which one counts, and what each means ----

/** "If a plugin contains more than one of these lockfiles, Claude Code uses the first match." */
const LOCKFILE_ORDER: readonly LockfileName[] = [
  'bun.lock',
  'npm-shrinkwrap.json',
  'package-lock.json',
];

const MANAGER_OF: { readonly [N in LockfileName]: PackageManager } = {
  'bun.lock': 'bun',
  'npm-shrinkwrap.json': 'npm',
  'package-lock.json': 'npm',
};

/** "an npm lockfile needs a `lockfileVersion` of `2` or `3` ... a `bun.lock` needs a `lockfileVersion` no higher than `2`". */
const READABLE_VERSION: { readonly [N in LockfileName]: (version: number) => boolean } = {
  'bun.lock': (version) => Number.isInteger(version) && version >= 0 && version <= 2,
  'npm-shrinkwrap.json': (version) => version === 2 || version === 3,
  'package-lock.json': (version) => version === 2 || version === 3,
};

/** Frozen resolution: npm ci and bun install --frozen-lockfile, both without scripts (judgment: the flags are the tools' own). */
export const ARGUMENTS: { readonly [P in PackageManager]: readonly string[] } = {
  npm: ['ci', '--ignore-scripts'],
  bun: ['install', '--frozen-lockfile', '--ignore-scripts'],
};

// ---- the checks ----

export interface Ready {
  readonly packageJson: PackageJson;
  readonly lockfile: LockfileName;
  readonly facts: LockfileFacts;
  readonly manager: PackageManager;
}

type Check = (ready: Ready, input: NodeDepsInput) => NodeDepsSkip | undefined;

const hasEntries = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && Object.keys(value).length > 0;

/** What is refused per package manager: "npm `overrides` ... from an npm lockfile", "Bun `patchedDependencies` ... from `bun.lock`". */
const MANAGER_REFUSALS: {
  readonly [P in PackageManager]: (packageJson: PackageJson) => NodeDepsSkip | undefined;
} = {
  npm: (packageJson) => (hasEntries(packageJson.overrides) ? skip('overrides') : undefined),
  bun: (packageJson) =>
    hasEntries(packageJson.patchedDependencies) ? skip('patched-dependencies') : undefined,
};

const unreadableFormat: Check = (ready) =>
  ready.facts.version !== undefined && READABLE_VERSION[ready.lockfile](ready.facts.version)
    ? undefined
    : skip('lockfile-format', [ready.lockfile, String(ready.facts.version)]);

const managerMissing: Check = (ready, input) =>
  input.available.includes(ready.manager)
    ? undefined
    : skip('package-manager-missing', [ready.manager]);

const setsOverrides: Check = (ready) => MANAGER_REFUSALS[ready.manager](ready.packageJson);

const notRegistry: Check = (ready) => {
  const named = [
    ...specifierRefusals(ready.packageJson).map((entry) => `${entry.name}: ${entry.reason}`),
    ...ready.facts.locked.flatMap((entry) => {
      const reason = dependencyRefusal(entry.origin);
      return reason === undefined ? [] : [`${entry.name}: ${reason}`];
    }),
  ];
  return named.length === 0 ? undefined : skip('non-registry-dependency', [...new Set(named)]);
};

const insecureDownload: Check = (ready, input) => {
  const refused = ready.facts.downloads.flatMap((link) => {
    const reason = downloadLinkRefusal(link, input.defaultRegistry);
    return reason === undefined ? [] : [reason];
  });
  return refused.length === 0 ? undefined : skip('insecure-download', refused);
};

/** The dependency names that `package.json` and the lockfile do not list the same way. */
function differing(
  listed: RootDependencies[keyof RootDependencies],
  locked: typeof listed,
): string[] {
  const names = new Set([...Object.keys(listed ?? {}), ...Object.keys(locked ?? {})]);
  return [...names].filter((name) => listed?.[name] !== locked?.[name]);
}

const outOfDate: Check = (ready) => {
  const detail = DEPENDENCY_SECTIONS.flatMap((section) => {
    const names = differing(ready.packageJson[section], ready.facts.root[section]);
    return names.length === 0 ? [] : [`${section}: ${names.join(', ')}`];
  });
  return detail.length === 0 ? undefined : skip('lockfile-mismatch', detail);
};

export const CHECKS: readonly Check[] = [
  unreadableFormat,
  managerMissing,
  setsOverrides,
  notRegistry,
  insecureDownload,
  outOfDate,
];

// ---- before the checks: does an install apply at all ----

const BY_ORIGIN: {
  readonly [O in DepsOrigin]: (input: NodeDepsInput) => NodeDepsSkip | undefined;
} = {
  copied: () => undefined,
  // "Claude Code doesn't install the dependencies into the source directory"; they resolve there.
  'in-place': (input) => skip('loaded-in-place', [], { resolvesFrom: input.pluginRoot }),
  inline: (input) => skip('loaded-in-place', [], { resolvesFrom: input.pluginRoot }),
  // "Claude Code skips the Node.js package dependency install for a link-mode plugin"
  linked: () => skip('link-mode'),
};

function selectLockfile(input: NodeDepsInput): LockfileName | undefined {
  return LOCKFILE_ORDER.find((name) => input.lockfiles[name] !== undefined);
}

/** The package.json and lockfile the install would use, or why none applies. */
export function prepare(input: NodeDepsInput): Ready | NodeDepsSkip {
  const early = BY_ORIGIN[input.origin](input);
  if (early !== undefined) return early;
  const { packageJson } = input;
  if (packageJson === undefined) return skip('no-package-json');
  const lockfile = selectLockfile(input);
  const facts = lockfile === undefined ? undefined : input.lockfiles[lockfile];
  if (lockfile === undefined || facts === undefined) {
    return input.otherLockfiles.length > 0
      ? skip('unsupported-lockfile', input.otherLockfiles)
      : skip('no-lockfile');
  }
  return { packageJson, lockfile, facts, manager: MANAGER_OF[lockfile] };
}

export const isReady = (value: Ready | NodeDepsSkip): value is Ready => !('action' in value);
