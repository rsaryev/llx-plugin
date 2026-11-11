/**
 * settings-reference.md § `permissions.denyInsteadOfPrompting` ("Claude Code denies a tool call that
 * would otherwise wait on a prompt, and the turn continues"; "A call goes ahead if an allow rule, your
 * permission mode, or auto mode's classifier approves it"; Scope "User or managed, and `--settings`. A
 * repository can't set it for you"; "`false`: the same as unset; calls are still denied if another of
 * these sources sets `true`"; "Default: unset, so a call that needs approval prompts you"); settings.md
 * § "Exceptions to managed settings precedence" (`true` from `~/.claude/settings.json` or `--settings`,
 * "Honored even when a managed source sets `false`"). Asserted through the policy, the merged settings
 * and `decide` over the session `startPermissions` builds.
 */
import { describe, expect, test } from 'bun:test';
import { decide } from '../../../src/rules/index.ts';
import { allow, deny } from '../../support/decide.ts';
import { sessionOf } from '../../support/permission-session.ts';
import { headless, permissionsOf, terminal } from '../../support/permissions-policy.ts';
import { call } from '../../support/rule-context.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const setting = (value: boolean) => ({ permissions: { denyInsteadOfPrompting: value } });
const view = (...layers: Parameters<typeof layerOf>[]) =>
  createGeneralView(layers.map(([scope, raw]) => layerOf(scope, raw)));
const KEY = 'permissions.denyInsteadOfPrompting';
const npmTest = call('Bash', { command: 'npm test' });

spec('permissions.setting.permissions.denyInsteadOfPrompting', () => {
  describe('scope: user or managed, and --settings', () => {
    test('a true from user, managed or --settings turns it on', () => {
      for (const scope of ['user', 'managed', 'flag'] as const) {
        expect(permissionsOf([[scope, setting(true)]]).denyInsteadOfPrompting).toBe(true);
      }
    });

    test("a repository can't set it: a project or local true is not read", () => {
      for (const scope of ['project', 'local'] as const) {
        expect(permissionsOf([[scope, setting(true)]]).denyInsteadOfPrompting).toBe(false);
        expect(view([scope, setting(true)]).get(KEY)).toBeUndefined();
      }
    });

    test('the merged settings never carry a repository value', () => {
      expect(view(['project', setting(true)]).merged()).toEqual({});
    });
  });

  describe('false is the same as unset', () => {
    test('unset, a call that needs approval prompts', () => {
      const { context } = sessionOf(permissionsOf([]), terminal({ permissionMode: 'default' }));
      expect(context.denyInsteadOfPrompting).toBeUndefined();
      expect(decide(npmTest, context)).toEqual({ outcome: 'ask', reason: 'default-prompt' });
    });

    test('a false alone prompts too', () => {
      const policy = permissionsOf([['user', setting(false)]]);
      expect(policy.denyInsteadOfPrompting).toBe(false);
      const { context } = sessionOf(policy, terminal({ permissionMode: 'default' }));
      expect(decide(npmTest, context).outcome).toBe('ask');
    });

    test('calls are still denied when another of these sources sets true, whichever is higher', () => {
      expect(
        permissionsOf([
          ['user', setting(true)],
          ['flag', setting(false)],
        ]).denyInsteadOfPrompting,
      ).toBe(true);
      expect(
        permissionsOf([
          ['managed', setting(true)],
          ['user', setting(false)],
        ]).denyInsteadOfPrompting,
      ).toBe(true);
    });
  });

  describe('true denies what would wait on a prompt, and the turn continues', () => {
    const on = permissionsOf([['user', setting(true)]]);

    test('at a terminal a would-be prompt is a denial with its own reason', () => {
      const { context } = sessionOf(on, terminal({ permissionMode: 'default' }));
      expect(context.denyInsteadOfPrompting).toBe(true);
      expect(decide(npmTest, context)).toEqual(deny('no-approval-surface'));
      expect(decide(call('Edit', { file_path: '/work/app/a.ts' }), context)).toEqual(
        deny('no-approval-surface'),
      );
    });

    test('in a -p run as well', () => {
      const { context } = sessionOf(on, headless({ permissionMode: 'default' }));
      expect(decide(npmTest, context)).toEqual(deny('no-approval-surface'));
    });

    test('an allow rule still approves the call', () => {
      const policy = permissionsOf([
        ['user', { permissions: { denyInsteadOfPrompting: true, allow: ['Bash(npm test)'] } }],
      ]);
      const { context } = sessionOf(policy, terminal({ permissionMode: 'default' }));
      expect(decide(npmTest, context)).toEqual(allow('allow-rule'));
    });

    test('the permission mode still approves the call', () => {
      const edit = call('Edit', { file_path: '/work/app/a.ts' });
      const accept = sessionOf(on, terminal({ permissionMode: 'acceptEdits' })).context;
      expect(decide(edit, accept)).toEqual(allow('accept-edits'));
      const bypass = sessionOf(on, terminal({ dangerouslySkipPermissions: true })).context;
      expect(decide(npmTest, bypass)).toEqual(allow('mode-bypass'));
    });

    test("auto mode's classifier still reviews the call: it is not denied first", () => {
      const { context } = sessionOf(on, terminal({ permissionMode: 'auto' }));
      expect(decide(npmTest, context)).toEqual({ outcome: 'classify', reason: 'mode-auto' });
    });

    test('a deny rule still denies with its own reason', () => {
      const policy = permissionsOf([
        ['user', { permissions: { denyInsteadOfPrompting: true, deny: ['Bash(npm *)'] } }],
      ]);
      const { context } = sessionOf(policy, terminal({ permissionMode: 'default' }));
      expect(decide(npmTest, context)).toEqual(deny('deny-rule'));
    });
  });
});

spec(
  'settingsMerge.settings.Exceptions to managed settings precedence.permissions.denyInsteadOfPrompting',
  () => {
    describe('`true` from ~/.claude/settings.json or --settings, even when a managed source sets `false`', () => {
      test('a user or --settings true wins over a managed false', () => {
        for (const scope of ['user', 'flag'] as const) {
          expect(view(['managed', setting(false)], [scope, setting(true)]).get(KEY)).toBe(true);
          expect(
            permissionsOf([
              ['managed', setting(false)],
              [scope, setting(true)],
            ]).denyInsteadOfPrompting,
          ).toBe(true);
        }
      });

      test('a project or local true does not beat a managed false', () => {
        for (const scope of ['project', 'local'] as const) {
          expect(view(['managed', setting(false)], [scope, setting(true)]).get(KEY)).toBe(false);
        }
      });

      test('the merged settings carry the value the exception decided', () => {
        const merged = view(
          ['managed', setting(false)],
          ['user', setting(true)],
          ['project', setting(false)],
        ).merged();
        expect(merged.permissions).toEqual({ denyInsteadOfPrompting: true });
      });
    });
  },
);
