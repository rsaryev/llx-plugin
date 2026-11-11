/**
 * permissions.md § Project allow rules and workspace trust (what the trust is keyed on and how far it
 * reaches; allow rules and `additionalDirectories` wait for it, `deny` and `ask` do not; the dialog
 * lists what the folder would grant); hooks.md § Workspace trust (interactive sessions hold hooks of
 * every settings file until the dialog, `-p` and SDK sessions treat the folder as trusted);
 * permissions.md § What runs before you trust a folder (trusting by hand in `~/.claude.json`).
 */
import { describe, expect, test } from 'bun:test';
import type { WorkspaceTrust } from '../../src/loading/ports.ts';
import {
  PROJECT_PERMISSION_ENTRIES,
  projectEntryApplies,
  trustDialogListing,
} from '../../src/loading/trust-gates.ts';
import {
  manualTrustEntry,
  settingsHooksMayRun,
  workspaceTrustKey,
  workspaceTrustSituation,
  workspaceTrustState,
  type TrustFacts,
} from '../../src/loading/workspace-trust.ts';
import { spec } from '../support/spec.ts';

/** A host whose dialog was accepted for exactly these folders; `asked` records every question. */
function accepted(...paths: string[]): WorkspaceTrust & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    isFolderTrusted: (path) => {
      asked.push(path);
      return Promise.resolve(paths.includes(path));
    },
  };
}

const repo: TrustFacts = {
  startDir: '/work/app/packages/web',
  repositoryRoot: '/work/app',
  homeDir: '/home/me',
};

spec('trust.behavior.Project allow rules and workspace trust', () => {
  describe('which folder the trust is keyed on', () => {
    test("in a repository, the git repository root: a subdirectory shares the repository's trust", () => {
      expect(workspaceTrustKey(repo)).toEqual({ key: '/work/app', persisted: true });
      expect(workspaceTrustKey({ ...repo, startDir: '/work/app' }).key).toBe('/work/app');
    });

    test("in a worktree, the main checkout's root", () => {
      const worktree = { ...repo, startDir: '/work/app-wt', repositoryRoot: '/work/app-wt' };
      expect(workspaceTrustKey({ ...worktree, mainCheckoutRoot: '/work/app' }).key).toBe(
        '/work/app',
      );
    });

    test('outside a repository, the directory the session started in', () => {
      const facts = { startDir: '/work/notes', homeDir: '/home/me' };
      expect(workspaceTrustKey(facts)).toEqual({ key: '/work/notes', persisted: true });
    });

    test('in the home directory the trust is held for the session only', () => {
      expect(workspaceTrustKey({ startDir: '/home/me', homeDir: '/home/me' })).toEqual({
        key: '/home/me',
        persisted: false,
      });
    });
  });

  describe('how far the trust reaches', () => {
    test('a repository is trusted by its root; a nested repository (a submodule) is its own folder', async () => {
      const trust = accepted('/work/app');
      expect(await workspaceTrustState(trust, repo)).toBe('trusted');
      const submodule = {
        ...repo,
        startDir: '/work/app/vendor/lib',
        repositoryRoot: '/work/app/vendor/lib',
      };
      expect(await workspaceTrustState(trust, submodule)).toBe('dialog');
    });

    test('outside a repository the trust covers a subdirectory, which counts as a folder whose parent you trusted', async () => {
      const trust = accepted('/work/notes');
      const facts = {
        startDir: '/work/notes/2026/q4',
        homeDir: '/home/me',
        ancestors: ['/work/notes/2026', '/work/notes', '/work', '/'],
      };
      expect(await workspaceTrustState(trust, facts)).toBe('parent-trusted');
      expect(await workspaceTrustState(accepted('/work/notes/2026/q4'), facts)).toBe('trusted');
      expect(await workspaceTrustState(accepted(), facts)).toBe('dialog');
    });

    test('a repository inside a trusted plain directory is not covered by it', async () => {
      const clone = {
        startDir: '/work/notes/clone',
        repositoryRoot: '/work/notes/clone',
        homeDir: '/home/me',
        ancestors: ['/work/notes', '/work', '/'],
      };
      expect(await workspaceTrustState(accepted('/work/notes'), clone)).toBe('dialog');
    });

    test('a parent of a repository does not cover it either', async () => {
      const trust = accepted('/work');
      expect(
        await workspaceTrustState(trust, { ...repo, ancestors: ['/work/app/packages', '/work'] }),
      ).toBe('dialog');
      expect(trust.asked).toEqual(['/work/app']);
    });
  });

  describe('a host that answers synchronously gets the same column', () => {
    const notes = {
      startDir: '/work/notes/2026/q4',
      homeDir: '/home/me',
      ancestors: ['/work/notes/2026', '/work/notes', '/work', '/'],
    };
    const clone = { ...notes, startDir: '/work/notes/clone', repositoryRoot: '/work/notes/clone' };
    const cases: readonly (readonly [TrustFacts, readonly string[]])[] = [
      [repo, ['/work/app']],
      [
        { ...repo, startDir: '/work/app/vendor/lib', repositoryRoot: '/work/app/vendor/lib' },
        ['/work/app'],
      ],
      [notes, ['/work/notes']],
      [notes, ['/work/notes/2026/q4']],
      [notes, []],
      [clone, ['/work/notes']],
      [{ ...repo, ancestors: ['/work/app/packages', '/work'] }, ['/work']],
    ];

    test('every case of the reach, interactive and not', async () => {
      for (const [facts, folders] of cases) {
        for (const nonInteractive of [false, true]) {
          const isTrusted = (folder: string) => folders.includes(folder);
          expect(workspaceTrustSituation(isTrusted, facts, { nonInteractive })).toBe(
            await workspaceTrustState(accepted(...folders), facts, { nonInteractive }),
          );
        }
      }
    });

    test('in a repository no folder above it is asked', () => {
      const asked: string[] = [];
      const isTrusted = (folder: string) => (asked.push(folder), false);
      workspaceTrustSituation(isTrusted, { ...repo, ancestors: ['/work/app/packages', '/work'] });
      expect(asked).toEqual(['/work/app']);
    });
  });

  describe('allow rules and additional directories wait for trust', () => {
    test('`allow` and `additionalDirectories` apply only in a trusted folder', () => {
      expect(projectEntryApplies('allow', false)).toBe(false);
      expect(projectEntryApplies('additionalDirectories', false)).toBe(false);
      expect(projectEntryApplies('allow', true)).toBe(true);
      expect(projectEntryApplies('additionalDirectories', true)).toBe(true);
    });

    test('`deny` and `ask` are not affected, since they only restrict', () => {
      expect(projectEntryApplies('deny', false)).toBe(true);
      expect(projectEntryApplies('ask', false)).toBe(true);
      expect(PROJECT_PERMISSION_ENTRIES).toEqual(['allow', 'ask', 'deny', 'additionalDirectories']);
    });

    test('the dialog lists the rules and directories the folder would grant', () => {
      expect(
        trustDialogListing({ allow: ['Bash(git push *)'], additionalDirectories: ['../shared'] }),
      ).toEqual({ allow: ['Bash(git push *)'], additionalDirectories: ['../shared'] });
      expect(trustDialogListing({})).toEqual({ allow: [], additionalDirectories: [] });
    });
  });
});

spec('trust.behavior.Workspace trust', () => {
  test('an interactive session holds hooks of every settings file until the dialog was accepted', () => {
    expect(settingsHooksMayRun('dialog')).toBe(false);
    expect(settingsHooksMayRun('trusted')).toBe(true);
  });

  test('a parent directory whose trust extends to the folder is enough for an interactive session', () => {
    expect(settingsHooksMayRun('parent-trusted')).toBe(true);
  });

  test('a -p or SDK session never shows the dialog and treats the folder as trusted', async () => {
    expect(settingsHooksMayRun('non-interactive')).toBe(true);
    const facts = { startDir: '/work/notes', homeDir: '/home/me', ancestors: ['/work', '/'] };
    const state = await workspaceTrustState(accepted(), facts, { nonInteractive: true });
    expect(state).toBe('non-interactive');
    expect(settingsHooksMayRun(state)).toBe(true);
  });
});

spec('trust.behavior.What runs before you trust a folder', () => {
  test('trusting by hand: projects["<path>"].hasTrustDialogAccepted set to true in ~/.claude.json, on the key', () => {
    expect(manualTrustEntry(workspaceTrustKey(repo).key)).toEqual({
      file: '~/.claude.json',
      path: ['projects', '/work/app', 'hasTrustDialogAccepted'],
      value: true,
    });
  });
});
