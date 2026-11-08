import type { PluginIssue } from '../format/issues.ts';
import type { CommandSpec } from '../ports/command-runner.ts';
import type { LockfileFacts, LockfileName } from './node-deps-lockfile.ts';
import type { PackageJson } from './node-deps-spec.ts';
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

/** Lockfiles Claude Code recognises and skips the install for. */
export type UnsupportedLockfile = 'bun.lockb' | 'yarn.lock' | 'pnpm-lock.yaml';

/** "Claude Code stops an install that runs longer and treats it as failed." */
export const INSTALL_TIMEOUT_MS = 60_000;

export interface NodeDepsInput {
  readonly origin: DepsOrigin;
  /** The plugin's root directory: the version directory of a copy, or the source directory in place. */
  readonly pluginRoot: string;
  /** A folder of its own for the package manager, outside the plugin. */
  readonly installDir: string;
  readonly join: PathJoin;
  /** The root `package.json`; absent when the plugin has none. */
  readonly packageJson: PackageJson | undefined;
  /** The supported lockfiles found at the plugin root, read. */
  readonly lockfiles: { readonly [N in LockfileName]?: LockfileFacts };
  /** The lockfiles Claude Code does not install from, found at the plugin root. */
  readonly otherLockfiles: readonly UnsupportedLockfile[];
  /** The package managers the user's PATH has. */
  readonly available: readonly PackageManager[];
  /** The installing user's own default npm registry, if configured. */
  readonly defaultRegistry?: string;
}

export type SkipReason =
  | 'loaded-in-place'
  | 'link-mode'
  | 'no-package-json'
  | 'no-lockfile'
  | 'unsupported-lockfile'
  | 'lockfile-format'
  | 'package-manager-missing'
  | 'overrides'
  | 'patched-dependencies'
  | 'non-registry-dependency'
  | 'insecure-download'
  | 'lockfile-mismatch'
  | 'install-folder';

export interface NodeDepsSkip {
  readonly action: 'skip';
  readonly reason: SkipReason;
  /** The names the reason is about: lockfiles, packages, links, a package manager. */
  readonly detail: readonly string[];
  /** A plugin loaded in place: its dependencies resolve against this source directory. */
  readonly resolvesFrom?: string;
}

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
    /** On success, `node_modules` moves from the install folder into the plugin. */
    readonly moveBack: StagedFile;
  };
}

export type NodeDepsPlan = NodeDepsInstall | NodeDepsSkip;

export interface NodeDepsResult {
  readonly plan: NodeDepsPlan;
  readonly issues: readonly PluginIssue[];
}

export const skip = (
  reason: SkipReason,
  detail: readonly string[] = [],
  extra: Partial<NodeDepsSkip> = {},
): NodeDepsSkip => ({ action: 'skip', reason, detail, ...extra });
