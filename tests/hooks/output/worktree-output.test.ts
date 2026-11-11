/**
 * hooks.md § "WorktreeCreate output": the path a command hook prints (last non-empty line, ANSI
 * stripped) or an HTTP hook returns, failure without a path, relative paths resolved against the
 * directory the hook ran in, and the refusals of `.`/`..` segments and symlinks.
 */
import { describe, expect, test } from 'bun:test';
import { resolveWorktreePath, stripAnsi } from '../../../src/hooks/index.ts';
import type { RegisteredHandler } from '../../../src/hooks/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { fire } from '../../support/hooks-fire.ts';
import { specific, stage } from '../../support/hooks-output.ts';
import { entry } from '../../support/hooks-select.ts';
import { spec } from '../../support/spec.ts';
import { lastPathLine } from '../../../src/hooks/output/worktree-path.ts';

const ESC = '\u001b';
const BEL = '\u0007';
const ST = `${ESC}\\`;

const httpEntry = (event: HookEvent): RegisteredHandler =>
  entry(event, { handler: { type: 'http', url: 'http://wt.test/hook' } });

const created = (stdout: string, exitCode = 0) =>
  fire('WorktreeCreate', [entry('WorktreeCreate')], [{ exitCode, stdout }], { output: stage }).then(
    ({ outcome }) => outcome,
  );

const ask = (body: string) =>
  fire('WorktreeCreate', [httpEntry('WorktreeCreate')], [], {
    output: stage,
    http: [{ status: 200, body }],
  }).then(({ outcome }) => outcome);

const links = (...linked: string[]) => ({
  repositoryRoot: '/work/app',
  ranIn: '/work/app',
  isSymlink: (path: string) => Promise.resolve(linked.includes(path)),
});

const IN = { ranIn: '/work/app' };

spec('hooks.behavior.WorktreeCreate output', () => {
  describe('a command hook prints the path as the last non-empty line of stdout', () => {
    test('the docs example prints the checkout noise to stderr and the path last: the path is read', async () => {
      const outcome = await created('/home/me/.claude/worktrees/feature-auth\n');
      expect(await resolveWorktreePath(outcome, IN)).toEqual({
        path: '/home/me/.claude/worktrees/feature-auth',
      });
    });

    test('lines before it are ignored, and so are blank lines after it', async () => {
      const outcome = await created('Checking out...\nAt revision 12.\n/tmp/wt\n\n  \n');
      expect(await resolveWorktreePath(outcome, IN)).toEqual({ path: '/tmp/wt' });
    });

    test('ANSI escape codes are stripped before the line is read, so a shell banner before the echo is ignored', async () => {
      const banner = `${ESC}[1;32mWelcome back${ESC}[0m\n`;
      const colored = `${ESC}[36m/tmp/wt${ESC}[0m\n`;
      const outcome = await created(banner + colored);
      expect(await resolveWorktreePath(outcome, IN)).toEqual({ path: '/tmp/wt' });
    });

    test('a line made only of escape codes is empty, so the line before it is the path', () => {
      expect(lastPathLine(`/tmp/wt\n${ESC}[0m\n`)).toBe('/tmp/wt');
    });

    test('CSI, OSC (ended by BEL or ST) and two-character escapes are all stripped', () => {
      expect(stripAnsi(`${ESC}[2K${ESC}]0;title${BEL}x${ESC}]8;;http://a${ST}y${ESC}7z`)).toBe(
        'xyz',
      );
    });

    test('a hook that wrote JSON to stdout returns that line as the path: the command hook cannot return JSON', async () => {
      const json = '{"hookSpecificOutput":{"worktreePath":"/abs/wt"}}';
      const outcome = await created(`${json}\n`);
      expect(outcome.effects.worktreePath).toBeUndefined();
      expect(outcome.stdout.map(lastPathLine)).toEqual([json]);
    });
  });

  describe('an HTTP hook returns hookSpecificOutput.worktreePath in the response body', () => {
    test('the documented response gives the path', async () => {
      const outcome = await ask(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'WorktreeCreate', worktreePath: '/absolute/path' },
        }),
      );
      expect(await resolveWorktreePath(outcome, IN)).toEqual({ path: '/absolute/path' });
    });

    test('Claude Code acts on the success and the path, and discards systemMessage and continue', async () => {
      const outcome = await ask(
        JSON.stringify({
          continue: false,
          systemMessage: 'created',
          ...specific('WorktreeCreate', { worktreePath: '/absolute/path' }),
        }),
      );
      expect(outcome.continue).toBe(true);
      expect(outcome.systemMessages).toEqual([]);
      expect(outcome.proceed).toBe(true);
    });

    test('a response with no path produces none', async () => {
      const outcome = await ask('{}');
      expect(await resolveWorktreePath(outcome, IN)).toMatchObject({ failure: expect.any(String) });
    });
  });

  describe('if the hook fails or produces no path, worktree creation fails', () => {
    test.each([1, 2, 127])('a command hook that exits %i fails creation', async (code) => {
      const outcome = await created('/tmp/wt\n', code);
      expect(outcome.proceed).toBe(false);
      expect(await resolveWorktreePath(outcome, IN)).toMatchObject({ failure: expect.any(String) });
    });

    test.each(['', '\n', '  \n\n', `${ESC}[0m\n`])('stdout %j holds no path', async (stdout) => {
      const outcome = await created(stdout);
      expect(await resolveWorktreePath(outcome, IN)).toMatchObject({
        failure: expect.stringContaining('no worktree path'),
      });
    });
  });

  describe('a relative path is resolved against the directory the hook ran in, collapsing . and ..', () => {
    test.each([
      ['feature-auth', '/work/app/feature-auth'],
      ['./feature-auth', '/work/app/feature-auth'],
      ['a/./b', '/work/app/a/b'],
      ['a/b/../c', '/work/app/a/c'],
      ['../sibling', '/work/sibling'],
    ])('%s becomes %s', async (given, expected) => {
      const outcome = await created(`${given}\n`);
      expect(await resolveWorktreePath(outcome, IN)).toEqual({ path: expected });
    });

    test('the directory the hook ran in is the host fact, not the session cwd', async () => {
      const outcome = await created('wt\n');
      expect(await resolveWorktreePath(outcome, { ranIn: '/elsewhere' })).toEqual({
        path: '/elsewhere/wt',
      });
    });

    test('a Windows base directory keeps its drive and separators', async () => {
      const outcome = await created('wt\\..\\next\n');
      expect(await resolveWorktreePath(outcome, { ranIn: 'C:\\work\\app' })).toEqual({
        path: 'C:\\work\\app\\next',
      });
    });
  });

  describe('an absolute path that contains . or .. segments is refused, naming the component', () => {
    test.each([
      ['/work/./wt', '.'],
      ['/work/app/../wt', '..'],
      ['C:\\work\\..\\wt', '..'],
    ])('%s', async (given, segment) => {
      const outcome = await created(`${given}\n`);
      const result = await resolveWorktreePath(outcome, IN);
      expect(result).toMatchObject({ failure: expect.stringContaining(`"${segment}"`) });
    });

    test('a normalized absolute path is used as it is', async () => {
      const outcome = await created('/work/app/.claude/worktrees/x\n');
      expect(await resolveWorktreePath(outcome, IN)).toEqual({
        path: '/work/app/.claude/worktrees/x',
      });
    });
  });

  describe('a path that passes through a symlink below the repository root is refused', () => {
    test('the error names the symlink component', async () => {
      const outcome = await created('/work/app/shared/wt\n');
      const result = await resolveWorktreePath(outcome, links('/work/app/shared'));
      expect(result).toMatchObject({ failure: expect.stringContaining('"shared"') });
    });

    test('a relative path is checked after it is resolved', async () => {
      const outcome = await created('shared/../shared/wt\n');
      expect(await resolveWorktreePath(outcome, links('/work/app/shared'))).toMatchObject({
        failure: expect.stringContaining('"shared"'),
      });
    });

    test('the final component counts too: the path may not be a link itself', async () => {
      const outcome = await created('/work/app/wt\n');
      expect(await resolveWorktreePath(outcome, links('/work/app/wt'))).toMatchObject({
        failure: expect.stringContaining('"wt"'),
      });
    });

    test('a link at or above the repository root is not below it', async () => {
      const outcome = await created('/work/app/wt\n');
      expect(await resolveWorktreePath(outcome, links('/work', '/work/app'))).toEqual({
        path: '/work/app/wt',
      });
    });

    test('a path outside the repository is not looked at', async () => {
      const outcome = await created('/other/shared/wt\n');
      expect(await resolveWorktreePath(outcome, links('/other/shared'))).toEqual({
        path: '/other/shared/wt',
      });
    });

    test('without a probe or a root the kit checks nothing, since it reads no file system', async () => {
      const outcome = await created('/work/app/shared/wt\n');
      expect(await resolveWorktreePath(outcome, { ranIn: '/work/app' })).toEqual({
        path: '/work/app/shared/wt',
      });
    });
  });
});
