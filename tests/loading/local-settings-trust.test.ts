/**
 * permissions.md § When your local settings file needs trust: `.claude/settings.local.json` applies
 * without the trust step unless tracked in git or `.claude` is a symlink; git runs only once the
 * folder is trusted (the dialog for it or a parent, or a `-p` or SDK session); until then the
 * configuration home applies it at once and anywhere else it is held like project settings.
 */
import { expect, test } from 'bun:test';
import {
  localSettingsVerdict,
  type LocalSettingsFacts,
} from '../../src/loading/local-settings-trust.ts';
import { spec } from '../support/spec.ts';

const own: LocalSettingsFacts = {
  trust: 'folder',
  inConfigurationHome: false,
  configHomeKeptAtRepositoryRoot: false,
  trackedInGit: false,
  claudeDirIsSymlink: false,
};
const verdict = (facts: Partial<LocalSettingsFacts>) => localSettingsVerdict({ ...own, ...facts });

spec('trust.behavior.When your local settings file needs trust', () => {
  test('an untracked file in a trusted folder applies', () => {
    expect(verdict({})).toEqual({ rulesApply: true, runsGit: true });
  });

  test('a file tracked in git, or a .claude symlink, is repository-supplied: held until the exact folder is trusted', () => {
    for (const supplied of [{ trackedInGit: true }, { claudeDirIsSymlink: true }]) {
      expect(verdict({ ...supplied, trust: 'parent' })).toEqual({
        rulesApply: false,
        runsGit: true,
      });
      expect(verdict({ ...supplied, trust: 'accepted-by-session' }).rulesApply).toBe(false);
      expect(verdict({ ...supplied, trust: 'folder' }).rulesApply).toBe(true);
    }
  });

  test('git runs for a trusted folder, a parent whose trust extends to it and a -p or SDK session, not before', () => {
    for (const trust of ['folder', 'parent', 'accepted-by-session'] as const) {
      expect(verdict({ trust }).runsGit).toBe(true);
    }
    expect(verdict({ trust: 'untrusted' }).runsGit).toBe(false);
  });

  test('once the check ran, an untracked file applies even though that exact folder was not trusted', () => {
    expect(verdict({ trust: 'parent' }).rulesApply).toBe(true);
    expect(verdict({ trust: 'accepted-by-session' }).rulesApply).toBe(true);
  });

  test('before trust, the configuration home applies the file right away without running git', () => {
    expect(verdict({ trust: 'untrusted', inConfigurationHome: true })).toEqual({
      rulesApply: true,
      runsGit: false,
    });
  });

  test('before trust, anywhere else the file is held like project settings, without running git', () => {
    expect(verdict({ trust: 'untrusted' })).toEqual({ rulesApply: false, runsGit: false });
  });

  test('a CLAUDE_CONFIG_DIR inside a repository whose local settings live at the root is held like anywhere else', () => {
    expect(
      verdict({
        trust: 'untrusted',
        inConfigurationHome: true,
        configHomeKeptAtRepositoryRoot: true,
      }),
    ).toEqual({ rulesApply: false, runsGit: false });
  });
});
