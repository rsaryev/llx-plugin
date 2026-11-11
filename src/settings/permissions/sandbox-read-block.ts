import { isWithin } from '../../format/path-text.ts';
/**
 * What `permissions.blockReadsOutsideWorkingDirectories` does to sandboxed commands (settings-reference.md,
 * "Sandboxed commands under the block"). Pure over the facts the host reads; the sandbox is the host's.
 */

/** "Your home directory and ... the other roots that hold user files." */
export const BLOCKED_USER_ROOTS: readonly string[] = [
  '/Users',
  '/home',
  '/root',
  '/Volumes',
  '/mnt',
  '/media',
  '/run/media',
  '/srv',
];

export interface SandboxBlockInput {
  /** The block key is `true` in some file. */
  readonly blockReads: boolean;
  /** `sandbox.filesystem.disabled`. */
  readonly filesystemDisabled: boolean;
  /** `allowManagedReadPathsOnly` is set. */
  readonly managedReadPathsOnly: boolean;
  /** "The path of the directory you started Claude Code in contains a glob character". */
  readonly startDirectory: string;
  /** The home directory of the user. */
  readonly home: string;
}

export interface SandboxBlock {
  /** Whether the block reaches sandboxed commands; Claude's file tools enforce it either way. */
  readonly reachesSandbox: boolean;
  /** Roots a sandboxed command may not read. */
  readonly denyRead: readonly string[];
  /** "`allowRead` and `allowWrite` entries from repository settings don't count" while the block is in force. */
  readonly repositoryAllowEntriesCount: boolean;
}

const OFF: SandboxBlock = {
  reachesSandbox: false,
  denyRead: [],
  repositoryAllowEntriesCount: true,
};

/** The block's effect on sandboxed commands: it reaches them unless one of the three cases the docs list holds. */
export function sandboxReadBlock(input: SandboxBlockInput): SandboxBlock {
  const exempt =
    !input.blockReads ||
    input.filesystemDisabled ||
    input.managedReadPathsOnly ||
    /[*?[]/.test(input.startDirectory);
  if (exempt) return OFF;
  return {
    reachesSandbox: true,
    denyRead: [input.home, ...BLOCKED_USER_ROOTS],
    repositoryAllowEntriesCount: false,
  };
}

/** "Under the block, Claude Code re-opens your global git configuration files": the paths it names. */
export function gitConfigReopened(input: {
  readonly home: string;
  readonly xdgConfigHome?: string;
  readonly included: readonly string[];
  /** Files a sandboxed command can write, directly or through a symlink: not re-opened. */
  readonly writable: ReadonlySet<string>;
  /** `sandbox.filesystem.denyRead` entries: they "always take precedence over this re-open". */
  readonly denyRead: readonly string[];
}): readonly string[] {
  const xdg = input.xdgConfigHome ?? `${input.home}/.config`;
  const candidates = [
    `${input.home}/.gitconfig`,
    `${xdg}/git/config`,
    `${xdg}/git/ignore`,
    `${xdg}/git/attributes`,
    ...input.included,
  ];
  return candidates.filter(
    (file) => !input.writable.has(file) && !input.denyRead.some((entry) => isWithin(entry, file)),
  );
}
