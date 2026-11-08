/**
 * tools-reference.md § Bash tool behavior ("Foreground commands that move to the background",
 * "Time limit for background commands", "Raise the time limit for background commands") and §
 * PowerShell tool ("Exit code 1 from searches and `git diff` in PowerShell"); env-vars.md
 * (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`: "Set to `1`"). The kit decides from the command, the
 * variables and the session; moving the process is the host's. How a line is read when it holds a
 * `!`, an assignment prefix, a subshell or a trailing `&` is not in the docs and is a judgment,
 * tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  backgroundCwdNote,
  backgroundStopNotice,
  backgroundTimeLimit,
  classifyBashExit,
  classifyPowerShellExit,
  movedByTimeoutNotice,
  shouldMoveToBackground,
} from '../../src/rules/index.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const env = (record: Record<string, string> = {}) => fakeEnvironment(record);
const local = { bare: false };

spec('tools.tool.Bash', () => {
  test('a foreground command that reaches its timeout moves to the background, unless it starts with sleep', () => {
    expect(shouldMoveToBackground('npm run build', env(), local)).toBe(true);
    expect(shouldMoveToBackground('sleep 600', env(), local)).toBe(false);
    expect(shouldMoveToBackground('  sleep 5 && echo done', env(), local)).toBe(false);
    expect(shouldMoveToBackground('echo x; sleep 600', env(), local)).toBe(true);
    expect(shouldMoveToBackground('sleeper --start', env(), local)).toBe(true);
  });

  test('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 or bare mode stops the command instead of moving it', () => {
    const off = env({ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' });
    expect(shouldMoveToBackground('npm run build', off, local)).toBe(false);
    expect(shouldMoveToBackground('npm run build', env(), { bare: true })).toBe(false);
    expect(
      shouldMoveToBackground(
        'npm run build',
        env({ CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0' }),
        local,
      ),
    ).toBe(true);
  });

  test('the timeout notice says "Command did not complete within its 120s timeout and was moved to the background", the seconds matching the timeout', () => {
    expect(movedByTimeoutNotice(120_000)).toBe(
      'Command did not complete within its 120s timeout and was moved to the background',
    );
    expect(movedByTimeoutNotice(300_000)).toBe(
      'Command did not complete within its 300s timeout and was moved to the background',
    );
  });

  test('a cd, pushd, popd or chdir in a moved command is answered with the Session cwd note, verbatim', () => {
    const note =
      'Session cwd remains /repo; directory changes made by the backgrounded command do not apply to subsequent commands.';
    for (const command of ['cd src && npm test', 'pushd /tmp; ls', 'popd', 'ls | chdir x']) {
      expect(backgroundCwdNote(command, '/repo')).toBe(note);
    }
    expect(backgroundCwdNote('npm test', '/repo')).toBeUndefined();
    expect(backgroundCwdNote('cdr x', '/repo')).toBeUndefined();
  });

  test('the stop notice names the description of the command, verbatim', () => {
    expect(backgroundStopNotice('dev server')).toBe(
      'Background command "dev server" was stopped after reaching its background time limit',
    );
  });

  test('BASH_DEFAULT_TIMEOUT_MS applies "both for commands Claude starts without a timeout and for moved commands"', () => {
    const unattended = { unattended: true, printWithTextPrompt: false };
    const set = env({ BASH_DEFAULT_TIMEOUT_MS: '3000000' });
    expect(backgroundTimeLimit({ session: unattended, env: set })).toBe(3_000_000);
    expect(backgroundTimeLimit({ session: unattended, env: set, moved: true })).toBe(3_000_000);
    expect(
      backgroundTimeLimit({ session: unattended, env: set, moved: true, timeout: 60_000 }),
    ).toBe(3_000_000);
    const print = { unattended: true, printWithTextPrompt: true };
    expect(
      backgroundTimeLimit({
        session: print,
        env: env({ BASH_DEFAULT_TIMEOUT_MS: '700000' }),
        moved: true,
      }),
    ).toBe(700_000);
  });
});

spec('tools.tool.PowerShell', () => {
  test('exit 1 is valid for grep, rg, egrep, fgrep, findstr, git grep and git diff', () => {
    for (const command of [
      'grep x f',
      'rg x',
      'egrep x f',
      'fgrep x f',
      'findstr x f',
      'git grep x',
      'git diff',
    ]) {
      expect(classifyPowerShellExit(command, 1)).toBe(true);
    }
  });

  test('exit 0 is valid, other statuses are failures, and the bash-only commands are failures at exit 1', () => {
    expect(classifyPowerShellExit('npm test', 0)).toBe(true);
    expect(classifyPowerShellExit('findstr x f', 2)).toBe(false);
    for (const command of ['find . -name x', 'diff a b', 'test -f x', 'git status']) {
      expect(classifyPowerShellExit(command, 1)).toBe(false);
    }
  });

  test('findstr is no benign Bash command', () => {
    expect(classifyBashExit('findstr x f', 1)).toBe(false);
  });

  test('a search piped on to another command shows the error: rg foo | Out-Null is a failure, rg foo is not', () => {
    expect(classifyPowerShellExit('rg foo | Out-Null', 1)).toBe(false);
    expect(classifyPowerShellExit('rg foo', 1)).toBe(true);
  });
});

describe('judgments (spec/judgments.md): how an exit-1 line with a prefix or a suffix reads', () => {
  test('a negated command is not read as the command: ! grep x f at exit 1 is a failure', () => {
    expect(classifyBashExit('! grep x f', 1)).toBe(false);
    expect(classifyBashExit('cd src && ! grep x f', 1)).toBe(false);
    expect(classifyPowerShellExit('! grep x f', 1)).toBe(false);
    expect(classifyBashExit('echo hi! && grep x f', 1)).toBe(true);
  });

  test('an assignment prefix, a trailing &, and a subshell are read as written and are failures', () => {
    expect(classifyBashExit('LC_ALL=C grep x f', 1)).toBe(false);
    expect(classifyBashExit('grep x f &', 1)).toBe(false);
    expect(classifyBashExit('(grep x f)', 1)).toBe(false);
  });

  test('a command starts with sleep when its first word is sleep, and a blank line moves', () => {
    expect(shouldMoveToBackground('', env(), local)).toBe(true);
  });

  test('a timeout that is not a whole number of seconds is written as the division', () => {
    expect(movedByTimeoutNotice(1_500)).toContain('1.5s');
  });
});
