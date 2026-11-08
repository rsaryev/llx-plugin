import type { PolicyView } from '../view.ts';

/**
 * The `worktree` block (settings-reference.md, `worktree` and its entries): the fields as the files
 * combine them, with the documented default of each. An invalid field never reaches the layer: the
 * read drops it with a warning (`closed-fields.ts`), so a lower file's value or the default applies.
 */
export interface WorktreeSettings {
  /** `"fresh"` branches from `origin/<default-branch>`, `"head"` from the current local `HEAD`. */
  readonly baseRef: 'fresh' | 'head';
  /** Directories symlinked from the main repository into each worktree; none by default. */
  readonly symlinkDirectories: readonly string[];
  /** Directories checked out by git sparse-checkout; `undefined` checks out the whole tree. */
  readonly sparsePaths: readonly string[] | undefined;
  /** How background sessions isolate their file edits. */
  readonly bgIsolation: 'worktree' | 'none';
  /** The folder Desktop SSH sessions create their worktrees in, from user settings only. */
  readonly location: string | undefined;
}

export function readWorktree(view: PolicyView): WorktreeSettings {
  const block = view.get('worktree');
  return {
    baseRef: block?.baseRef ?? 'fresh',
    symlinkDirectories: block?.symlinkDirectories ?? [],
    sparsePaths: block?.sparsePaths,
    bgIsolation: block?.bgIsolation ?? 'worktree',
    location: view.get('worktree.location'),
  };
}

/** Where a new worktree starts from. */
export type BaseRefTarget = 'origin-default-branch' | 'checkout-head' | 'linked-worktree-head';

export interface BaseRefFacts {
  /** The session runs inside a linked worktree rather than the main checkout. */
  readonly insideLinkedWorktree: boolean;
}

/**
 * What a `baseRef` resolves to: `"head"` is the current local `HEAD`, and "inside a linked worktree,
 * `"head"` resolves to that worktree's `HEAD`, not the main checkout's".
 */
export function baseRefTarget(
  baseRef: WorktreeSettings['baseRef'],
  facts: BaseRefFacts,
): BaseRefTarget {
  if (baseRef === 'fresh') return 'origin-default-branch';
  return facts.insideLinkedWorktree ? 'linked-worktree-head' : 'checkout-head';
}

export interface BackgroundEditFacts {
  /** The session was moved to the background with `←` or `/background`. */
  readonly movedToBackground: boolean;
  /** The session has called `EnterWorktree`. */
  readonly enteredWorktree: boolean;
  readonly insideGitRepository: boolean;
  /** A `WorktreeCreate` hook failed (the non-git version control case). */
  readonly worktreeCreateHookFailed: boolean;
}

/**
 * Whether `Edit` and `Write` are refused in the main checkout of a background session. `"worktree"`
 * blocks them "until the session calls `EnterWorktree`"; `"none"` lets jobs edit the working copy;
 * a session moved to the background "edits files in place whatever this key says"; and "outside a
 * git repository, a `WorktreeCreate` hook that fails releases the block".
 */
export function backgroundEditsBlocked(
  bgIsolation: WorktreeSettings['bgIsolation'],
  facts: BackgroundEditFacts,
): boolean {
  if (bgIsolation === 'none' || facts.movedToBackground || facts.enteredWorktree) return false;
  return facts.insideGitRepository || !facts.worktreeCreateHookFailed;
}

/** Who creates a worktree. */
export const WORKTREE_CONSUMERS = [
  'desktop-ssh',
  'worktree-flag',
  'enter-worktree-tool',
  'isolated-subagent',
  'background-session',
] as const;
export type WorktreeConsumer = (typeof WORKTREE_CONSUMERS)[number];

export interface WorktreeFolderFacts {
  readonly consumer: WorktreeConsumer;
  /** The **Worktree folder** set on the SSH connection in Desktop. */
  readonly connectionFolder?: string;
  /** The organization restricts which folders sessions may use. */
  readonly organizationRestrictsFolders?: boolean;
}

/** The consumers that read `worktree.location`: "Only the desktop app reads this key". */
const READS_LOCATION: { readonly [C in WorktreeConsumer]: boolean } = {
  'desktop-ssh': true,
  'worktree-flag': false,
  'enter-worktree-tool': false,
  'isolated-subagent': false,
  'background-session': false,
};

/**
 * The folder worktrees go in instead of `<project-root>/.claude/worktrees/`, or `undefined` for the
 * project's own. The connection's folder "takes precedence"; an organization's restriction keeps the
 * worktrees inside the project.
 */
export function worktreeFolder(
  settings: WorktreeSettings,
  facts: WorktreeFolderFacts,
): string | undefined {
  if (!READS_LOCATION[facts.consumer] || facts.organizationRestrictsFolders === true) {
    return undefined;
  }
  return facts.connectionFolder ?? settings.location;
}
