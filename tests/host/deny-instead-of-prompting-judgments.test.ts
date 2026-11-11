/**
 * Judgments of `permissions.denyInsteadOfPrompting` (spec/judgments.md): the reason a denial names
 * where a `-p` run also cannot prompt, a mod's approval once the callback is not asked, the denials a
 * `PermissionRequest` hook may answer, and the parent settings, which are not read for the key. Not
 * under spec(): the docs leave these open.
 */
import { describe, expect, test } from 'bun:test';
import { permissionRequestDecision } from '../../src/index.ts';
import { decide } from '../../src/rules/index.ts';
import { bash, deny } from '../support/decide.ts';
import { sessionOf } from '../support/permission-session.ts';
import { headless, permissionsOf } from '../support/permissions-policy.ts';
import { call } from '../support/rule-context.ts';

const on = permissionsOf([['user', { permissions: { denyInsteadOfPrompting: true } }]]);
const npmTest = call('Bash', { command: 'npm test' });
const allowed = { effects: { permissionRequest: { behavior: 'allow' as const } } };

describe('denyInsteadOfPrompting judgments', () => {
  test("in a -p run that also cannot prompt, the denial names the setting's reason", () => {
    const { context } = sessionOf(on, headless({ permissionMode: 'default' }));
    expect(context.cannotPrompt).toBe(true);
    expect(decide(npmTest, context)).toEqual(deny('no-approval-surface'));
  });

  test("an enforced mod's approval lifts the denial once the callback is not asked", () => {
    const mod = { approved: true, policyEnforced: true };
    const { context } = sessionOf(on, headless({ permissionMode: 'default' }), {
      permissionCallback: true,
    });
    expect(decide(npmTest, { ...context, mod })).toEqual({ outcome: 'allow', reason: 'mod' });
    // With the callback asked, the same mod cannot bypass it.
    expect(bash('default', 'npm test', { permissionCallback: true, mod }).outcome).toBe('ask');
  });

  test("a PermissionRequest hook answers a -p run's denial too, and nothing a mode denied", () => {
    expect(permissionRequestDecision(deny('prompt-unavailable'), allowed).outcome).toBe('allow');
    expect(permissionRequestDecision(deny('mode-dontask'), allowed)).toEqual(deny('mode-dontask'));
    expect(
      permissionRequestDecision({ outcome: 'classify', reason: 'mode-auto' }, allowed).outcome,
    ).toBe('classify');
  });

  test('the parent settings of an embedding host are not read for the key', () => {
    const parent = permissionsOf([['parent', { permissions: { denyInsteadOfPrompting: true } }]], {
      parentMerge: true,
    });
    expect(parent.denyInsteadOfPrompting).toBe(false);
  });
});
