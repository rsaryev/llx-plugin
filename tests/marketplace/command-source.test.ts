/**
 * marketplace-reference.md § command plugin source, § What the command must do, § Output that
 * fails the install or update, § Copy mode and link mode.
 */
import { expect, test } from 'bun:test';
import { withSizes } from '../support/marketplace-ports.ts';
import {
  filesUnderSkills,
  issueOf,
  plugin,
  PRINTED,
  prints,
  run,
} from '../support/marketplace-command.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

spec('marketplace.source.command', () => {
  test('runs through sh from the home directory, within the timeout, with the inherited environment', async () => {
    const { result, runner } = run(prints(`${PRINTED}\n`));
    expect(await result).toMatchObject({ directory: PRINTED, mode: 'copy' });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]).toMatchObject({
      spec: { form: 'exec', command: 'sh', args: ['-c', 'my-tool claude-plugin-path'] },
      cwd: '/home/user',
      timeoutMs: 120_000,
      env: { PATH: '/bin', HOME: '/home/user' },
    });
  });

  test('on Windows it runs through cmd.exe', async () => {
    const { result, runner } = run(prints('C:\\tool\\out\n'), {
      plan: { shell: 'cmd' },
      setting: { platform: 'windows', sessionCwd: 'C:\\work' },
      folders: { 'C:\\tool\\out': plugin() },
    });
    expect(await result).toMatchObject({ directory: 'C:\\tool\\out' });
    expect(runner.calls[0]?.spec).toEqual({
      form: 'exec',
      command: 'cmd.exe',
      args: ['/c', 'my-tool claude-plugin-path'],
    });
  });

  test('the fetched plugin is the printed directory, readable as plugin files', async () => {
    const fetched = await run(prints(PRINTED)).result;
    if ('severity' in fetched) throw new Error('expected a fetched plugin');
    expect(await fetched.files.exists('.claude-plugin/plugin.json')).toBe(true);
  });

  test('fails when the command exits non-zero', async () => {
    const issue = await issueOf(run({ exitCode: 3, stdout: PRINTED }).result);
    expect(issue.severity).toBe('error');
    expect(issue.message).toContain('3');
  });

  test('fails when the command runs longer than timeout', async () => {
    const issue = await issueOf(run({ exitCode: null, timedOut: true }).result);
    expect(issue.message).toContain('120 seconds');
  });

  test('fails when the command cannot be started', async () => {
    const issue = await issueOf(run({ exitCode: null, startError: 'no such shell' }).result);
    expect(issue.message).toContain('no such shell');
  });

  test('fails when it prints anything other than one absolute path', async () => {
    for (const stdout of [
      '',
      '\n',
      `${PRINTED}\n/other\n`,
      'Building...\n/opt/tool/out\n',
      'relative/dir\n',
      './out\n',
      'out',
    ]) {
      const { result, directories } = run(prints(stdout));
      expect((await issueOf(result)).severity).toBe('error');
      expect(directories.opened).toEqual([]);
    }
  });

  test('accepts the one line with or without its line break', async () => {
    for (const stdout of [PRINTED, `${PRINTED}\n`, `${PRINTED}\r\n`]) {
      expect(await run(prints(stdout)).result).toMatchObject({ directory: PRINTED });
    }
  });

  test('on Windows a UNC path is refused, a drive path is not', async () => {
    const windows = { platform: 'windows', sessionCwd: 'C:\\work' } as const;
    for (const stdout of ['\\\\server\\share\\plugin\n', '//server/share/plugin\n']) {
      const issue = await issueOf(
        run(prints(stdout), { setting: windows, plan: { shell: 'cmd' } }).result,
      );
      expect(issue.message).toContain('UNC');
    }
    const ok = run(prints('D:/tools/out\n'), {
      setting: windows,
      folders: { 'D:/tools/out': plugin() },
      plan: { shell: 'cmd' },
    });
    expect(await ok.result).toMatchObject({ directory: 'D:/tools/out' });
  });

  test('fails when the printed directory is the one Claude Code was started in, or a parent of it', async () => {
    for (const printed of ['/work/app', '/work', '/', '/work/app/']) {
      const folders = { [printed]: plugin() };
      const issue = await issueOf(run(prints(printed), { folders }).result);
      expect(issue.message).toContain('started in');
    }
  });

  test('a directory beside or below the session directory is fine', async () => {
    for (const printed of ['/work/app2', '/work/app/.out', '/elsewhere']) {
      const folders = { [printed]: plugin() };
      expect(await run(prints(printed), { folders }).result).toMatchObject({ directory: printed });
    }
  });

  test('fails when the printed directory has no plugin content at its top level', async () => {
    const empty = memoryFiles({ 'README.md': 'x', 'nested/skills/a/SKILL.md': 'x' });
    const issue = await issueOf(run(prints(PRINTED), { folders: { [PRINTED]: empty } }).result);
    expect(issue.message).toContain('plugin content');
  });

  test('a .claude-plugin/, skills/, commands/, agents/ or hooks/ directory is plugin content', async () => {
    for (const name of ['.claude-plugin', 'skills', 'commands', 'agents', 'hooks']) {
      const files = memoryFiles({ [`${name}/x`]: 'x' });
      const folders = { [PRINTED]: files };
      expect(await run(prints(PRINTED), { folders }).result).toMatchObject({ directory: PRINTED });
    }
  });

  test('a file named like a content directory is not plugin content', async () => {
    const issue = await issueOf(
      run(prints(PRINTED), { folders: { [PRINTED]: memoryFiles({ skills: 'a file' }) } }).result,
    );
    expect(issue.message).toContain('plugin content');
  });

  test('in copy mode, a directory of more than 20,000 entries is too large to copy', async () => {
    // skills/ itself is an entry: 19,999 files and the directory make exactly 20,000.
    expect(
      await run(prints(PRINTED), { folders: { [PRINTED]: filesUnderSkills(19_999) } }).result,
    ).toMatchObject({
      directory: PRINTED,
    });
    const issue = await issueOf(
      run(prints(PRINTED), { folders: { [PRINTED]: filesUnderSkills(20_000) } }).result,
    );
    expect(issue.message).toContain('20000');
  });

  test('in copy mode, a directory larger than 256 MiB is too large to copy', async () => {
    const MIB = 1024 * 1024;
    const fits = withSizes(plugin(), {
      'skills/a/SKILL.md': 256 * MIB,
      '.claude-plugin/plugin.json': 0,
    });
    expect(await run(prints(PRINTED), { folders: { [PRINTED]: fits } }).result).toMatchObject({
      directory: PRINTED,
    });
    const tooBig = withSizes(plugin(), {
      'skills/a/SKILL.md': 256 * MIB,
      '.claude-plugin/plugin.json': 1,
    });
    const issue = await issueOf(run(prints(PRINTED), { folders: { [PRINTED]: tooBig } }).result);
    expect(issue.message).toContain('256 MiB');
  });

  test('sizes add up across files and directories', async () => {
    const MIB = 1024 * 1024;
    const files = withSizes(
      memoryFiles({ 'skills/a': 'x', 'skills/b/c': 'x', '.claude-plugin/p': 'x' }),
      {
        'skills/a': 130 * MIB,
        'skills/b/c': 130 * MIB,
      },
    );
    const issue = await issueOf(run(prints(PRINTED), { folders: { [PRINTED]: files } }).result);
    expect(issue.message).toContain('256 MiB');
  });
});
