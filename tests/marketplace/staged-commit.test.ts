/**
 * plugins/troubleshooting.md § Could not move the new copy of this plugin version into <path>: the
 * install moves the fresh copy into that version's folder of the plugin cache; a move that fails is
 * reported with what became of the copy installed before. The host's `StagedDirectory` moves it.
 */
import { describe, expect, test } from 'bun:test';
import type { TreePlan } from '../../src/marketplace/copy-plan.ts';
import type { CommitFailure } from '../../src/marketplace/ports.ts';
import { commitStagedPlugin } from '../../src/marketplace/staged-commit.ts';
import { fakeStaged } from '../support/marketplace-ports.ts';
import { spec } from '../support/spec.ts';

const signal = new AbortController().signal;
const DEST = '/home/user/.claude/plugins/cache/acme-tools/formatter/1.2.0';
const input = (staged: ReturnType<typeof fakeStaged>, plan?: TreePlan) => ({
  staged,
  stagedPath: '/tmp/stage-1',
  destination: DEST,
  signal,
  ...(plan === undefined ? {} : { plan }),
});
const failing = (failure: CommitFailure) => commitStagedPlugin(input(fakeStaged(failure)));
const HEAD = `Could not move the new copy of this plugin version into ${DEST}:`;

spec(
  'install.troubleshooting.Could not move the new copy of this plugin version into <path>',
  () => {
    test('the staged directory is moved to the version folder of the cache, and nothing is reported', async () => {
      const staged = fakeStaged();
      expect(await commitStagedPlugin(input(staged))).toBeUndefined();
      expect(staged.commits).toEqual([{ stagedPath: '/tmp/stage-1', destination: DEST }]);
    });

    test('a move that fails is the documented message, naming the folder and what became of the earlier copy', async () => {
      const issue = await commitStagedPlugin(
        input(
          fakeStaged({
            failure: 'busy',
            message: 'ENOTEMPTY',
            code: 'ENOTEMPTY',
            previous: 'moved-back',
          }),
        ),
      );
      expect(issue?.severity).toBe('error');
      expect(
        issue?.message.startsWith(
          `Could not move the new copy of this plugin version into ${DEST}:`,
        ),
      ).toBe(true);
      expect(issue?.message).toContain('(ENOTEMPTY)');
      expect(issue?.message).toContain('The previously installed copy was moved back');
    });

    test('another program holding the installed copy (Windows) says it could not be replaced and the new copy was discarded', async () => {
      const issue = await failing({
        failure: 'held',
        message: 'EBUSY',
        code: 'EBUSY',
        previous: 'none',
      });
      expect(issue?.severity).toBe('error');
      expect(issue?.message.startsWith(HEAD)).toBe(true);
      expect(issue?.message).toContain('could not be replaced (EBUSY)');
      expect(issue?.message).toContain('It was not replaced and the new copy was discarded.');
      expect(issue?.message).toContain('Run the install again');
    });

    test('a cache folder that cannot be written names the permissions and the disk, and offers no retry', async () => {
      const issue = await failing({
        failure: 'permission',
        message: 'EACCES',
        code: 'EACCES',
        previous: 'could-not-be-moved-back',
      });
      expect(issue?.message.startsWith(HEAD)).toBe(true);
      expect(issue?.message).toContain('could not be written (EACCES)');
      expect(issue?.message).toContain(
        "Check the plugin cache folder's permissions and free disk space.",
      );
      expect(issue?.message).toContain('The previously installed copy could not be moved back.');
      expect(issue?.message).not.toContain('Run the install again');
    });

    test('the set-aside folders the failed move left in the cache are listed', async () => {
      const issue = await failing({
        failure: 'busy',
        message: 'x',
        code: 'ENOTEMPTY',
        previous: 'not-moved-back',
        leftOnDisk: [`${DEST}.old-1`, `${DEST}.old-2`],
      });
      expect(issue?.message).toContain('The previously installed copy was not moved back.');
      expect(issue?.message.endsWith(`Left on disk: ${DEST}.old-1, ${DEST}.old-2.`)).toBe(true);
    });
  },
);

describe('judgments: the staged commit', () => {
  test('an abort says the install was aborted before the move', async () => {
    const issue = await commitStagedPlugin(
      input(fakeStaged({ failure: 'aborted', message: 'aborted', previous: 'none' })),
    );
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toBe('The install was aborted before the move');
    expect(issue?.message).not.toContain('Could not move');
  });

  test('the tree plan reaches the port, so a tree with links is materialized and not moved whole', async () => {
    const plan: TreePlan = {
      copy: ['skills'],
      relinks: [{ path: 'skills/own', target: '../shared' }],
      dereferences: [
        { path: 'skills/foo', from: '/m/plugins/shared/skills/foo', isDirectory: true },
      ],
      skipped: [{ path: 'away', reason: 'outside-marketplace' }],
      refusals: [],
    };
    const staged = fakeStaged();
    expect(await commitStagedPlugin(input(staged, plan))).toBeUndefined();
    expect(staged.commits).toEqual([{ stagedPath: '/tmp/stage-1', destination: DEST, plan }]);
  });

  test('a tree without links is committed with no plan', async () => {
    const staged = fakeStaged();
    await commitStagedPlugin(input(staged));
    expect(staged.commits[0]?.plan).toBeUndefined();
  });
});
