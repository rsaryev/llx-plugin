/**
 * plugins/loading.md § Trust check and component limits for repository plugins ("loads only after
 * the same trust check that applies to project allow rules ... Trusting a parent folder or running
 * with `-p` isn't enough"; "Neither the trust check nor these component limits apply to a plugin
 * under your own `~/.claude/skills/`"); § Check why a repository plugin didn't load (In a
 * subdirectory, From the desktop app, in a worktree, In a folder you haven't trusted, In an
 * organization that manages Claude Code); § Skills-directory plugins blocked by managed settings.
 */
import { describe, expect, test } from 'bun:test';
import {
  REPOSITORY_ORIGINS,
  decideRepositoryPlugin,
  repositoryCauses,
  type RepositoryPluginFacts,
} from '../../src/loading/repository-trust.ts';
import { spec } from '../support/spec.ts';

/** A project `@skills-dir` plugin in a trusted repository, started at its root. */
const trusted: RepositoryPluginFacts = {
  origin: 'skills-dir',
  folderTrusted: true,
  parentTrusted: false,
  nonInteractive: false,
  primaryDirIsRoot: true,
  worktree: false,
};

const decide = (facts: Partial<RepositoryPluginFacts>) =>
  decideRepositoryPlugin({ ...trusted, ...facts });

spec('trust.loading.Trust check and component limits for repository plugins', () => {
  test('a project plugin loads once the folder itself is trusted', () => {
    expect(decide({})).toMatchObject({ load: true, reason: 'trusted' });
    expect(decide({ origin: 'marketplace-project-scope' })).toMatchObject({ load: true });
  });

  test('a folder never trusted does not load its project plugins, whichever origin', () => {
    for (const origin of ['skills-dir', 'marketplace-project-scope'] as const) {
      expect(decide({ origin, folderTrusted: false })).toMatchObject({
        load: false,
        reason: 'folder-not-trusted',
      });
    }
  });

  test('trusting a parent folder is not enough', () => {
    expect(decide({ folderTrusted: false, parentTrusted: true })).toMatchObject({
      load: false,
      reason: 'folder-not-trusted',
    });
  });

  test('running with -p is not enough: a non-interactive session needs the folder trusted too', () => {
    expect(decide({ folderTrusted: false, nonInteractive: true })).toMatchObject({ load: false });
    expect(
      decide({ folderTrusted: false, nonInteractive: true, parentTrusted: true }),
    ).toMatchObject({ load: false });
    expect(decide({ folderTrusted: true, nonInteractive: true })).toMatchObject({ load: true });
  });

  test('a plugin under your own ~/.claude/skills/ needs no trust check', () => {
    for (const nonInteractive of [false, true]) {
      expect(
        decide({ origin: 'user-skills-dir', folderTrusted: false, nonInteractive }),
      ).toMatchObject({ load: true, reason: 'user-level' });
    }
  });

  test('the user-level folder is not located by the session directory or a worktree', () => {
    expect(
      decide({ origin: 'user-skills-dir', folderTrusted: false, primaryDirIsRoot: false }),
    ).toMatchObject({ load: true });
  });

  test('every origin is decided by the registry', () => {
    expect([...REPOSITORY_ORIGINS]).toEqual([
      'skills-dir',
      'marketplace-project-scope',
      'user-skills-dir',
    ]);
  });
});

spec("trust.loading.Check why a repository plugin didn't load", () => {
  test('a plugin that loads has no cause; each cause of the docs list is one that stops it', () => {
    expect(repositoryCauses(trusted)).toEqual([]);
    expect(repositoryCauses({ ...trusted, primaryDirIsRoot: false })).toEqual([
      'not-primary-directory',
    ]);
    expect(repositoryCauses({ ...trusted, folderTrusted: false })).toEqual(['folder-not-trusted']);
    expect(repositoryCauses({ ...trusted, managedBlock: 'blockedMarketplaces' })).toEqual([
      'blocked-by-managed-settings',
    ]);
  });

  test('a managed block of skills-directory plugins stops both skills folders and no marketplace plugin', () => {
    const managedBlock = 'strictKnownMarketplaces' as const;
    expect(decide({ managedBlock })).toMatchObject({
      load: false,
      reason: 'blocked-by-managed-settings',
    });
    expect(decide({ origin: 'user-skills-dir', managedBlock })).toMatchObject({
      load: false,
      reason: 'blocked-by-managed-settings',
    });
    expect(decide({ origin: 'marketplace-project-scope', managedBlock })).toMatchObject({
      load: true,
    });
  });
});

spec("trust.loading.Check why a repository plugin didn't load.In a subdirectory", () => {
  test('a session started below the repository root does not load the root plugin', () => {
    expect(decide({ primaryDirIsRoot: false })).toMatchObject({
      load: false,
      reason: 'not-primary-directory',
    });
  });

  test('parent directories are not searched, so trust of the folder does not help', () => {
    expect(
      decide({ primaryDirIsRoot: false, folderTrusted: true, parentTrusted: true }),
    ).toMatchObject({ load: false });
  });

  test('only a directory-located plugin depends on it: a marketplace plugin enabled in settings does not', () => {
    expect(decide({ origin: 'marketplace-project-scope', primaryDirIsRoot: false })).toMatchObject({
      load: true,
    });
  });
});

spec(
  "trust.loading.Check why a repository plugin didn't load.From the desktop app, in a worktree",
  () => {
    test('in a worktree the plugin loads from the main checkout rather than the worktree', () => {
      expect(decide({ worktree: true })).toMatchObject({ load: true, from: 'main-checkout' });
      expect(decide({ worktree: false })).toMatchObject({ load: true, from: 'primary-directory' });
    });

    test('a user-level plugin does not come from either checkout', () => {
      expect(decide({ origin: 'user-skills-dir', worktree: true })).toMatchObject({
        from: 'user-skills-directory',
      });
    });
  },
);

spec(
  "trust.loading.Check why a repository plugin didn't load.In a folder you haven't trusted",
  () => {
    test('the plugin loads only after the workspace trust dialog is accepted for that folder', () => {
      expect(decide({ folderTrusted: false })).toMatchObject({ load: false });
      expect(decide({ folderTrusted: true })).toMatchObject({ load: true });
    });
  },
);

describe('judgments (outside spec)', () => {
  test('several causes at once: the decision names the first of managed block, location, trust', () => {
    // spec/judgments.md: the docs list the causes without an order.
    expect(decide({ folderTrusted: false, primaryDirIsRoot: false }).reason).toBe(
      'not-primary-directory',
    );
    expect(
      decide({ folderTrusted: false, primaryDirIsRoot: false, managedBlock: 'blockedMarketplaces' })
        .reason,
    ).toBe('blocked-by-managed-settings');
    expect(repositoryCauses({ ...trusted, folderTrusted: false, primaryDirIsRoot: false })).toEqual(
      ['not-primary-directory', 'folder-not-trusted'],
    );
  });
});
