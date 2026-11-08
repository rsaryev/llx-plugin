/**
 * hooks.md § "PermissionRequest decision control" (the field table and the `allow` example) and
 * § "Permission update entries" (`updatedPermissions` carries the same entries). Granting or
 * denying the request, and re-evaluating deny and ask rules against it, are the host's: what the
 * kit proves is the decision object it accepts, the fields each behavior may carry, and the merge.
 */
import { expect, test } from 'bun:test';
import { parseHookOutput } from '../../../src/hooks/index.ts';
import type { PermissionUpdate } from '../../../src/protocol/official.ts';
import { merged, specific } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

const decision = (body: object) => specific('PermissionRequest', { decision: body });
const merge = (...hooks: readonly unknown[]) => merged('PermissionRequest', hooks);

const addRule: PermissionUpdate = {
  type: 'addRules',
  rules: [{ toolName: 'Bash', ruleContent: 'npm run lint' }],
  behavior: 'allow',
  destination: 'session',
};

spec('hooks.output.PermissionRequest.behavior', () => {
  test('the documented allow: the request is granted and the permission flow is not blocked', () => {
    const outcome = merge(
      decision({ behavior: 'allow', updatedInput: { command: 'npm run lint' } }),
    );
    expect(outcome.effects.permissionRequest).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'npm run lint' },
    });
    expect(outcome.block).toBeUndefined();
  });

  test('deny denies the request: the action is held back', () => {
    const outcome = merge(decision({ behavior: 'deny', message: 'not on a Friday' }));
    expect(outcome.effects.permissionRequest).toEqual({
      behavior: 'deny',
      message: 'not on a Friday',
    });
    expect(outcome.block).toMatchObject({ via: 'decision', reason: 'not on a Friday' });
  });

  test('a behavior other than allow and deny, and a missing decision object, fail validation', () => {
    expect(parseHookOutput('PermissionRequest', decision({ behavior: 'ask' })).failure).toContain(
      'behavior',
    );
    expect(
      parseHookOutput('PermissionRequest', specific('PermissionRequest', {})).failure,
    ).toContain('decision');
  });

  test('no output leaves the permission flow unchanged', () => {
    const outcome = merge({}, undefined);
    expect(outcome.effects.permissionRequest).toBeUndefined();
    expect(outcome.block).toBeUndefined();
  });

  test('judgment: when hooks disagree a deny wins over an allow, whatever the order', () => {
    const allow = decision({ behavior: 'allow' });
    const deny = decision({ behavior: 'deny', message: 'no' });
    for (const hooks of [
      [allow, deny],
      [deny, allow],
    ]) {
      expect(merge(...hooks).effects.permissionRequest?.behavior).toBe('deny');
    }
  });

  test('a Monitor call that reached the hook through a Bash matcher: its allow does not apply, its deny does', () => {
    const allow = { json: decision({ behavior: 'allow', updatedInput: { a: 1 } }), ignored: true };
    expect(merge(allow).effects).toEqual({});
    const deny = { json: decision({ behavior: 'deny' }), ignored: true };
    expect(merge(deny).effects.permissionRequest?.behavior).toBe('deny');
  });
});

spec('hooks.output.PermissionRequest.updatedInput', () => {
  test('for allow only: replaces the whole input object', () => {
    const outcome = merge(
      decision({ behavior: 'allow', updatedInput: { file_path: '/safe/a.ts' } }),
    );
    expect(outcome.effects.permissionRequest).toEqual({
      behavior: 'allow',
      updatedInput: { file_path: '/safe/a.ts' },
    });
  });

  test('on a deny it is dropped', () => {
    const outcome = merge(decision({ behavior: 'deny', updatedInput: { a: 1 } }));
    expect(outcome.effects.permissionRequest).toEqual({ behavior: 'deny' });
  });

  test('judgment: of several allowing hooks the last updatedInput wins', () => {
    const outcome = merge(
      decision({ behavior: 'allow', updatedInput: { n: 1 } }),
      decision({ behavior: 'allow', updatedInput: { n: 2 } }),
      decision({ behavior: 'allow' }),
    );
    expect(outcome.effects.permissionRequest).toEqual({
      behavior: 'allow',
      updatedInput: { n: 2 },
    });
  });

  test('a value that is not an object fails validation', () => {
    expect(
      parseHookOutput('PermissionRequest', decision({ behavior: 'allow', updatedInput: 'x' }))
        .failure,
    ).toContain('updatedInput');
  });
});

spec('hooks.output.PermissionRequest.updatedPermissions', () => {
  test('for allow only: the entries are handed on to apply', () => {
    const outcome = merge(decision({ behavior: 'allow', updatedPermissions: [addRule] }));
    expect(outcome.effects.permissionRequest).toEqual({
      behavior: 'allow',
      updatedPermissions: [addRule],
    });
  });

  test('on a deny they are dropped', () => {
    const outcome = merge(decision({ behavior: 'deny', updatedPermissions: [addRule] }));
    expect(outcome.effects.permissionRequest).toEqual({ behavior: 'deny' });
  });

  test('judgment: the entries of several allowing hooks are concatenated in registry order', () => {
    const second: PermissionUpdate = {
      type: 'setMode',
      mode: 'acceptEdits',
      destination: 'session',
    };
    const outcome = merge(
      decision({ behavior: 'allow', updatedPermissions: [addRule] }),
      decision({ behavior: 'allow', updatedPermissions: [second] }),
    );
    expect(outcome.effects.permissionRequest).toEqual({
      behavior: 'allow',
      updatedPermissions: [addRule, second],
    });
  });

  test('an invalid entry fails the whole output, naming it', () => {
    const failure = parseHookOutput(
      'PermissionRequest',
      decision({
        behavior: 'allow',
        updatedPermissions: [{ type: 'addRules', behavior: 'allow' }],
      }),
    ).failure;
    expect(failure).toContain('updatedPermissions[0]');
  });
});

spec('hooks.output.PermissionRequest.message', () => {
  test('for deny only: tells Claude why the permission was denied', () => {
    const outcome = merge(decision({ behavior: 'deny', message: 'Writes to prod are denied' }));
    expect(outcome.effects.permissionRequest).toEqual({
      behavior: 'deny',
      message: 'Writes to prod are denied',
    });
    expect(outcome.block?.reason).toBe('Writes to prod are denied');
  });

  test('on an allow it is dropped', () => {
    expect(merge(decision({ behavior: 'allow', message: 'hi' })).effects.permissionRequest).toEqual(
      { behavior: 'allow' },
    );
  });

  test('the first denying hook that has one gives it', () => {
    const outcome = merge(
      decision({ behavior: 'deny' }),
      decision({ behavior: 'deny', message: 'second' }),
    );
    expect(outcome.effects.permissionRequest).toEqual({ behavior: 'deny', message: 'second' });
  });
});

spec('hooks.output.PermissionRequest.interrupt', () => {
  test('for deny only: true stops Claude', () => {
    const outcome = merge(decision({ behavior: 'deny', interrupt: true }));
    expect(outcome.effects.permissionRequest).toEqual({ behavior: 'deny', interrupt: true });
  });

  test('false and absent leave Claude going; on an allow it is dropped', () => {
    expect(
      merge(decision({ behavior: 'deny', interrupt: false })).effects.permissionRequest,
    ).toEqual({ behavior: 'deny' });
    expect(
      merge(decision({ behavior: 'allow', interrupt: true })).effects.permissionRequest,
    ).toEqual({ behavior: 'allow' });
  });

  test('judgment: it counts when any denying hook sets it', () => {
    const outcome = merge(
      decision({ behavior: 'deny' }),
      decision({ behavior: 'deny', interrupt: true }),
    );
    expect(outcome.effects.permissionRequest).toMatchObject({ interrupt: true });
  });
});
