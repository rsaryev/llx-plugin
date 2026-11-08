import type { PluginIssue } from '../format/issues.ts';
import type { CommandSpec } from '../ports/command-runner.ts';
import type { LockfileFacts, LockfileName } from './node-deps-lockfile.ts';
import type { ReadPackageJson } from './node-deps-spec.ts';
import type { InstallMode } from './install-mode.ts';
import type { PathJoin } from './store-layout.ts';

/**
 * The Node.js package dependencies of a plugin (plugins/loading.md, "Node.js package dependencies":
 * "When the dependency install runs", "Limits on the dependency install"; plugins/marketplace-
 * reference.md, "Copy mode and link mode", "npm plugin source"). Pure: the facts of the plugin's
 * `package.json` and lockfiles in, a plan out (install through `CommandRunner`, or skip and why);
 * the host copies the two files, runs the command and moves `node_modules`. Why an install did not
 * happen, and what the user is told, is `node-deps-failure`.
 */

export type PackageManager = 'bun' | 'npm';

/** Where the plugin's files lie, as far as the install goes (`InstallMode`, `InstallOrigin`). */
export type DepsOrigin = 'copied' | 'in-place' | 'inline' | 'linked';

/** The install mode of `decideInstallMode` as the origin the dependency plan takes (`inline`: a session-only plugin, never an install mode). */
export const DEPS_ORIGIN_OF_MODE: { readonly [M in InstallMode]: DepsOrigin } = {
  copy: 'copied',
  'in-place': 'in-place',
  'link-in-cache': 'linked',
};

/** The lockfiles Claude Code recognises and skips the install for. */
export const UNSUPPORTED_LOCKFILES = ['bun.lockb', 'yarn.lock', 'pnpm-lock.yaml'] as const;
export type UnsupportedLockfile = (typeof UNSUPPORTED_LOCKFILES)[number];

/** "Claude Code stops an install that runs longer and treats it as failed." */
export const INSTALL_TIMEOUT_MS = 60_000;

export interface NodeDepsInput {
  readonly origin: DepsOrigin;
  /** The plugin's root directory: the version directory of a copy, or the source directory in place. */
  readonly pluginRoot: string;
  /** A folder of its own for the package manager, outside the plugin. */
  readonly installDir: string;
  readonly join: PathJoin;
  /** The root `package.json`: `undefined` when the plugin has none, `'unreadable'` when it is there but is not a JSON object. */
  readonly packageJson: ReadPackageJson | undefined;
  /** The supported lockfiles found at the plugin root, read. */
  readonly lockfiles: { readonly [N in LockfileName]?: LockfileFacts };
  /** The lockfiles Claude Code does not install from, found at the plugin root. */
  readonly otherLockfiles: readonly UnsupportedLockfile[];
  /** The package managers the user's PATH has. */
  readonly available: readonly PackageManager[];
  /** The installing user's own default npm registry, if configured. */
  readonly defaultRegistry?: string;
}

/** What each reason carries: the names it is about (lockfiles, packages, links, a package manager). */
interface SkipFields {
  /** A plugin loaded in place: its dependencies resolve against this source directory. */
  'loaded-in-place': { readonly resolvesFrom: string };
  'link-mode': unknown;
  'no-package-json': unknown;
  'package-json-unreadable': unknown;
  'no-lockfile': unknown;
  'unsupported-lockfile': { readonly lockfiles: readonly UnsupportedLockfile[] };
  /** `version` is `undefined` when the lockfile has no readable `lockfileVersion`. */
  'lockfile-format': { readonly lockfile: LockfileName; readonly version: number | undefined };
  'package-manager-missing': { readonly manager: PackageManager };
  overrides: unknown;
  'patched-dependencies': unknown;
  /** Each as `name: reason`. */
  'non-registry-dependency': { readonly dependencies: readonly string[] };
  /** Each as `name@version`, or the name alone when the lockfile gives no version. */
  'unpinned-dependency': { readonly packages: readonly string[] };
  'insecure-download': { readonly links: readonly string[] };
  /** Each as `section: names`. */
  'lockfile-mismatch': { readonly differences: readonly string[] };
  'install-folder': { readonly installDir: string };
}

export type SkipReason = keyof SkipFields;

/** The skip of one reason, with the fields that reason carries. */
export type SkipOf<R extends SkipReason> = {
  readonly action: 'skip';
  readonly reason: R;
} & SkipFields[R];

export type NodeDepsSkip = { readonly [R in SkipReason]: SkipOf<R> }[SkipReason];

/** The reasons that carry nothing. */
export type BareReason = {
  readonly [R in SkipReason]: SkipFields[R] extends object ? never : R;
}[SkipReason];

export interface StagedFile {
  readonly from: string;
  readonly to: string;
}

export interface NodeDepsInstall {
  readonly action: 'install';
  readonly reason: 'copied-version-directory';
  readonly packageManager: PackageManager;
  readonly lockfile: LockfileName;
  /** The versions the lockfile pins, exactly. */
  readonly frozen: true;
  /** No `preinstall`, `install` or `postinstall` script runs. */
  readonly ignoreScripts: true;
  readonly run: {
    readonly spec: Extract<CommandSpec, { form: 'exec' }>;
    /** The separate install folder. */
    readonly cwd: string;
    readonly timeoutMs: number;
  };
  readonly stage: {
    readonly directory: string;
    /** The only files the install folder holds: the dependency list and its lockfile. */
    readonly copy: readonly StagedFile[];
    /** On success, `node_modules` moves from the install folder into the plugin and replaces one already there (judgment). */
    readonly moveBack: StagedFile & { readonly replaceExisting: true };
  };
}

export type NodeDepsPlan = NodeDepsInstall | NodeDepsSkip;

export interface NodeDepsResult {
  readonly plan: NodeDepsPlan;
  readonly issues: readonly PluginIssue[];
}

/** A skip that carries nothing but its reason. */
export const skipFor = (reason: BareReason): NodeDepsSkip => ({ action: 'skip', reason });

const IS_SKIP: { readonly [A in NodeDepsPlan['action']]: boolean } = { skip: true, install: false };

export const isSkip = (plan: NodeDepsPlan): plan is NodeDepsSkip => IS_SKIP[plan.action];
