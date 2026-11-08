/**
 * permission-modes.md § Analyze before you edit with plan mode, § Skip all checks with
 * bypassPermissions mode ("Claude Code also doesn't enforce plan mode's blocks"), § Protected paths
 * and § Critical-path removals in each permission mode; permissions.md § Hook approvals in plan
 * mode and § Precedence among rules, hooks, and mods. What a session in plan mode may run, per the
 * three cases the docs give for a shell command and the interactive bypass exception.
 */
import { describe, expect, test } from 'bun:test';
import type { Decision } from '../../src/rules/index.ts';
import { allow, ask, bash, classify, decision, deny, onPath, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const AUTO = { autoAvailable: true };
const BYPASS_AT_TERMINAL = { bypassAvailable: true, interactive: true };

/**
 * The docs say plan mode blocks edits "until you approve a plan" and that a call gets "the same
 * prompt, block, or approval" as without a hook, without saying which of prompt and block a plain
 * edit gets: these tests ask only that it does not run. Which one it is, is a judgment
 * (decide-judgments.test.ts).
 */
const expectStopped = (decided: Decision): void => {
  expect(['ask', 'deny']).toContain(decided.outcome);
};

spec('permissions.mode.plan', () => {
  describe('permission-modes.md, "Analyze before you edit with plan mode": reads, no edits', () => {
    test('reads and the read-only shell commands run', () => {
      expect(onPath('plan', 'Read', '/work/app/a.ts')).toEqual(allow('read-in-working-directory'));
      expect(onPath('plan', 'Grep', '/work/app')).toEqual(allow('read-in-working-directory'));
      expect(bash('plan', 'ls -la')).toEqual(allow('read-only-command'));
    });

    test('a file edit does not run without an approved plan', () => {
      expectStopped(onPath('plan', 'Edit', '/work/app/a.ts'));
      expectStopped(onPath('plan', 'Write', '/work/app/a.ts', AUTO));
    });
  });

  describe('permission-modes.md: what a shell command does depends on the session, first case wins', () => {
    test('auto mode available and useAutoModeDuringPlan on (the default): the classifier reviews it', () => {
      expect(bash('plan', 'npm test', AUTO)).toEqual(classify('mode-plan'));
      expect(bash('plan', 'npm test', { ...AUTO, useAutoModeDuringPlan: true })).toEqual(
        classify('mode-plan'),
      );
    });

    test('auto mode not available: a command outside the read-only set prompts', () => {
      expect(bash('plan', 'npm test')).toEqual(ask('mode-plan'));
    });

    test('useAutoModeDuringPlan off: it prompts even with auto mode available', () => {
      expect(bash('plan', 'npm test', { ...AUTO, useAutoModeDuringPlan: false })).toEqual(
        ask('mode-plan'),
      );
    });

    test('an interactive terminal with bypass permissions available: neither classifier nor prompt', () => {
      expect(bash('plan', 'npm test', { ...AUTO, ...BYPASS_AT_TERMINAL })).toEqual(
        allow('mode-plan'),
      );
    });

    test('a critical-path removal is not classified: it asks, as in default mode', () => {
      expect(bash('plan', 'rm -rf ~')).toEqual(ask('critical-path'));
    });

    test('with the classifier reviewing planning commands and no bypass, a critical-path removal is handled as in auto mode', () => {
      expect(bash('plan', 'rm -rf ~', AUTO)).toEqual(ask('critical-path'));
      expect(bash('plan', 'rm -rf ~', { ...AUTO, interactive: false })).toEqual(
        deny('critical-path'),
      );
    });
  });

  describe('permission-modes.md, "Skip all checks with bypassPermissions mode": plan blocks not enforced', () => {
    test('an edit or shell command attempted during planning runs without prompting', () => {
      expect(onPath('plan', 'Edit', '/work/app/a.ts', BYPASS_AT_TERMINAL)).toEqual(
        allow('mode-plan'),
      );
      expect(bash('plan', 'rm -rf build', BYPASS_AT_TERMINAL)).toEqual(allow('mode-plan'));
    });

    test('explicit ask rules and recognized critical-path removals still prompt', () => {
      expect(
        bash('plan', 'git push origin main', {
          ...BYPASS_AT_TERMINAL,
          rules: rulesOf(['ask', 'Bash(git push *)']),
        }),
      ).toEqual(ask('ask-rule'));
      expect(bash('plan', 'rm -rf ~', BYPASS_AT_TERMINAL)).toEqual(ask('critical-path'));
    });

    test('plan mode keeps its blocks wherever there is no interactive terminal', () => {
      expectStopped(
        onPath('plan', 'Edit', '/work/app/a.ts', { bypassAvailable: true, interactive: false }),
      );
    });

    test('bypass permissions not available: plan keeps its blocks at a terminal too', () => {
      expectStopped(onPath('plan', 'Edit', '/work/app/a.ts', { interactive: true }));
    });
  });

  describe('permissions.md, "Hook approvals in plan mode"', () => {
    const hookAllow = { hook: { decision: 'allow' as const } };

    test('a hook allow has no effect on a file edit: the call gets what it would get with no hook', () => {
      expect(onPath('plan', 'Edit', '/work/app/a.ts', hookAllow)).toEqual(
        onPath('plan', 'Edit', '/work/app/a.ts'),
      );
      expect(onPath('plan', 'Edit', '/work/app/a.ts', { ...hookAllow, ...AUTO })).toEqual(
        onPath('plan', 'Edit', '/work/app/a.ts', AUTO),
      );
      expectStopped(onPath('plan', 'Edit', '/work/app/a.ts', hookAllow));
    });

    test('a hook allow has no effect on a shell command that is not read-only', () => {
      expect(bash('plan', 'npm test', hookAllow)).toEqual(bash('plan', 'npm test'));
      expect(bash('plan', 'npm test', { ...hookAllow, ...AUTO })).toEqual(classify('mode-plan'));
      expectStopped(bash('plan', 'npm test', hookAllow));
    });

    test('a hook allow with updatedInput on ExitPlanMode runs the tool without a prompt', () => {
      const hook = { decision: 'allow' as const, hasUpdatedInput: true };
      expect(decision('plan', 'ExitPlanMode', { plan: '1. do it' }, { hook })).toEqual(
        allow('hook'),
      );
    });

    test('ExitPlanMode with a hook allow and no updatedInput is not skipped', () => {
      expectStopped(
        decision('plan', 'ExitPlanMode', { plan: '1. do it' }, { hook: { decision: 'allow' } }),
      );
    });
  });

  describe('permissions.md: a mod in plan mode cannot approve what is not read-only, but can block', () => {
    test('a mod approval does not approve a file edit or a shell command', () => {
      const mod = { approved: true, policyEnforced: false };
      expectStopped(onPath('plan', 'Edit', '/work/app/a.ts', { mod }));
      expectStopped(bash('plan', 'npm test', { mod }));
      expect(bash('plan', 'npm test', { mod, ...AUTO })).toEqual(classify('mode-plan'));
    });

    test('a mod can still block such a call', () => {
      const mod = { approved: false, policyEnforced: false, blocked: true };
      expect(onPath('plan', 'Edit', '/work/app/a.ts', { mod })).toEqual(deny('mod'));
    });

    test('a mod approval of a read-only call is not needed and changes nothing', () => {
      const mod = { approved: true, policyEnforced: true };
      expect(onPath('plan', 'Read', '/work/app/a.ts', { mod })).toEqual(
        allow('read-in-working-directory'),
      );
    });
  });

  describe('permission-modes.md, "Protected paths": writes in plan mode', () => {
    const write = '/work/app/.git/config';

    test('allowed in an interactive terminal session with bypass permissions available', () => {
      expect(onPath('plan', 'Write', write, BYPASS_AT_TERMINAL)).toEqual(allow('mode-plan'));
    });

    test('otherwise routed to the classifier when auto mode is available during planning', () => {
      expect(onPath('plan', 'Write', write, AUTO)).toEqual(classify('protected-path'));
      expect(
        onPath('plan', 'Write', write, { ...AUTO, bypassAvailable: true, interactive: false }),
      ).toEqual(classify('protected-path'));
    });

    test('and prompted when it is not', () => {
      expect(onPath('plan', 'Write', write)).toEqual(ask('protected-path'));
      expect(onPath('plan', 'Write', write, { ...AUTO, useAutoModeDuringPlan: false })).toEqual(
        ask('protected-path'),
      );
    });
  });

  describe('permissions.md, "Network paths": plan mode with bypass permissions available', () => {
    test('a read from a network path runs without the prompt in an interactive terminal session', () => {
      expect(onPath('plan', 'Read', '/net/fileserver/notes.txt', BYPASS_AT_TERMINAL)).toEqual(
        allow('mode-plan'),
      );
    });

    test('and prompts otherwise', () => {
      expect(onPath('plan', 'Read', '/net/fileserver/notes.txt')).toEqual(ask('network-path'));
    });
  });
});
