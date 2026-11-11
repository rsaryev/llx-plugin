/**
 * settings-reference.md § `worktree` and its entries `worktree.baseRef`, `worktree.symlinkDirectories`,
 * `worktree.sparsePaths`, `worktree.bgIsolation` and `worktree.location`: scope, type, default and the
 * notes under each; settings.md § Lists merge instead of overriding (the two lists union across files).
 */
import { describe, expect, test } from 'bun:test';
import {
  backgroundEditsBlocked,
  baseRefTarget,
  readWorktree,
  worktreeFolder,
} from '../../../src/settings/general/index.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { viewOf, type Source } from '../../support/plugin-settings.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { spec } from '../../support/spec.ts';

const read = (...sources: Source[]) => readWorktree(viewOf(...sources));

spec('settings.key.worktree', () => {
  test('the docs example branches from HEAD and symlinks node_modules', () => {
    expect(
      read(['user', { worktree: { baseRef: 'head', symlinkDirectories: ['node_modules'] } }]),
    ).toMatchObject({
      baseRef: 'head',
      symlinkDirectories: ['node_modules'],
    });
  });

  test('unset by default: fresh, no symlinks, the whole tree, background sessions isolated, no location', () => {
    expect(read()).toEqual({
      baseRef: 'fresh',
      symlinkDirectories: [],
      sparsePaths: undefined,
      bgIsolation: 'worktree',
      location: undefined,
    });
  });

  test('any file carries the block, and fields of different files combine', () => {
    const resolved = read(
      ['user', { worktree: { baseRef: 'head' } }],
      ['project', { worktree: { bgIsolation: 'none' } }],
    );
    expect(resolved).toMatchObject({ baseRef: 'head', bgIsolation: 'none' });
  });

  test('a block that is not an object is dropped with a warning', () => {
    expect(issuesOf('user', { worktree: 'head' })[0]?.message).toContain(
      '"worktree" must be an object',
    );
    expect(read(['user', { worktree: ['head'] }])).toMatchObject({ baseRef: 'fresh' });
  });

  test('the merged settings carry the block', () => {
    const view = createGeneralView([layerOf('user', { worktree: { baseRef: 'head' } })]);
    expect(view.merged().worktree).toEqual({ baseRef: 'head' });
  });
});

spec('settings.key.worktree.baseRef', () => {
  test('fresh and head are read as they are; fresh is the default', () => {
    expect(read(['user', { worktree: { baseRef: 'head' } }]).baseRef).toBe('head');
    expect(read(['user', { worktree: { baseRef: 'fresh' } }]).baseRef).toBe('fresh');
    expect(read().baseRef).toBe('fresh');
  });

  test('another value is dropped with a warning naming the field, and the default applies', () => {
    expect(issuesOf('user', { worktree: { baseRef: 'main' } })[0]?.message).toContain(
      '"worktree.baseRef" is invalid',
    );
    expect(read(['user', { worktree: { baseRef: 'main' } }]).baseRef).toBe('fresh');
  });

  test('a bad value in a higher file leaves the lower file value in force', () => {
    expect(
      read(
        ['user', { worktree: { baseRef: 'head' } }],
        ['project', { worktree: { baseRef: 'origin/main' } }],
      ).baseRef,
    ).toBe('head');
  });

  test('fresh branches from origin/<default-branch>; head from the current local HEAD, which inside a linked worktree is that worktree HEAD', () => {
    expect(baseRefTarget('fresh', { insideLinkedWorktree: false })).toBe('origin-default-branch');
    expect(baseRefTarget('fresh', { insideLinkedWorktree: true })).toBe('origin-default-branch');
    expect(baseRefTarget('head', { insideLinkedWorktree: false })).toBe('checkout-head');
    expect(baseRefTarget('head', { insideLinkedWorktree: true })).toBe('linked-worktree-head');
  });
});

spec('settings.key.worktree.symlinkDirectories', () => {
  test('a list of directory paths relative to the repository root', () => {
    expect(
      read(['user', { worktree: { symlinkDirectories: ['node_modules', '.cache'] } }])
        .symlinkDirectories,
    ).toEqual(['node_modules', '.cache']);
  });

  test('unset, nothing is symlinked', () => {
    expect(read(['user', { worktree: {} }]).symlinkDirectories).toEqual([]);
  });

  test('lists of several files are united, each directory once', () => {
    expect(
      read(
        ['user', { worktree: { symlinkDirectories: ['node_modules'] } }],
        ['project', { worktree: { symlinkDirectories: ['.cache', 'node_modules'] } }],
      ).symlinkDirectories,
    ).toEqual(['.cache', 'node_modules']);
  });

  test('a value that is not a list of strings is dropped with a warning', () => {
    for (const bad of ['node_modules', [1], ['a', 2]]) {
      expect(issuesOf('user', { worktree: { symlinkDirectories: bad } })[0]?.message).toContain(
        '"worktree.symlinkDirectories" is invalid',
      );
      expect(read(['user', { worktree: { symlinkDirectories: bad } }]).symlinkDirectories).toEqual(
        [],
      );
    }
  });
});

spec('settings.key.worktree.sparsePaths', () => {
  test('the docs example lists .claude and two directories', () => {
    expect(
      read(['user', { worktree: { sparsePaths: ['.claude', 'packages/my-app', 'shared/utils'] } }])
        .sparsePaths,
    ).toEqual(['.claude', 'packages/my-app', 'shared/utils']);
  });

  test('unset, each worktree checks out the whole tree', () => {
    expect(read().sparsePaths).toBeUndefined();
    expect(read(['user', { worktree: { baseRef: 'head' } }]).sparsePaths).toBeUndefined();
  });

  test('lists of several files are united', () => {
    expect(
      read(
        ['user', { worktree: { sparsePaths: ['a'] } }],
        ['local', { worktree: { sparsePaths: ['b'] } }],
      ).sparsePaths,
    ).toEqual(['b', 'a']);
  });

  test('a value that is not a list of strings is dropped with a warning', () => {
    expect(issuesOf('user', { worktree: { sparsePaths: { a: 1 } } })[0]?.message).toContain(
      '"worktree.sparsePaths" is invalid',
    );
    expect(read(['user', { worktree: { sparsePaths: 'a' } }]).sparsePaths).toBeUndefined();
  });
});

spec('settings.key.worktree.bgIsolation', () => {
  test('worktree is the default and none is read as it is', () => {
    expect(read().bgIsolation).toBe('worktree');
    expect(read(['user', { worktree: { bgIsolation: 'none' } }]).bgIsolation).toBe('none');
  });

  test('another value is dropped with a warning, and the default isolation applies', () => {
    expect(issuesOf('user', { worktree: { bgIsolation: 'off' } })[0]?.message).toContain(
      '"worktree.bgIsolation" is invalid',
    );
    expect(read(['user', { worktree: { bgIsolation: 'off' } }]).bgIsolation).toBe('worktree');
  });

  describe('what the mode does to Edit and Write in the main checkout', () => {
    const facts = {
      movedToBackground: false,
      enteredWorktree: false,
      insideGitRepository: true,
      worktreeCreateHookFailed: false,
    };

    test('worktree blocks Edit and Write in the main checkout until the session calls EnterWorktree', () => {
      expect(backgroundEditsBlocked('worktree', facts)).toBe(true);
      expect(backgroundEditsBlocked('worktree', { ...facts, enteredWorktree: true })).toBe(false);
    });

    test('none lets background jobs edit the working copy directly', () => {
      expect(backgroundEditsBlocked('none', facts)).toBe(false);
    });

    test('a session you moved to the background edits in place whatever the key says', () => {
      expect(backgroundEditsBlocked('worktree', { ...facts, movedToBackground: true })).toBe(false);
    });

    test('outside a git repository a WorktreeCreate hook that fails releases the block', () => {
      const outside = { ...facts, insideGitRepository: false };
      expect(backgroundEditsBlocked('worktree', outside)).toBe(true);
      expect(
        backgroundEditsBlocked('worktree', { ...outside, worktreeCreateHookFailed: true }),
      ).toBe(false);
      expect(backgroundEditsBlocked('worktree', { ...facts, worktreeCreateHookFailed: true })).toBe(
        true,
      );
    });
  });
});

spec('settings.key.worktree.location', () => {
  const settings = (location: unknown) => ({ worktree: { location } });

  test('an absolute path or one that starts with ~/ is read from user settings', () => {
    expect(read(['user', settings('~/worktrees')]).location).toBe('~/worktrees');
    expect(read(['user', settings('/srv/worktrees')]).location).toBe('/srv/worktrees');
  });

  test('only user settings carry it: a project, local, managed or --settings value is dropped with a warning', () => {
    for (const scope of ['project', 'local', 'managed', 'flag'] as const) {
      expect(read([scope, settings('~/w')]).location).toBeUndefined();
      expect(issuesOf(scope, settings('~/w'))[0]?.message).toContain(
        '"worktree.location" is not read from',
      );
    }
    const view = createGeneralView([
      layerOf('project', settings('~/w')),
      layerOf('user', settings('~/mine')),
    ]);
    expect(view.merged().worktree).toEqual({ location: '~/mine' });
  });

  test('a relative path is dropped with a warning', () => {
    expect(issuesOf('user', settings('worktrees'))[0]?.message).toContain(
      '"worktree.location" is invalid',
    );
    expect(read(['user', settings('worktrees')]).location).toBeUndefined();
  });

  test('unset, worktrees go inside the project', () => {
    expect(read().location).toBeUndefined();
  });

  describe('only the desktop app reads it', () => {
    const user = read(['user', settings('~/worktrees')]);
    const input = (
      consumer: Parameters<typeof worktreeFolder>[1]['consumer'],
      extra: object = {},
    ) => worktreeFolder(user, { consumer, ...extra });

    test('Desktop SSH sessions use it instead of <project-root>/.claude/worktrees', () => {
      expect(input('desktop-ssh')).toBe('~/worktrees');
    });

    test('--worktree, the EnterWorktree tool, isolated subagents and background sessions ignore it', () => {
      for (const consumer of [
        'worktree-flag',
        'enter-worktree-tool',
        'isolated-subagent',
        'background-session',
      ] as const) {
        expect(input(consumer)).toBeUndefined();
      }
    });

    test('a Worktree folder set on the SSH connection in Desktop takes precedence', () => {
      expect(input('desktop-ssh', { connectionFolder: '/connection' })).toBe('/connection');
    });

    test('when the organization restricts which folders sessions may use, Desktop keeps worktrees inside the project', () => {
      expect(input('desktop-ssh', { organizationRestrictsFolders: true })).toBeUndefined();
    });
  });
});
