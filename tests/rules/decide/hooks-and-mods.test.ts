/**
 * permissions.md § "Precedence among rules, hooks, and mods" (PreToolUse hook decisions do not
 * bypass deny and ask rules; the five outcomes that stay in place when a mod approves a call under
 * managed settings or a Team or Enterprise login; what a mod can approve without them; the outcome of
 * auto mode, plan mode and `dontAsk`; a tool that requires user interaction; a blocking hook takes
 * precedence over allow rules) and § "Settings precedence" (a deny at any level is final). Asserted
 * through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, bash, decision, deny, onPath, rulesOf } from '../../support/decide.ts';
import { parsed } from '../../support/rule-context.ts';
import { spec } from '../../support/spec.ts';
import type { RuleSource } from '../../../src/rules/index.ts';

const hook = (name: 'allow' | 'ask' | 'deny') => ({ hook: { decision: name } });
const enforced = { approved: true, policyEnforced: true };
const unenforced = { approved: true, policyEnforced: false };
const SOURCES: readonly RuleSource[] = [
  { kind: 'user' },
  { kind: 'project' },
  { kind: 'managed' },
  { kind: 'cli' },
];

spec(
  [
    'permissions.behavior.Precedence among rules, hooks, and mods',
    'hooks.guide.Hooks and permission modes',
  ],
  () => {
    test('a PreToolUse hook "allow" does not lift a deny rule: the matching deny rule blocks the call', () => {
      const rules = rulesOf(['deny', 'Bash(curl *)']);
      expect(bash('default', 'curl example.com', { ...hook('allow'), rules })).toEqual(
        deny('deny-rule'),
      );
    });

    test('a matching ask rule still prompts even when the hook returned "allow" or "ask"', () => {
      const rules = rulesOf(['ask', 'Bash(git push *)']);
      expect(bash('default', 'git push', { ...hook('allow'), rules })).toEqual(ask('ask-rule'));
      expect(bash('default', 'git push', { ...hook('ask'), rules })).toEqual(ask('ask-rule'));
    });

    test('a deny rule set in managed settings holds against a hook in every mode', () => {
      const rules = rulesOf(['deny', 'Bash(curl *)']);
      for (const mode of [
        'default',
        'acceptEdits',
        'auto',
        'bypassPermissions',
        'dontAsk',
      ] as const) {
        expect(bash(mode, 'curl x.io', { ...hook('allow'), rules, autoAvailable: true })).toEqual(
          deny('deny-rule'),
        );
      }
    });

    test('a blocking hook (exit code 2) stops the call before permission rules are evaluated, even with an allow rule', () => {
      const rules = rulesOf(['allow', 'Bash']);
      expect(bash('default', 'rm -rf build', { rules, hook: { blocked: true } })).toEqual(
        deny('hook'),
      );
    });

    test('"Bash" in the allow list plus a hook that rejects a few commands runs everything else without prompts', () => {
      const rules = rulesOf(['allow', 'Bash']);
      expect(bash('default', 'npm test', { rules })).toEqual(allow('allow-rule'));
      expect(bash('default', 'git push --force', { rules, hook: { blocked: true } })).toEqual(
        deny('hook'),
      );
    });

    describe('under managed settings or a Team or Enterprise login a mod that approves the call', () => {
      test('cannot lift a refusal by a deny rule', () => {
        const rules = rulesOf(['deny', 'Bash(curl *)']);
        expect(bash('default', 'curl x.io', { rules, mod: enforced })).toEqual(deny('deny-rule'));
      });

      test('cannot skip the prompt of an ask rule', () => {
        const rules = rulesOf(['ask', 'Bash(git push *)']);
        expect(bash('default', 'git push', { rules, mod: enforced })).toEqual(ask('ask-rule'));
      });

      test('cannot skip a prompt a PreToolUse hook or blockReadsOutsideWorkingDirectories would raise', () => {
        expect(bash('default', 'npm test', { ...hook('ask'), mod: enforced })).toEqual(ask('hook'));
        const block = { blockReadsOutsideWorkingDirectories: true, mod: enforced };
        expect(bash('default', 'cat /etc/passwd', block)).toEqual(ask('outside-working-directory'));
      });

      test('cannot lift a call a PreToolUse hook blocked', () => {
        expect(bash('default', 'npm test', { hook: { blocked: true }, mod: enforced })).toEqual(
          deny('hook'),
        );
      });

      test('is not asked in place of a permission callback in the default mode: the callback is still asked', () => {
        expect(bash('default', 'npm test', { permissionCallback: true, mod: enforced })).toEqual(
          ask('default-prompt'),
        );
      });

      test('is not asked in place of a permission callback: the call is still put to that tool', () => {
        const withCallback = { permissionCallback: true, autoAvailable: true, mod: enforced };
        expect(bash('auto', 'npm test', withCallback)).toEqual({
          outcome: 'classify',
          reason: 'mode-auto',
        });
      });
    });

    describe('with neither managed settings nor a Team or Enterprise login a mod that approves the call', () => {
      test('can approve a call a deny rule refuses or a PreToolUse hook blocked', () => {
        const rules = rulesOf(['deny', 'Bash(curl *)']);
        expect(bash('default', 'curl x.io', { rules, mod: unenforced })).toEqual(allow('mod'));
        expect(bash('default', 'npm test', { hook: { blocked: true }, mod: unenforced })).toEqual(
          allow('mod'),
        );
      });

      test('is not prompted about an ask rule, a PreToolUse hook or the read block', () => {
        const rules = rulesOf(['ask', 'Bash(git push *)']);
        expect(bash('default', 'git push', { rules, mod: unenforced })).toEqual(allow('mod'));
        expect(bash('default', 'npm test', { ...hook('ask'), mod: unenforced })).toEqual(
          allow('mod'),
        );
        const block = { blockReadsOutsideWorkingDirectories: true, mod: unenforced };
        expect(bash('default', 'cat /etc/passwd', block)).toEqual(allow('mod'));
      });

      test('is not subject to a permission callback, which is not asked about the approved call', () => {
        expect(bash('default', 'npm test', { permissionCallback: true, mod: unenforced })).toEqual(
          allow('mod'),
        );
      });
    });

    describe('each mode adds an outcome of its own in every setup', () => {
      test('auto mode: a call the mod approves runs without a classifier check, unless a callback cannot be bypassed', () => {
        expect(bash('auto', 'npm test', { autoAvailable: true, mod: unenforced })).toEqual(
          allow('mod'),
        );
        expect(bash('auto', 'npm test', { autoAvailable: true, mod: enforced })).toEqual(
          allow('mod'),
        );
        const callback = { autoAvailable: true, permissionCallback: true, mod: enforced };
        expect(bash('auto', 'npm test', callback)).toEqual({
          outcome: 'classify',
          reason: 'mode-auto',
        });
      });

      test('plan mode: the mod cannot approve a call that is not read-only', () => {
        expect(onPath('plan', 'Edit', '/work/app/a.ts', { mod: unenforced })).toEqual(
          ask('mode-plan'),
        );
        expect(bash('plan', 'npm test', { mod: enforced })).toEqual(ask('mode-plan'));
      });

      test('dontAsk mode: the mod can approve a call that nothing but the mode would deny', () => {
        expect(bash('dontAsk', 'npm test', { mod: enforced })).toEqual(allow('mod'));
        const rules = rulesOf(['ask', 'Bash(git push *)']);
        expect(bash('dontAsk', 'git push', { rules, mod: enforced })).toEqual(deny('ask-rule'));
      });
    });

    test('a tool that requires user interaction still prompts: a mod approval does not skip it', () => {
      expect(
        decision('default', 'AskUserQuestion', { questions: [] }, { mod: unenforced }),
      ).toEqual(ask('requires-user-interaction'));
      const marked = new Set(['mcp__forms__confirm']);
      expect(
        decision(
          'default',
          'mcp__forms__confirm',
          {},
          { mod: unenforced, requiresUserInteraction: marked },
        ),
      ).toEqual(ask('requires-user-interaction'));
    });

    spec(['permissions.behavior.Network paths.PreToolUse hooks'], () => {
      test('an MCP tool marked requiresUserInteraction, a network-path read and an organization connector tool prompt when a hook says "allow"', () => {
        const allowing = hook('allow');
        const marked = new Set(['mcp__forms__confirm']);
        expect(
          decision(
            'default',
            'mcp__forms__confirm',
            {},
            { ...allowing, requiresUserInteraction: marked },
          ),
        ).toEqual(ask('requires-user-interaction'));
        expect(onPath('default', 'Read', '/net/fileserver/notes.txt', allowing)).toEqual(
          ask('network-path'),
        );
        const connectors = new Set(['mcp__crm__lookup']);
        expect(
          decision(
            'default',
            'mcp__crm__lookup',
            {},
            { ...allowing, connectorToolsSetToAsk: connectors },
          ),
        ).toEqual(ask('organization-ask'));
      });
    });

    test('a deny rule from any scope is final: no allow of another scope, a hook or --allowedTools lifts it', () => {
      for (const denying of SOURCES) {
        for (const allowing of SOURCES.filter((source) => source.kind !== denying.kind)) {
          const rules = [
            parsed('Bash(aws s3 ls)', 'allow', allowing),
            parsed('Bash(aws *)', 'deny', denying),
          ];
          expect(bash('default', 'aws s3 ls', { rules })).toEqual(deny('deny-rule'));
          expect(bash('default', 'aws s3 ls', { rules, ...hook('allow') })).toEqual(
            deny('deny-rule'),
          );
        }
      }
    });
  },
);
