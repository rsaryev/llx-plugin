/**
 * When `.claude/settings.local.json` needs trust (permissions.md, "When your local settings file
 * needs trust"). The file "is normally your own", so its allow rules and additional directories apply
 * without the trust step; "when the file is tracked in git, or `.claude` is a symlink", it is
 * repository-supplied and its rules wait for trust. Pure over the facts the host reports (git is the
 * host's effect, run only once the folder is trusted).
 */

/**
 * What the session knows of the folder's trust: the dialog was accepted for the exact folder, only
 * for a parent whose trust extends to it, never (`untrusted`), or the session is `-p` or SDK, which
 * "counts as accepted" for running git.
 */
export const LOCAL_TRUST = ['folder', 'parent', 'accepted-by-session', 'untrusted'] as const;
export type LocalTrust = (typeof LOCAL_TRUST)[number];

export interface LocalSettingsFacts {
  readonly trust: LocalTrust;
  /** The folder is the user's configuration home: the home directory, or one whose `.claude` is `CLAUDE_CONFIG_DIR`. */
  readonly inConfigurationHome: boolean;
  /**
   * That `CLAUDE_CONFIG_DIR` directory sits inside a git repository and the local settings are kept
   * at the repository root instead.
   */
  readonly configHomeKeptAtRepositoryRoot: boolean;
  /** What git said, read only when `runsGit` is true: the file is tracked in a repository. */
  readonly trackedInGit: boolean;
  /** `.claude` is a symlink. */
  readonly claudeDirIsSymlink: boolean;
}

export interface LocalSettingsVerdict {
  /** The file's allow rules and additional directories apply now. */
  readonly rulesApply: boolean;
  /** Claude Code runs git to tell the cases apart. */
  readonly runsGit: boolean;
}

/** Whether git may run: "once you've trusted the folder", for it or a parent, or in a `-p` or SDK session. */
const GIT_MAY_RUN: { readonly [T in LocalTrust]: boolean } = {
  folder: true,
  parent: true,
  'accepted-by-session': true,
  untrusted: false,
};

/** Whether the dialog was accepted for the exact folder: what releases a repository-supplied file. */
const EXACT: { readonly [T in LocalTrust]: boolean } = {
  folder: true,
  parent: false,
  'accepted-by-session': false,
  untrusted: false,
};

export function localSettingsVerdict(facts: LocalSettingsFacts): LocalSettingsVerdict {
  if (!GIT_MAY_RUN[facts.trust]) {
    // The configuration-home exception skips only the trust step, unless the settings live at a repository root.
    const own = facts.inConfigurationHome && !facts.configHomeKeptAtRepositoryRoot;
    return { rulesApply: own, runsGit: false };
  }
  const repositorySupplied = facts.trackedInGit || facts.claudeDirIsSymlink;
  return { rulesApply: !repositorySupplied || EXACT[facts.trust], runsGit: true };
}
