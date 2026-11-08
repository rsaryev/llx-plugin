/**
 * plugins/troubleshooting.md § Could not move the new copy of this plugin version into <path>: the
 * install moves the fresh copy into that version's folder of the plugin cache; a move that fails is
 * reported with what became of the copy installed before. The host's `StagedDirectory` moves it.
 */
import { describe, expect, test } from 'bun:test';
import { commitStagedPlugin } from '../../src/marketplace/staged-commit.ts';
import { fakeStaged } from '../support/marketplace-ports.ts';
import { spec } from '../support/spec.ts';

const signal = new AbortController().signal;
const DEST = '/home/user/.claude/plugins/cache/acme-tools/formatter/1.2.0';
const input = (staged: ReturnType<typeof fakeStaged>) => ({
  staged,
  stagedPath: '/tmp/stage-1',
  destination: DEST,
  signal,
});

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
  },
);

describe('judgments: the staged commit', () => {
  test('an abort says the install was aborted before the move', async () => {
    const issue = await commitStagedPlugin(
      input(fakeStaged({ failure: 'aborted', message: 'aborted', previous: 'none' })),
    );
    expect(issue?.message).toBe('The install was aborted before the move');
  });
});
