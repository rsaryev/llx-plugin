/**
 * plugins/loading.md § Check why a repository plugin didn't load (the four causes and what to do about
 * each), § Skills-directory plugins blocked by managed settings (the three restrictions, "show no
 * plugin and no error", `/status` and `Enterprise managed settings`). The wording is the kit's; the
 * docs quote no message (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { explainRepositoryPlugin, WORKTREE_NOTE } from '../../src/loading/repository-messages.ts';
import type { RepositoryPluginFacts } from '../../src/loading/repository-trust.ts';
import { spec } from '../support/spec.ts';

const trusted: RepositoryPluginFacts = {
  origin: 'skills-dir',
  folderTrusted: true,
  parentTrusted: false,
  nonInteractive: false,
  primaryDirIsRoot: true,
  worktree: false,
};
const explain = (facts: Partial<RepositoryPluginFacts>) =>
  explainRepositoryPlugin({ ...trusted, ...facts });

spec("trust.loading.Check why a repository plugin didn't load", () => {
  test('a plugin that loads has no cause to explain', () => {
    expect(explain({})).toMatchObject({ causes: [], notes: [] });
  });

  test("every cause that applies is explained, in the decision's order", () => {
    const found = explain({ primaryDirIsRoot: false, folderTrusted: false });
    expect(found.decision).toMatchObject({ load: false, reason: 'not-primary-directory' });
    expect(found.causes).toEqual([
      expect.stringContaining('does not search parent directories'),
      expect.stringContaining('workspace trust dialog'),
    ]);
  });
});

spec("trust.loading.Check why a repository plugin didn't load.In a subdirectory", () => {
  test('the advice: launch from the repository root, or move the session with /cd (v2.1.246 or later)', () => {
    const [cause] = explain({ primaryDirIsRoot: false }).causes;
    expect(cause).toContain('launch from the repository root');
    expect(cause).toContain('/cd (v2.1.246 or later)');
  });
});

spec(
  "trust.loading.Check why a repository plugin didn't load.From the desktop app, in a worktree",
  () => {
    test('a worktree session is told the plugin comes from the main checkout', () => {
      expect(explain({ worktree: true }).notes).toEqual([WORKTREE_NOTE]);
      expect(WORKTREE_NOTE).toContain("main checkout's .claude/skills/");
    });

    test('a plugin of your own skills directory has no checkout to name', () => {
      expect(explain({ worktree: true, origin: 'user-skills-dir' }).notes).toEqual([]);
    });
  },
);

spec(
  "trust.loading.Check why a repository plugin didn't load.In a folder you haven't trusted",
  () => {
    test('the plugin loads only after the dialog is accepted for that folder', () => {
      const [cause] = explain({ folderTrusted: false }).causes;
      expect(cause).toContain('accept the workspace trust dialog for that folder');
    });

    test("a parent's trust and a -p run are named as no substitute", () => {
      expect(explain({ folderTrusted: false, parentTrusted: true }).causes[0]).toContain(
        'trusting a parent folder is not enough',
      );
      expect(explain({ folderTrusted: false, nonInteractive: true }).causes[0]).toContain(
        '`claude -p` or SDK run never shows the dialog',
      );
    });
  },
);

spec("trust.loading.Check why a repository plugin didn't load", () => {
  test('a managed restriction is named, and /status is how to confirm it', () => {
    const blocks = [
      ['strictPluginOnlyCustomization', 'locked to plugins'],
      ['strictKnownMarketplaces', '{ "source": "skills-dir" } entry'],
      ['blockedMarketplaces', 'names { "source": "skills-dir" }'],
    ] as const;
    for (const [managedBlock, words] of blocks) {
      const [cause] = explain({ managedBlock }).causes;
      expect(cause).toContain(words);
      expect(cause).toContain('/status');
      expect(cause).toContain('Enterprise managed settings');
    }
  });
});
