/**
 * settings-reference.md § "What else `denyInsteadOfPrompting` stops", "Permission hosts" ("Claude
 * Code doesn't ask your `canUseTool` callback or `--permission-prompt-tool`. To approve calls from
 * code, answer from a `PermissionRequest` hook. Some calls are denied before any hook is asked, such
 * as a critical-path removal in `auto` mode that no ask rule covers"). Asserted through the session
 * `startPermissions` builds, `decide` and `permissionRequestDecision`.
 */
import { describe, expect, test } from 'bun:test';
import { permissionRequestDecision } from '../../src/index.ts';
import { decide, type Decision } from '../../src/rules/index.ts';
import { deny } from '../support/decide.ts';
import { sessionOf } from '../support/permission-session.ts';
import { headless, permissionsOf, terminal } from '../support/permissions-policy.ts';
import { call } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const on = (permissions: Record<string, unknown> = {}) =>
  permissionsOf([['user', { permissions: { denyInsteadOfPrompting: true, ...permissions } }]]);
const npmTest = call('Bash', { command: 'npm test' });
const removal = call('Bash', { command: 'rm -rf /' });
const hookAnswer = (behavior: 'allow' | 'deny') => ({
  effects: { permissionRequest: { behavior } },
});
const noAnswer = { effects: {} };

spec('permissions.reference.What else denyInsteadOfPrompting stops.Permission hosts', () => {
  describe('the canUseTool callback and --permission-prompt-tool are not asked', () => {
    test('a run with a permission callback denies what would prompt instead of asking it', () => {
      const { context } = sessionOf(on(), headless({ permissionMode: 'default' }), {
        permissionCallback: true,
      });
      expect(context.permissionCallback).toBeUndefined();
      expect(decide(npmTest, context)).toEqual(deny('no-approval-surface'));
    });

    test('without the setting the same callback is asked', () => {
      const { context } = sessionOf(permissionsOf([]), headless({ permissionMode: 'default' }), {
        permissionCallback: true,
      });
      expect(decide(npmTest, context)).toEqual({ outcome: 'ask', reason: 'default-prompt' });
    });
  });

  describe('a PermissionRequest hook still answers', () => {
    const { context } = sessionOf(on(), terminal({ permissionMode: 'default' }));
    const denied = decide(npmTest, context);

    test("the hook's allow runs the call", () => {
      expect(permissionRequestDecision(denied, hookAnswer('allow'))).toEqual({
        outcome: 'allow',
        reason: 'hook',
      });
    });

    test("the hook's deny denies it, and no answer leaves the denial", () => {
      expect(permissionRequestDecision(denied, hookAnswer('deny'))).toEqual(deny('hook'));
      expect(permissionRequestDecision(denied, noAnswer)).toEqual(denied);
    });

    test('a call an ask rule covers is answered by the hook as well', () => {
      const ruled = sessionOf(
        on({ ask: ['Bash(npm test)'] }),
        terminal({ permissionMode: 'default' }),
      ).context;
      const asked = decide(npmTest, ruled);
      expect(asked).toEqual(deny('no-approval-surface'));
      expect(permissionRequestDecision(asked, hookAnswer('allow')).outcome).toBe('allow');
    });
  });

  describe('some calls are denied before any hook is asked', () => {
    test('a critical-path removal in auto mode that no ask rule covers, even at a terminal', () => {
      const { context } = sessionOf(on(), terminal({ permissionMode: 'auto' }));
      const removed: Decision = decide(removal, context);
      expect(removed).toEqual(deny('critical-path'));
      expect(permissionRequestDecision(removed, hookAnswer('allow'))).toEqual(removed);
    });

    test('a deny rule is never lifted by the hook', () => {
      const { context } = sessionOf(
        on({ deny: ['Bash(npm *)'] }),
        terminal({ permissionMode: 'default' }),
      );
      const ruled = decide(npmTest, context);
      expect(permissionRequestDecision(ruled, hookAnswer('allow'))).toEqual(deny('deny-rule'));
    });

    test('an ask rule over the removal makes it a would-be prompt again, which the hook answers', () => {
      const { context } = sessionOf(
        on({ ask: ['Bash(rm *)'] }),
        terminal({ permissionMode: 'auto' }),
      );
      const asked = decide(removal, context);
      expect(asked).toEqual(deny('no-approval-surface'));
      expect(permissionRequestDecision(asked, hookAnswer('allow')).outcome).toBe('allow');
    });
  });
});
