/**
 * permission-modes.md § "Skip all checks with bypassPermissions mode" (everything runs but the actions
 * no mode auto-approves; plan mode's blocks are not enforced at a terminal; in a `-p` run those calls
 * are denied) and § "Tool calls denied in `claude -p` and Agent SDK runs" (a call needing approval is
 * denied unless an allow rule, hook, callback or `--permission-prompt-tool` approves it); permissions.md
 * § "Permission modes". Asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, bash, decision, deny, onPath, rulesOf } from '../../support/decide.ts';
import { spec } from '../../support/spec.ts';

describe('Skip all checks with bypassPermissions mode', () => {
  spec('permissions.modes.Skip all checks with bypassPermissions mode', () => {
    test('everything runs: edits anywhere, commands, web access and writes to protected paths', () => {
      expect(onPath('bypassPermissions', 'Edit', '/etc/hosts')).toEqual(allow('mode-bypass'));
      expect(onPath('bypassPermissions', 'Write', '/work/app/.git/config')).toEqual(
        allow('mode-bypass'),
      );
      expect(onPath('bypassPermissions', 'Write', '/work/app/.claude/settings.json')).toEqual(
        allow('mode-bypass'),
      );
      expect(bash('bypassPermissions', 'npm test')).toEqual(allow('mode-bypass'));
      expect(
        decision('bypassPermissions', 'WebFetch', { url: 'https://example.com', prompt: 'p' }),
      ).toEqual(allow('mode-bypass'));
    });

    test('deny rules block in every mode, including bypassPermissions; allow rules have no effect there', () => {
      expect(bash('bypassPermissions', 'rm x', { rules: rulesOf(['deny', 'Bash(rm *)']) })).toEqual(
        deny('deny-rule'),
      );
      expect(
        bash('bypassPermissions', 'npm test', { rules: rulesOf(['allow', 'Bash(npm test)']) }),
      ).toEqual(allow('mode-bypass'));
    });

    test("in an interactive terminal with bypass available plan mode's blocks are not enforced; explicit ask rules and critical removals still prompt", () => {
      const terminal = { bypassAvailable: true, interactive: true };
      expect(onPath('plan', 'Edit', '/work/app/a.ts', terminal)).toEqual(allow('mode-plan'));
      expect(bash('plan', 'rm -rf ~', terminal)).toEqual(ask('critical-path'));
      expect(
        bash('plan', 'git push', { ...terminal, rules: rulesOf(['ask', 'Bash(git push *)']) }),
      ).toEqual(ask('ask-rule'));
    });

    test('plan mode keeps its blocks where there is no interactive terminal', () => {
      expect(
        onPath('plan', 'Edit', '/work/app/a.ts', { bypassAvailable: true, interactive: false }),
      ).toEqual(ask('mode-plan'));
    });

    test('in a -p run the few calls that would still prompt are denied instead', () => {
      const ctx = { cannotPrompt: true, interactive: false };
      expect(bash('bypassPermissions', 'rm -rf /', ctx)).toEqual(deny('prompt-unavailable'));
      expect(decision('bypassPermissions', 'AskUserQuestion', { questions: [] }, ctx)).toEqual(
        deny('prompt-unavailable'),
      );
      expect(bash('bypassPermissions', 'npm test', ctx)).toEqual(allow('mode-bypass'));
    });
  });
});

describe('Tool calls denied in claude -p and Agent SDK runs', () => {
  spec('permissions.modes.Tool calls denied in claude -p and Agent SDK runs', () => {
    const headless = { cannotPrompt: true, interactive: false };

    test('in Manual mode a call that needs approval is denied', () => {
      expect(bash('default', 'npm test', headless)).toEqual(deny('prompt-unavailable'));
      expect(onPath('default', 'Edit', '/work/app/a.ts', headless)).toEqual(
        deny('prompt-unavailable'),
      );
    });

    test('an allow rule approves it: --allowedTools "Bash(npm test)"', () => {
      const rules = rulesOf(['allow', 'Bash(npm test)']);
      expect(bash('default', 'npm test', { ...headless, rules })).toEqual(allow('allow-rule'));
      expect(bash('default', 'npm run lint', { ...headless, rules })).toEqual(
        deny('prompt-unavailable'),
      );
    });

    test('a hook approves it', () => {
      expect(bash('default', 'npm test', { ...headless, hook: { decision: 'allow' } })).toEqual(
        allow('hook'),
      );
    });

    test('a canUseTool callback or --permission-prompt-tool is asked what would prompt', () => {
      expect(
        bash('default', 'npm test', { ...headless, cannotPrompt: false, permissionCallback: true }),
      ).toEqual(ask('default-prompt'));
    });

    test('auto mode has a classifier review the call instead: nothing to list beforehand', () => {
      expect(bash('auto', 'npm test', { ...headless, autoAvailable: true })).toEqual({
        outcome: 'classify',
        reason: 'mode-auto',
      });
    });

    test('reads in the working directory and read-only commands run without approval', () => {
      expect(onPath('default', 'Read', '/work/app/a.ts', headless)).toEqual(
        allow('read-in-working-directory'),
      );
      expect(bash('default', 'git status', headless)).toEqual(allow('read-only-command'));
    });

    test('a mod that approves the call lifts the denial like it lifts a prompt', () => {
      expect(
        bash('default', 'npm test', {
          ...headless,
          mod: { approved: true, policyEnforced: false },
        }),
      ).toEqual(allow('mod'));
    });
  });
});
