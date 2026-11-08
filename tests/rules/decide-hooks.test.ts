/**
 * permissions.md § Extend permissions with hooks, § Precedence among rules, hooks, and mods;
 * hooks.md § PreToolUse decision control (`permissionDecision` allow, deny, ask, defer; exit code 2).
 * How a PreToolUse hook outcome and a mod's `tool.check` answer combine with the rules and the
 * mode, asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, bash, decision, deny, onPath, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const hook = (decisionName: 'allow' | 'deny' | 'ask' | 'defer') => ({
  hook: { decision: decisionName },
});

spec('permissions.mode.default', () => {
  describe('PreToolUse hook decisions do not bypass permission rules', () => {
    test('a hook allow skips the prompt a command would get', () => {
      expect(bash('default', 'npm test', hook('allow'))).toEqual(allow('hook'));
    });

    test('a matching deny rule blocks the call even when the hook returned allow', () => {
      const rules = rulesOf(['deny', 'Bash(npm *)']);
      expect(bash('default', 'npm test', { ...hook('allow'), rules })).toEqual(deny('deny-rule'));
    });

    test('a matching ask rule still prompts even when the hook returned allow or ask', () => {
      const rules = rulesOf(['ask', 'Bash(npm *)']);
      expect(bash('default', 'npm test', { ...hook('allow'), rules })).toEqual(ask('ask-rule'));
      expect(bash('default', 'npm test', { ...hook('ask'), rules })).toEqual(ask('ask-rule'));
    });

    test('a hook deny prevents the call, whatever an allow rule says', () => {
      const rules = rulesOf(['allow', 'Bash(npm test)']);
      expect(bash('default', 'npm test', { ...hook('deny'), rules })).toEqual(deny('hook'));
    });

    test('a hook ask prompts even when an allow rule matches', () => {
      const rules = rulesOf(['allow', 'Bash(npm test)']);
      expect(bash('default', 'npm test', { ...hook('ask'), rules })).toEqual(ask('hook'));
    });

    test('a hook that exits with code 2 blocks the call before rules are evaluated, even with an allow rule', () => {
      const rules = rulesOf(['allow', 'Bash']);
      expect(bash('default', 'npm test', { hook: { blocked: true }, rules })).toEqual(deny('hook'));
    });

    test('an exit-2 block holds even when the JSON said allow', () => {
      expect(bash('default', 'npm test', { hook: { blocked: true, decision: 'allow' } })).toEqual(
        deny('hook'),
      );
    });

    test('defer is not an answer: the call goes through the normal permission flow', () => {
      expect(bash('default', 'npm test', hook('defer'))).toEqual(ask('default-prompt'));
    });

    test('a hook allow does not approve what no mode auto-approves', () => {
      expect(bash('default', 'rm -rf ~', hook('allow'))).toEqual(ask('critical-path'));
      expect(onPath('default', 'Read', '/net/fileserver/notes.txt', hook('allow'))).toEqual(
        ask('network-path'),
      );
      expect(
        decision(
          'default',
          'mcp__forms__confirm',
          {},
          { ...hook('allow'), requiresUserInteraction: new Set(['mcp__forms__confirm']) },
        ),
      ).toEqual(ask('requires-user-interaction'));
    });

    test('AskUserQuestion and ExitPlanMode need updatedInput paired with allow', () => {
      const bare = { hook: { decision: 'allow' as const } };
      const paired = { hook: { decision: 'allow' as const, hasUpdatedInput: true } };
      expect(decision('default', 'AskUserQuestion', { questions: [] }, bare)).toEqual(
        ask('requires-user-interaction'),
      );
      expect(decision('default', 'AskUserQuestion', { questions: [] }, paired)).toEqual(
        allow('hook'),
      );
    });

    test('to run all Bash commands except a few: allow Bash and a hook that blocks those', () => {
      const rules = rulesOf(['allow', 'Bash']);
      expect(bash('default', 'npm test', { rules })).toEqual(allow('allow-rule'));
      expect(bash('default', 'rm -rf build', { rules, hook: { blocked: true } })).toEqual(
        deny('hook'),
      );
    });
  });

  describe('a mod that handles tool.check, with managed settings or a Team or Enterprise login', () => {
    const enforced = { approved: true, policyEnforced: true };

    test('a call a deny rule refuses stays refused', () => {
      expect(
        bash('default', 'rm x', { rules: rulesOf(['deny', 'Bash(rm *)']), mod: enforced }),
      ).toEqual(deny('deny-rule'));
    });

    test('a call an ask rule would prompt for still prompts', () => {
      expect(
        bash('default', 'git push', { rules: rulesOf(['ask', 'Bash(git push)']), mod: enforced }),
      ).toEqual(ask('ask-rule'));
    });

    test('a call a PreToolUse hook would prompt for still prompts, and one it blocked stays blocked', () => {
      expect(bash('default', 'npm test', { ...hook('ask'), mod: enforced })).toEqual(ask('hook'));
      expect(bash('default', 'npm test', { hook: { blocked: true }, mod: enforced })).toEqual(
        deny('hook'),
      );
    });

    test('a call the mode alone would prompt for is approved', () => {
      expect(bash('default', 'npm test', { mod: enforced })).toEqual(allow('mod'));
    });
  });

  describe('a mod with neither managed settings nor a Team or Enterprise login', () => {
    const open = { approved: true, policyEnforced: false };

    test('can approve a call a deny rule refuses or a PreToolUse hook blocked', () => {
      expect(
        bash('default', 'rm x', { rules: rulesOf(['deny', 'Bash(rm *)']), mod: open }),
      ).toEqual(allow('mod'));
      expect(bash('default', 'npm test', { hook: { blocked: true }, mod: open })).toEqual(
        allow('mod'),
      );
    });

    test('is not prompted about what an ask rule or a hook would prompt for', () => {
      expect(
        bash('default', 'git push', { rules: rulesOf(['ask', 'Bash(git push)']), mod: open }),
      ).toEqual(allow('mod'));
      expect(bash('default', 'npm test', { ...hook('ask'), mod: open })).toEqual(allow('mod'));
    });

    test('a mod that does not approve changes nothing', () => {
      expect(
        bash('default', 'npm test', { mod: { approved: false, policyEnforced: false } }),
      ).toEqual(ask('default-prompt'));
    });
  });

  describe('a tool that requires user interaction', () => {
    test('a mod tool.check approval does not skip the prompt', () => {
      const mod = { approved: true, policyEnforced: false };
      expect(decision('default', 'AskUserQuestion', { questions: [] }, { mod })).toEqual(
        ask('requires-user-interaction'),
      );
    });
  });
});

spec('permissions.mode.dontAsk', () => {
  describe('a mod in dontAsk mode', () => {
    test('can approve a call that nothing but the mode would deny', () => {
      const mod = { approved: true, policyEnforced: true };
      expect(bash('dontAsk', 'npm test', { mod })).toEqual(allow('mod'));
    });

    test('with managed settings it cannot approve a call an ask rule would deny', () => {
      const mod = { approved: true, policyEnforced: true };
      const rules = rulesOf(['ask', 'Bash(git push)']);
      expect(bash('dontAsk', 'git push', { mod, rules })).toEqual(deny('ask-rule'));
    });

    test('a PreToolUse hook allow approves what the mode would deny', () => {
      expect(bash('dontAsk', 'npm test', hook('allow'))).toEqual(allow('hook'));
    });

    test('a hook allow cannot approve a critical-path removal or a network-path read', () => {
      expect(bash('dontAsk', 'rm -rf ~', hook('allow'))).toEqual(deny('critical-path'));
      expect(onPath('dontAsk', 'Read', '/net/fileserver/notes.txt', hook('allow'))).toEqual(
        deny('network-path'),
      );
    });
  });
});
