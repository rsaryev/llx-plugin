/**
 * hooks.md § Failed hooks on Windows without Git Bash: the text that marks a blocked call, the exit
 * codes that count, and the fixes the section lists (`onFailure`, a hook written for Bash, one `.exe`,
 * a PowerShell guard hook). The error of a hook that started no program is in
 * powershell-no-program.test.ts.
 */
import { expect, test } from 'bun:test';
import type { HookHandler } from '../../../../src/protocol/hook-config.ts';
import { exited } from '../../../support/hooks-verdict.ts';
import { settingsCommand } from '../../../support/hooks-run.ts';
import { MESSAGE, noGitBash, run, verdict } from '../../../support/powershell-run.ts';
import { spec } from '../../../support/spec.ts';

spec('hooks.behavior.Failed hooks on Windows without Git Bash', () => {
  const shellForm: HookHandler = { type: 'command', command: 'check.cmd' };

  test('a PreToolUse or PermissionRequest hook that failed or timed out blocks the call, with the sentence the docs quote', () => {
    for (const event of ['PreToolUse', 'PermissionRequest'] as const) {
      for (const raw of [exited(1, 'boom'), { kind: 'timed-out' } as const]) {
        const found = verdict(event, shellForm, raw);
        expect(found.block?.reason).toContain(MESSAGE);
        expect(found.block?.message).toContain(MESSAGE);
      }
    }
  });

  test('any exit code other than 0 or 2 is a failure, even with JSON that does not deny the call', () => {
    const json = '{"systemMessage":"just a warning"}';
    expect(verdict('PreToolUse', shellForm, exited(1, '', json)).block).toBeDefined();
    expect(verdict('PreToolUse', shellForm, exited(3, '', json)).block).toBeDefined();
    expect(verdict('PreToolUse', shellForm, exited(0, '', json)).block).toBeUndefined();
    expect(verdict('PreToolUse', shellForm, exited(2, 'no')).block).toBeDefined();
  });

  test('with Git Bash found the same exit code goes ahead', () => {
    expect(verdict('PreToolUse', shellForm, exited(1, 'boom'), false).block).toBeUndefined();
  });

  test('fix: "onFailure": "continue" lets the call go ahead when the hook fails', () => {
    const hook: HookHandler = { ...shellForm, onFailure: 'continue' };
    expect(verdict('PreToolUse', hook, exited(1, 'boom')).block).toBeUndefined();
    expect(verdict('PreToolUse', hook, { kind: 'timed-out' }).block).toBeUndefined();
  });

  test('fix: a hook that exits 1 to warn but must block when it crashes uses "onFailure": "block" and exits 0 where it warns', () => {
    const hook: HookHandler = { ...shellForm, onFailure: 'block' };
    const crash = verdict('PreToolUse', hook, exited(1, 'unhandled exception'));
    expect(crash.block?.reason).toContain('failed; blocking because onFailure is "block"');
    expect(crash.block?.reason).not.toContain(MESSAGE);
    const warned = verdict('PreToolUse', hook, exited(0, '', '{"systemMessage":"careful"}'));
    expect(warned.block).toBeUndefined();
    expect(warned.output).toEqual({ systemMessage: 'careful' });
  });

  test('fix: a hook written for Bash runs in PowerShell without Git Bash, and in Bash once the host finds it', async () => {
    const bashScript = settingsCommand({ command: '[ -f "$CLAUDE_PROJECT_DIR/ok" ] && echo ok' });
    expect((await run(bashScript, noGitBash)).calls[0]?.spec).toMatchObject({
      shell: 'powershell',
    });
    expect((await run(bashScript, { defaultShell: 'bash' })).calls[0]?.spec).toMatchObject({
      shell: 'bash',
    });
  });

  test('fix: a hook that runs one .exe goes in exec form, no shell, and with "onFailure": "block" it blocks when the program fails, is missing or times out', async () => {
    const exe: HookHandler = {
      type: 'command',
      command: 'C:\\Tools\\guard.exe',
      args: ['--strict'],
      onFailure: 'block',
    };
    const { calls } = await run(settingsCommand(exe), noGitBash);
    expect(calls[0]?.spec).toEqual({
      form: 'exec',
      command: 'C:\\Tools\\guard.exe',
      args: ['--strict'],
    });
    for (const raw of [
      exited(1, 'denied'),
      { kind: 'not-started', message: 'spawn C:\\Tools\\guard.exe ENOENT' } as const,
      { kind: 'timed-out' } as const,
    ]) {
      expect(verdict('PreToolUse', exe, raw).block).toBeDefined();
    }
  });

  test('without "onFailure": "block" the same exec-form hook lets the call go ahead when the program fails, is missing or times out', () => {
    const exe: HookHandler = { type: 'command', command: 'C:\\Tools\\guard.exe', args: [] };
    for (const raw of [
      exited(1, 'denied'),
      { kind: 'not-started', message: 'ENOENT' } as const,
      { kind: 'timed-out' } as const,
    ]) {
      expect(verdict('PreToolUse', exe, raw).block).toBeUndefined();
    }
  });

  test('fix: a PowerShell guard hook with onFailure unset blocks only while Git Bash is missing; with "onFailure": "block" and "shell": "powershell" it blocks either way', () => {
    const unset: HookHandler = { type: 'command', command: '& ./guard.ps1', shell: 'powershell' };
    expect(verdict('PreToolUse', unset, exited(1, 'x'), true).block).toBeDefined();
    expect(verdict('PreToolUse', unset, exited(1, 'x'), false).block).toBeUndefined();
    const block: HookHandler = { ...unset, onFailure: 'block' };
    expect(verdict('PreToolUse', block, exited(1, 'x'), true).block).toBeDefined();
    expect(verdict('PreToolUse', block, exited(1, 'x'), false).block).toBeDefined();
  });

  test('no other event is a gate: a PostToolUse hook that fails does not block', () => {
    expect(verdict('PostToolUse', shellForm, exited(1, 'x')).block).toBeUndefined();
  });

  test('the error of a hook that started no program carries both texts', async () => {
    const quoted = settingsCommand({ command: '"C:\\Tools\\guard.exe"' }, 'PreToolUse');
    const { result } = await run(quoted, noGitBash);
    const found = verdict('PreToolUse', quoted.handler, result.run);
    expect(found.block?.reason).toContain(MESSAGE);
    expect(found.block?.reason).toContain('PowerShell started no program');
  });
});
