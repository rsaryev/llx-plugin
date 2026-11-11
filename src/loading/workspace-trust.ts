/**
 * Workspace trust (permissions.md, "Project allow rules and workspace trust"; hooks.md, "Workspace
 * trust"): which folder the trust is keyed on, how far it reaches, and what a session counts as
 * trusted. Pure over what the host reports; the answer to "was the dialog accepted" is the
 * `WorkspaceTrust` port's.
 */
import type { WorkspaceTrust } from './ports.ts';
import { contentGate, trustSituation, type TrustSituation } from './trust-gates.ts';

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

/** The directories above the folder whose trust extends to it: none in a repository, else `ancestors`, nearest first. */
const coveringParents = (facts: TrustFacts): readonly string[] =>
  facts.repositoryRoot !== undefined || facts.mainCheckoutRoot !== undefined
    ? []
    : (facts.ancestors ?? []);

/** Whether the dialog was accepted for a directory above the folder whose trust extends to it. */
async function parentTrusted(
  trust: WorkspaceTrust,
  facts: TrustFacts,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  for (const ancestor of coveringParents(facts)) {
    if (await trust.isFolderTrusted(ancestor, signal)) return true;
  }
  return false;
}

export interface TrustStateOptions {
  /** `claude -p` or the SDK, which never shows the dialog. */
  readonly nonInteractive?: boolean;
  readonly signal?: AbortSignal | undefined;
}

/**
 * The folder's column of the trust table (`trustSituation`) from what the port answers: `trusted`
 * when the dialog was accepted for the key; else `non-interactive` in a `-p` or SDK session; else
 * `parent-trusted` when, outside a repository, a directory above was trusted, whose trust extends to
 * every subdirectory "apart from a git repository nested inside it" (in a repository no parent is
 * asked, so a nested repository is never covered); else `dialog`.
 */
export async function workspaceTrustState(
  trust: WorkspaceTrust,
  facts: TrustFacts,
  options: TrustStateOptions = {},
): Promise<TrustSituation> {
  const { signal } = options;
  const nonInteractive = options.nonInteractive === true;
  const folderTrusted = await trust.isFolderTrusted(workspaceTrustKey(facts).key, signal);
  const asked = folderTrusted || nonInteractive ? false : await parentTrusted(trust, facts, signal);
  return trustSituation({
    folderTrusted,
    parentTrusted: asked,
    nonInteractive,
    nestedRepository: false,
  });
}

/**
 * `workspaceTrustState` for a host that knows synchronously whether the dialog was accepted for a
 * folder (it read the state file already): the same column, the same folders asked in the same order.
 */
export function workspaceTrustSituation(
  isFolderTrusted: (folder: string) => boolean,
  facts: TrustFacts,
  options: Omit<TrustStateOptions, 'signal'> = {},
): TrustSituation {
  const nonInteractive = options.nonInteractive === true;
  const folderTrusted = isFolderTrusted(workspaceTrustKey(facts).key);
  const parent = !folderTrusted && !nonInteractive && coveringParents(facts).some(isFolderTrusted);
  return trustSituation({
    folderTrusted,
    parentTrusted: parent,
    nonInteractive,
    nestedRepository: false,
  });
}

/**
 * Whether hooks of a settings file may run (hooks.md, "Workspace trust"): the trust table's
 * `settings-hooks` row. In an interactive session once the dialog was accepted "for the folder, or
 * for a parent directory whose trust extends to it"; in a `-p` or SDK session always, because it
 * "never shows the dialog and treats the folder as trusted".
 */
export const settingsHooksMayRun = (situation: TrustSituation): boolean =>
  contentGate('settings-hooks', situation).applies;

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

/**
 * The warning for project allow rules or additional directories a folder that is not trusted
 * cannot supply (errors.md, "Workspace has not been trusted"). `count` and `file` say how many
 * entries of which settings file were skipped, `setting` is `permissions.allow` or
 * `permissions.additionalDirectories`, `key` is the `projects` key of the folder and `claudeJson`
 * the path of `~/.claude.json` as the host shows it.
 */
export function untrustedWorkspaceWarning(input: {
  readonly count: number;
  readonly setting: 'permissions.allow' | 'permissions.additionalDirectories';
  readonly file: string;
  readonly key: string;
  readonly claudeJson: string;
}): string {
  const noun = input.count === 1 ? 'entry' : 'entries';
  return `Ignoring ${input.count} ${input.setting} ${noun} from ${input.file}: this workspace has not been trusted. Run Claude Code interactively here once and accept the trust dialog, or set projects["${input.key}"].hasTrustDialogAccepted: true in ${input.claudeJson}.`;
}
