/**
 * Workspace trust (permissions.md, "Project allow rules and workspace trust"; hooks.md, "Workspace
 * trust"): which folder the trust is keyed on, how far it reaches, and what a session counts as
 * trusted. Pure over what the host reports; the answer to "was the dialog accepted" is the
 * `WorkspaceTrust` port's.
 */
import type { WorkspaceTrust } from './ports.ts';

export interface TrustFacts {
  /** The directory the session started in. */
  readonly startDir: string;
  /** The root of the git repository that holds `startDir` (a submodule or clone is its own); absent outside any repository. */
  readonly repositoryRoot?: string | undefined;
  /** In a worktree: the root of the main checkout. */
  readonly mainCheckoutRoot?: string | undefined;
  readonly homeDir: string;
  /** Outside a repository: the directories above `startDir`, nearest first. */
  readonly ancestors?: readonly string[] | undefined;
}

export interface TrustKey {
  /** The folder the dialog's answer is stored under. */
  readonly key: string;
  /** False in the home directory: "holds the trust for the current session only and doesn't write it to disk". */
  readonly persisted: boolean;
}

/**
 * "In a repository, Claude Code keys the trust on the git repository root ... In a worktree, it uses
 * the main checkout's root. Outside a repository, Claude Code keys the trust on the directory you
 * started it from." A git repository nested inside another (a submodule, a clone) is a repository of
 * its own, so it has its own key and the outer trust does not cover it.
 */
export function workspaceTrustKey(facts: TrustFacts): TrustKey {
  const key = facts.mainCheckoutRoot ?? facts.repositoryRoot ?? facts.startDir;
  return { key, persisted: key !== facts.homeDir };
}

/**
 * `folder`: the dialog was accepted for the key. `parent`: outside a repository, for a directory
 * above it, whose trust extends to every subdirectory "apart from a git repository nested inside
 * it"; the folder then "counts as a folder whose parent you trusted". `none`: neither.
 */
export type WorkspaceTrustState = 'folder' | 'parent' | 'none';

export async function workspaceTrustState(
  trust: WorkspaceTrust,
  facts: TrustFacts,
  signal?: AbortSignal,
): Promise<WorkspaceTrustState> {
  const { key } = workspaceTrustKey(facts);
  if (await trust.isFolderTrusted(key, signal)) return 'folder';
  if (facts.repositoryRoot !== undefined || facts.mainCheckoutRoot !== undefined) return 'none';
  for (const ancestor of facts.ancestors ?? []) {
    if (await trust.isFolderTrusted(ancestor, signal)) return 'parent';
  }
  return 'none';
}

/**
 * Whether hooks of a settings file may run (hooks.md, "Workspace trust"): in an interactive session
 * once the dialog was accepted "for the folder, or for a parent directory whose trust extends to it";
 * in a `-p` or SDK session always, because it "never shows the dialog and treats the folder as trusted".
 */
export const settingsHooksMayRun = (nonInteractive: boolean, state: WorkspaceTrustState): boolean =>
  nonInteractive || state !== 'none';

/**
 * The entry that trusts a folder without the dialog: `projects["<path>"].hasTrustDialogAccepted`
 * set to `true` in `~/.claude.json`, `<path>` being the key.
 */
export function manualTrustEntry(key: string): {
  readonly file: '~/.claude.json';
  readonly path: readonly ['projects', string, 'hasTrustDialogAccepted'];
  readonly value: true;
} {
  return { file: '~/.claude.json', path: ['projects', key, 'hasTrustDialogAccepted'], value: true };
}
