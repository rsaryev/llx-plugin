/**
 * settings-reference.md § `permissions.blockReadsOutsideWorkingDirectories` and §
 * `permissions.blockWritesOutsideWorkingDirectories` ("A `true` in any file applies"; "`false`: the same
 * as unset; the block still applies if another file sets `true`"; directories "Added only in repository
 * settings don't count"; "The block is also on while Claude Code can't read the `permissions` object in
 * your managed settings"); settings.md § "Exceptions to managed settings precedence"; managed-settings.md
 * § "Keys that fail closed".
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { permissionsOf, terminal } from '../../support/permissions-policy.ts';
import { sessionOf } from '../../support/permission-session.ts';
import { call, matchContext } from '../../support/rule-context.ts';
import { decide } from '../../../src/rules/index.ts';
import { deny } from '../../support/decide.ts';
import { spec } from '../../support/spec.ts';

const block = (name: string, value: unknown) => ({ permissions: { [name]: value } });

describe('the read and write blocks', () => {
  const blocked = block('blockReadsOutsideWorkingDirectories', true);
  const paths = { ...matchContext.paths, additionalDirectories: ['/work/cli'] };

  spec('permissions.setting.permissions.blockReadsOutsideWorkingDirectories', () => {
    test('true in any file turns the read block on, in every file a repository can set it', () => {
      for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
        const policy = permissionsOf([[scope, block('blockReadsOutsideWorkingDirectories', true)]]);
        expect(policy.blockReadsOutsideWorkingDirectories).toBe(true);
      }
    });

    test("false is the same as unset: another file's true still applies, even over a managed false", () => {
      const policy = permissionsOf([
        ['managed', block('blockReadsOutsideWorkingDirectories', false)],
        ['project', block('blockReadsOutsideWorkingDirectories', true)],
      ]);
      expect(policy.blockReadsOutsideWorkingDirectories).toBe(true);
      expect(
        permissionsOf([['user', block('blockReadsOutsideWorkingDirectories', false)]])
          .blockReadsOutsideWorkingDirectories,
      ).toBe(false);
      expect(permissionsOf([]).blockReadsOutsideWorkingDirectories).toBe(false);
    });

    test('reaches the session context that decides file reads', () => {
      const policy = permissionsOf([
        ['project', block('blockReadsOutsideWorkingDirectories', true)],
      ]);
      expect(sessionOf(policy).context.blockReadsOutsideWorkingDirectories).toBe(true);
    });

    test('directories added with --add-dir or in user or managed settings count as working directories; those only repository settings add do not', () => {
      const read = (path: string, policy = repository) =>
        decide(call('Read', { file_path: path }), sessionOf(policy, terminal(), { paths }).context);
      const repository = permissionsOf([
        ['project', { permissions: { additionalDirectories: ['/work/repo-only', '/work/both'] } }],
        [
          'user',
          {
            permissions: {
              additionalDirectories: ['/work/both', '/work/user'],
              blockReadsOutsideWorkingDirectories: true,
            },
          },
        ],
      ]);
      expect(read('/work/repo-only/a.ts')).toEqual(deny('outside-working-directory'));
      expect(read('/work/both/a.ts').outcome).toBe('allow');
      expect(read('/work/user/a.ts').outcome).toBe('allow');
      expect(read('/work/cli/a.ts').outcome).toBe('allow');
      expect(read('/work/elsewhere/a.ts')).toEqual(deny('outside-working-directory'));
    });

    test('a tracked .claude/settings.local.json is repository settings too; an untracked one is yours', () => {
      const local = permissionsOf(
        [
          ['local', { permissions: { additionalDirectories: ['/work/mine'] } }],
          ['user', blocked],
        ],
        { localSettingsTracked: false },
      );
      const tracked = permissionsOf(
        [
          ['local', { permissions: { additionalDirectories: ['/work/mine'] } }],
          ['user', blocked],
        ],
        { localSettingsTracked: true, isFolderTrusted: () => true },
      );
      const run = (policy: typeof local) =>
        decide(call('Read', { file_path: '/work/mine/a.ts' }), sessionOf(policy).context);
      expect(run(local).outcome).toBe('allow');
      expect(run(tracked)).toEqual(deny('outside-working-directory'));
    });

    test('unreadable in managed settings it reads as true; a quoted Boolean reads as that Boolean with a notice', () => {
      expect(
        layerOf('managed', block('blockReadsOutsideWorkingDirectories', 'maybe')).settings
          .permissions,
      ).toEqual({
        blockReadsOutsideWorkingDirectories: true,
      });
      const quoted = block('blockReadsOutsideWorkingDirectories', 'false');
      expect(layerOf('managed', quoted).settings.permissions).toEqual({
        blockReadsOutsideWorkingDirectories: false,
      });
      expect(issuesOf('managed', quoted)[0]?.message).toContain('drop the quotes');
    });
  });

  spec('permissions.setting.permissions.blockWritesOutsideWorkingDirectories', () => {
    test('true in any file turns the write block on', () => {
      for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
        const policy = permissionsOf([
          [scope, block('blockWritesOutsideWorkingDirectories', true)],
        ]);
        expect(policy.blockWritesOutsideWorkingDirectories).toBe(true);
        expect(sessionOf(policy).context.blockWritesOutsideWorkingDirectories).toBe(true);
      }
    });

    test('false is the same as unset; a true elsewhere still applies', () => {
      expect(
        permissionsOf([['managed', block('blockWritesOutsideWorkingDirectories', false)]])
          .blockWritesOutsideWorkingDirectories,
      ).toBe(false);
      expect(
        permissionsOf([
          ['managed', block('blockWritesOutsideWorkingDirectories', false)],
          ['user', block('blockWritesOutsideWorkingDirectories', true)],
        ]).blockWritesOutsideWorkingDirectories,
      ).toBe(true);
    });

    test('is on while Claude Code cannot read the permissions object of the managed settings', () => {
      expect(
        permissionsOf([['managed', { permissions: ['allow'] }]])
          .blockWritesOutsideWorkingDirectories,
      ).toBe(true);
      expect(
        permissionsOf([['user', { permissions: ['allow'] }]]).blockWritesOutsideWorkingDirectories,
      ).toBe(false);
    });
  });
});
