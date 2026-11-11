/**
 * When `.claude/settings.local.json` needs trust (permissions.md, "When your local settings file
 * needs trust"). The file "is normally your own", so its allow rules and additional directories apply
 * without the trust step; "when the file is tracked in git, or `.claude` is a symlink", it is
 * repository-supplied and its rules wait for trust. Pure over the facts the host reports (git is the
 * host's effect, run only once the folder is trusted).
 */

import { contentGate, type TrustSituation } from './trust-gates.ts';

export interface LocalSettingsFacts {
  /**
   * The folder's trust (`trustSituation`): the dialog accepted for the exact folder (`trusted`), only
   * for a parent whose trust extends to it, never (`dialog`), or a `-p` or SDK session, which "counts
   * as accepted" for running git.
   */
  readonly trust: TrustSituation;
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
const GIT_MAY_RUN: { readonly [T in TrustSituation]: boolean } = {
  trusted: true,
  'parent-trusted': true,
  'non-interactive': true,
  dialog: false,
};

export function localSettingsVerdict(facts: LocalSettingsFacts): LocalSettingsVerdict {
  if (!GIT_MAY_RUN[facts.trust]) {
    // The configuration-home exception skips only the trust step, unless the settings live at a repository root.
    const own = facts.inConfigurationHome && !facts.configHomeKeptAtRepositoryRoot;
    return { rulesApply: own, runsGit: false };
  }
  const repositorySupplied = facts.trackedInGit || facts.claudeDirIsSymlink;
  // A repository-supplied file's rules are project allow rules: the trust table's `allow-rules` row.
  const released = contentGate('allow-rules', facts.trust).applies;
  return { rulesApply: !repositorySupplied || released, runsGit: true };
}
