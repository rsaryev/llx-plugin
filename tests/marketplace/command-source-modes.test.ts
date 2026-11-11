/**
 * marketplace-reference.md § command plugin source, § What the command must do, § Output that
 * fails the install or update, § Copy mode and link mode.
 */
import { describe, expect, test } from 'bun:test';
import { withSizes } from '../support/marketplace-ports.ts';
import { issueOf, plugin, PRINTED, prints, run } from '../support/marketplace-command.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

/** A copy-mode directory of `count` symlinks (each to the directory itself) under skills/. */
const linksUnderSkills = (count: number) =>
  memoryFiles(
    Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`skills/l${index}`, { symlink: '.' }]),
    ),
  );

spec(['marketplace.source.command', 'marketplace.rule.command plugin source.mode'], () => {
  const link = { mode: 'link' } as const;

  test('link mode does not apply the size limits', async () => {
    const MIB = 1024 * 1024;
    const huge = withSizes(plugin(), { 'skills/a/SKILL.md': 10_000 * MIB });
    const many = memoryFiles(
      Object.fromEntries(Array.from({ length: 20_001 }, (_, index) => [`skills/f${index}`, 'x'])),
    );
    for (const files of [huge, many]) {
      expect(
        await run(prints(PRINTED), { plan: link, folders: { [PRINTED]: files } }).result,
      ).toMatchObject({
        directory: PRINTED,
        mode: 'link',
      });
    }
  });

  test('link mode still needs plugin content at the top level', async () => {
    const issue = await issueOf(
      run(prints(PRINTED), { plan: link, folders: { [PRINTED]: memoryFiles({ 'x.txt': 'x' }) } })
        .result,
    );
    expect(issue.message).toContain('plugin content');
  });

  test('link mode refuses a top-level symlink that points outside the printed directory', async () => {
    const outside = memoryFiles({ skills: { symlink: '../elsewhere' }, '.claude-plugin/p': 'x' });
    const issue = await issueOf(
      run(prints(PRINTED), { plan: link, folders: { [PRINTED]: outside } }).result,
    );
    expect(issue.message).toContain('"skills"');
    const absolute = memoryFiles({
      commands: { symlink: '/etc/commands' },
      '.claude-plugin/p': 'x',
    });
    expect(
      (await issueOf(run(prints(PRINTED), { plan: link, folders: { [PRINTED]: absolute } }).result))
        .message,
    ).toContain('"commands"');
  });

  test('link mode accepts a top-level symlink that stays inside the printed directory', async () => {
    const inside = memoryFiles({
      shared: 'x',
      skills: { symlink: 'shared' },
      '.claude-plugin/p': 'x',
    });
    expect(
      await run(prints(PRINTED), { plan: link, folders: { [PRINTED]: inside } }).result,
    ).toMatchObject({
      mode: 'link',
    });
  });

  test('link mode is refused on Windows without running the command', async () => {
    const { result, runner } = run(prints('C:\\out'), {
      plan: { ...link, shell: 'cmd' },
      setting: { platform: 'windows' },
    });
    const issue = await issueOf(result);
    expect(issue.message).toContain('Windows');
    expect(runner.calls).toEqual([]);
  });
});

describe('judgments: command source', () => {
  test('a printed directory that does not exist is refused', async () => {
    const { result } = run(prints('/missing'), { folders: {} });
    expect((await issueOf(result)).message).toContain('does not exist');
  });

  test('a run that was stopped (no exit code, no timeout) is a failure', async () => {
    const issue = await issueOf(run({ exitCode: null }).result);
    expect(issue.message).toContain('stopped');
  });

  test('a symlink inside the directory counts as one entry and is not followed', async () => {
    // skills/ is one entry; each link to the directory itself is one more and is never followed
    // (following would loop), so 19,999 links make exactly 20,000 entries and 20,000 make 20,001.
    expect(
      await run(prints(PRINTED), { folders: { [PRINTED]: linksUnderSkills(19_999) } }).result,
    ).toMatchObject({ directory: PRINTED });
    const issue = await issueOf(
      run(prints(PRINTED), { folders: { [PRINTED]: linksUnderSkills(20_000) } }).result,
    );
    expect(issue.message).toContain('20000');
  });

  test('Windows paths are compared without case and with either separator', async () => {
    const issue = await issueOf(
      run(prints('c:/WORK\n'), {
        setting: { platform: 'windows', sessionCwd: 'C:\\work\\app' },
        plan: { shell: 'cmd' },
        folders: { 'c:/WORK': plugin() },
      }).result,
    );
    expect(issue.message).toContain('started in');
  });
});
