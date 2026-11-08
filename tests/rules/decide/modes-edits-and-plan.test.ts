/**
 * permission-modes.md § "Auto-approve file edits with acceptEdits mode" (edits and `mkdir`, `touch`,
 * `rm`, `rmdir`, `mv`, `cp`, `sed` in the working directory or `additionalDirectories`, with safe
 * environment variables and process wrappers except for `touch`; what "still prompt[s]"; the
 * PowerShell cmdlets and the quote rule) and § "Analyze before you edit with plan mode" (reads, no
 * edits; the three cases for a shell command, the first that matches applies); permissions.md §
 * "Hook approvals in plan mode". Asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { decide } from '../../../src/rules/index.ts';
import {
  allow,
  ask,
  baseContext,
  bash,
  classify,
  decision,
  onPath,
  pathsWith,
} from '../../support/decide.ts';
import { spec } from '../../support/spec.ts';

const AUTO = { autoAvailable: true };

spec('permissions.modes.Auto-approve file edits with acceptEdits mode', () => {
  test('file edits in the working directory and in additionalDirectories run without a prompt', () => {
    expect(onPath('acceptEdits', 'Edit', '/work/app/src/a.ts')).toEqual(allow('accept-edits'));
    expect(onPath('acceptEdits', 'Write', '/work/app/new.ts')).toEqual(allow('accept-edits'));
    const match = pathsWith({ additionalDirectories: ['/work/shared'] });
    expect(onPath('acceptEdits', 'Edit', '/work/shared/a.ts', { match })).toEqual(
      allow('accept-edits'),
    );
  });

  test('mkdir, touch, rm, rmdir, mv, cp and sed on in-scope paths run', () => {
    for (const command of [
      'mkdir out',
      'touch notes.txt',
      'rm build.log',
      'rmdir empty',
      'mv a.txt b.txt',
      'cp a.txt b.txt',
      "sed -i 's/a/b/' a.ts",
    ]) {
      expect(bash('acceptEdits', command)).toEqual(allow('accept-edits'));
    }
  });

  test('safe environment variables (LANG=C, NO_COLOR=1) and wrappers (timeout, nice, nohup) do not stop them, except for touch', () => {
    for (const command of [
      'LANG=C rm a',
      'NO_COLOR=1 mv a b',
      'timeout 5 cp a b',
      'nice mkdir x',
      'nohup sed -i s/a/b/ f',
    ]) {
      expect(bash('acceptEdits', command)).toEqual(allow('accept-edits'));
    }
    expect(bash('acceptEdits', 'LANG=C touch a')).toEqual(ask('default-prompt'));
    expect(bash('acceptEdits', 'timeout 5 touch a')).toEqual(ask('default-prompt'));
  });

  test('a path outside the working directory and additionalDirectories still prompts', () => {
    expect(onPath('acceptEdits', 'Edit', '/work/other/a.ts')).toEqual(ask('default-prompt'));
    expect(bash('acceptEdits', 'mv a.txt /etc/a.txt')).toEqual(ask('default-prompt'));
  });

  test('a write to a protected path still prompts', () => {
    expect(onPath('acceptEdits', 'Write', '/work/app/.git/config')).toEqual(ask('protected-path'));
    expect(onPath('acceptEdits', 'Edit', '/work/app/.claude/settings.json')).toEqual(
      ask('protected-path'),
    );
  });

  test('a recognized critical-path removal still prompts', () => {
    expect(bash('acceptEdits', 'rm -rf ~')).toEqual(ask('critical-path'));
    expect(bash('acceptEdits', 'rm -rf /')).toEqual(ask('critical-path'));
  });

  test('touch with an option, a glob or a prefix still prompts', () => {
    for (const command of ['touch -t 2020 a', 'touch *.ts', 'timeout 5 touch a']) {
      expect(bash('acceptEdits', command)).toEqual(ask('default-prompt'));
    }
  });

  test('every other Bash command except the built-in read-only set still prompts', () => {
    expect(bash('acceptEdits', 'npm test')).toEqual(ask('default-prompt'));
    expect(bash('acceptEdits', 'git status')).toEqual(allow('read-only-command'));
  });

  test('a write whose symlink check resolves outside that scope is not auto-approved', () => {
    const asked = { toolName: 'Edit', input: { file_path: '/work/app/link/a.ts' } };
    expect(decide(asked, baseContext('acceptEdits'))).toEqual(allow('accept-edits'));
    const resolved = { ...asked, resolvedPaths: ['/etc/hosts'] };
    expect(decide(resolved, baseContext('acceptEdits'))).toEqual(ask('default-prompt'));
  });

  test('the PowerShell cmdlets Set-Content, Add-Content, Clear-Content and Remove-Item run on in-scope paths', () => {
    const windows = pathsWith({
      platform: 'windows',
      cwd: 'C:\\work\\app',
      primaryWorkingDirectory: 'C:\\work\\app',
      home: 'C:\\Users\\alice',
    });
    const run = (command: string) =>
      decision('acceptEdits', 'PowerShell', { command }, { match: windows });
    for (const command of [
      'Set-Content .\\notes.txt -Value done',
      'Add-Content .\\notes.txt -Value more',
      'Clear-Content .\\notes.txt',
      'Remove-Item .\\build.log',
    ]) {
      expect(run(command)).toEqual(allow('accept-edits'));
    }
    // "A positional argument that contains a quote character ... still prompts."
    expect(run('Set-Content .\\notes.txt "It\'s done"')).toEqual(ask('default-prompt'));
  });
});

spec('permissions.modes.Analyze before you edit with plan mode', () => {
  test('Claude reads files and runs read-only commands; an edit waits for an approved plan', () => {
    expect(onPath('plan', 'Read', '/work/app/a.ts')).toEqual(allow('read-in-working-directory'));
    expect(bash('plan', 'ls -la')).toEqual(allow('read-only-command'));
    expect(onPath('plan', 'Edit', '/work/app/a.ts')).toEqual(ask('mode-plan'));
  });

  test('case 1: an interactive terminal with bypass permissions available: neither classifier nor prompt', () => {
    const terminal = { ...AUTO, bypassAvailable: true, interactive: true };
    expect(bash('plan', 'npm test', terminal)).toEqual(allow('mode-plan'));
    expect(onPath('plan', 'Edit', '/work/app/a.ts', terminal)).toEqual(allow('mode-plan'));
  });

  test('case 2: auto mode available and useAutoModeDuringPlan on (the default): the classifier reviews shell commands', () => {
    expect(bash('plan', 'npm test', AUTO)).toEqual(classify('mode-plan'));
    expect(bash('plan', 'npm test', { ...AUTO, useAutoModeDuringPlan: true })).toEqual(
      classify('mode-plan'),
    );
  });

  test('case 2 never covers a critical-path removal: it is handled apart from the classifier', () => {
    expect(bash('plan', 'rm -rf ~', AUTO).outcome).toBe('ask');
    expect(bash('plan', 'rm -rf ~', AUTO).outcome).not.toBe('classify');
  });

  test('case 3: auto mode not available, or useAutoModeDuringPlan off: commands outside the read-only set prompt', () => {
    expect(bash('plan', 'npm test')).toEqual(ask('mode-plan'));
    expect(bash('plan', 'npm test', { ...AUTO, useAutoModeDuringPlan: false })).toEqual(
      ask('mode-plan'),
    );
  });

  test('plan mode keeps its blocks without an interactive terminal, bypass available or not', () => {
    expect(
      onPath('plan', 'Edit', '/work/app/a.ts', { bypassAvailable: true, interactive: false }),
    ).toEqual(ask('mode-plan'));
  });
});

describe('Hook approvals in plan mode', () => {
  spec('permissions.behavior.Hook approvals in plan mode', () => {
    const allowing = { hook: { decision: 'allow' as const } };

    test('a PreToolUse hook allow has no effect on a file edit: the call gets what it would get with no hook', () => {
      expect(onPath('plan', 'Edit', '/work/app/a.ts', allowing)).toEqual(
        onPath('plan', 'Edit', '/work/app/a.ts'),
      );
      expect(onPath('plan', 'Edit', '/work/app/a.ts', { ...allowing, ...AUTO })).toEqual(
        onPath('plan', 'Edit', '/work/app/a.ts', AUTO),
      );
    });

    test('nor on another call that is not read-only, such as a shell command that writes', () => {
      expect(bash('plan', 'npm install', allowing)).toEqual(bash('plan', 'npm install'));
      expect(bash('plan', 'npm install', { ...allowing, ...AUTO })).toEqual(classify('mode-plan'));
    });

    test('updatedInput returned with the hook is still applied: the hook does answer, its approval is what is void', () => {
      const withInput = { hook: { decision: 'allow' as const, hasUpdatedInput: true } };
      expect(onPath('plan', 'Edit', '/work/app/a.ts', withInput)).toEqual(ask('mode-plan'));
    });

    test('ExitPlanMode is the exception: allow with updatedInput runs it without a prompt', () => {
      const hook = { decision: 'allow' as const, hasUpdatedInput: true };
      expect(decision('plan', 'ExitPlanMode', { plan: '1. do it' }, { hook })).toEqual(
        allow('hook'),
      );
      expect(
        decision('plan', 'ExitPlanMode', { plan: '1. do it' }, { hook: { decision: 'allow' } }),
      ).toEqual(ask('mode-plan'));
    });

    test('a mod that handles tool.check cannot approve a file edit or a command that is not read-only, though it can block it', () => {
      const approving = { mod: { approved: true, policyEnforced: false } };
      expect(onPath('plan', 'Edit', '/work/app/a.ts', approving)).toEqual(ask('mode-plan'));
      expect(bash('plan', 'npm install', approving)).toEqual(ask('mode-plan'));
      const blocking = { mod: { approved: false, policyEnforced: false, blocked: true } };
      expect(onPath('plan', 'Edit', '/work/app/a.ts', blocking)).toEqual({
        outcome: 'deny',
        reason: 'mod',
      });
    });

    test('approving the plan lifts the limit: in another mode the hook allow works', () => {
      expect(bash('default', 'npm install', allowing)).toEqual(allow('hook'));
      expect(bash('acceptEdits', 'npm install', allowing)).toEqual(allow('hook'));
    });
  });
});
