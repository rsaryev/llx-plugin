/**
 * plugins/marketplace-reference.md § Output that fails the install or update: "The install or update
 * fails when the printed directory is one of these": no plugin content, the session's own directory,
 * a network path (Windows UNC), too large to copy (copy mode: 256 MiB or 20,000 entries).
 */
import { expect, test } from 'bun:test';
import {
  filesUnderSkills,
  issueOf,
  plugin,
  PRINTED,
  prints,
  run,
} from '../support/marketplace-command.ts';
import { withSizes } from '../support/marketplace-ports.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const RULE = 'marketplace.rule.Output that fails the install or update';
const MIB = 1024 * 1024;

spec(`${RULE}.No plugin content`, () => {
  test('a directory with none of .claude-plugin/, skills/, commands/, agents/ or hooks/ at its top level fails', async () => {
    const empty = memoryFiles({ 'README.md': 'x', 'src/skills/a/SKILL.md': 'x' });
    const issue = await issueOf(run(prints(PRINTED), { folders: { [PRINTED]: empty } }).result);
    expect(issue.severity).toBe('error');
    expect(issue.message).toContain('no plugin content at its top level');
  });

  test('each of those five directories is plugin content', async () => {
    for (const path of [
      '.claude-plugin/plugin.json',
      'skills/a/SKILL.md',
      'commands/c.md',
      'agents/a.md',
      'hooks/hooks.json',
    ]) {
      const files = memoryFiles({ [path]: 'x' });
      expect(await run(prints(PRINTED), { folders: { [PRINTED]: files } }).result).toMatchObject({
        directory: PRINTED,
      });
    }
  });
});

spec(`${RULE}.The session's own directory`, () => {
  test('the directory Claude Code was started in, or one of its parents, fails', async () => {
    for (const sessionCwd of ['/opt/tool/out', '/opt/tool/out/deeper/still']) {
      const issue = await issueOf(run(prints(PRINTED), { setting: { sessionCwd } }).result);
      expect(issue.message).toContain(
        'is the directory Claude Code was started in, or one of its parents',
      );
    }
  });

  test('a directory below, beside or unrelated to the session directory does not', async () => {
    for (const sessionCwd of ['/opt/tool', '/opt/tool/other', '/work/app']) {
      const planned = await run(prints(PRINTED), { setting: { sessionCwd } }).result;
      expect(planned).toMatchObject({ directory: PRINTED });
    }
  });
});

spec(`${RULE}.A network path`, () => {
  const windows = { setting: { platform: 'windows' }, plan: { shell: 'cmd' } } as const;

  test('on Windows a printed UNC path fails, whichever separator it uses', async () => {
    for (const printed of ['\\\\server\\share\\plugin', '//server/share/plugin']) {
      const { result, directories } = run(prints(`${printed}\n`), {
        ...windows,
        folders: { [printed]: plugin() },
      });
      expect((await issueOf(result)).message).toContain('UNC');
      expect(directories.opened).toEqual([]);
    }
  });

  test('a drive path on Windows is not a network path', async () => {
    const result = await run(prints('C:\\tool\\out\n'), {
      ...windows,
      setting: { platform: 'windows', sessionCwd: 'C:\\work' },
      folders: { 'C:\\tool\\out': plugin() },
    }).result;
    expect(result).toMatchObject({ directory: 'C:\\tool\\out' });
  });
});

spec(`${RULE}.Too large to copy`, () => {
  test('in copy mode a directory of more than 20,000 entries fails, 20,000 does not', async () => {
    expect(
      await run(prints(PRINTED), { folders: { [PRINTED]: filesUnderSkills(19_999) } }).result,
    ).toMatchObject({ directory: PRINTED });
    const issue = await issueOf(
      run(prints(PRINTED), { folders: { [PRINTED]: filesUnderSkills(20_000) } }).result,
    );
    expect(issue.message).toContain('more than 20000 entries');
    expect(issue.message).toContain('too many to copy');
  });

  test('in copy mode a directory larger than 256 MiB fails, 256 MiB does not', async () => {
    // plugin() holds a 2-byte plugin.json beside the file that is resized
    const at = withSizes(plugin(), { 'skills/a/SKILL.md': 256 * MIB - 2 });
    expect(await run(prints(PRINTED), { folders: { [PRINTED]: at } }).result).toMatchObject({
      directory: PRINTED,
    });
    const past = withSizes(plugin(), { 'skills/a/SKILL.md': 256 * MIB - 1 });
    const issue = await issueOf(run(prints(PRINTED), { folders: { [PRINTED]: past } }).result);
    expect(issue.message).toContain('larger than 256 MiB');
  });

  test('in link mode nothing is copied, so the limits do not apply', async () => {
    const huge = withSizes(plugin(), { 'skills/a/SKILL.md': 10_000 * MIB });
    expect(
      await run(prints(PRINTED), { plan: { mode: 'link' }, folders: { [PRINTED]: huge } }).result,
    ).toMatchObject({ mode: 'link' });
  });
});
