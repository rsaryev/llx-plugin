/**
 * settings-reference.md § `autoMode` (Scope User or managed; the object with `environment`, `allow`,
 * `soft_deny`, `hard_deny` and `classifyAllShell`; `"$defaults"`; "When more than one of those files
 * sets the same array, Claude Code concatenates the entries"), § `autoMode.classifyAllShell`, §
 * `useAutoModeDuringPlan` (Scope User, local, or managed; "A `false` in any of these files or in
 * `--settings` turns it off"), § `skipAutoPermissionPrompt` (User or managed), §
 * `skipDangerousModePermissionPrompt` (User, local, or managed); auto-mode-config.md § "Where the
 * classifier reads configuration" (`~/.claude/settings.json`, managed settings, `--settings`; never
 * project or local files; "can't remove entries that managed settings provide"); settings.md §
 * "Exceptions to managed settings precedence"; managed-settings.md § "Keys that fail closed" (the
 * `autoMode` block repaired per field, `soft_deny` and `hard_deny` withholding `allow` and
 * `environment`); permission-modes.md § "Analyze before you edit with plan mode".
 */
import { expect, test } from 'bun:test';
import { decide } from '../../../src/rules/index.ts';
import { sessionOf } from '../../support/permission-session.ts';
import { call } from '../../support/rule-context.ts';
import { issuesOf, layerOf, plain } from '../../support/settings-layers.ts';
import { permissionsOf, terminal } from '../../support/permissions-policy.ts';
import { spec } from '../../support/spec.ts';

const auto = (block: unknown) => ({ autoMode: block });

spec('permissions.setting.autoMode', () => {
  test('the docs example keeps the built-in soft_deny rules through "$defaults" and adds one', () => {
    const policy = permissionsOf([
      ['user', auto({ soft_deny: ['$defaults', 'Never run terraform apply'] })],
    ]);
    expect(policy.autoMode.lists.soft_deny).toEqual(['$defaults', 'Never run terraform apply']);
    expect(policy.autoMode.lists.allow).toEqual([]);
  });

  test('takes the four lists of prose rules', () => {
    const block = { environment: ['e'], allow: ['a'], soft_deny: ['s'], hard_deny: ['h'] };
    expect(permissionsOf([['managed', auto(block)]]).autoMode.lists).toEqual(block);
  });

  test('is read from user settings, managed settings and --settings, never from project or local files', () => {
    for (const scope of ['user', 'managed', 'flag'] as const) {
      expect(permissionsOf([[scope, auto({ allow: ['x'] })]]).autoMode.lists.allow).toEqual(['x']);
    }
    for (const scope of ['project', 'local'] as const) {
      expect(plain(layerOf(scope, auto({ allow: ['x'] })).settings)).toEqual({});
      expect(issuesOf(scope, auto({ allow: ['x'] }))).toHaveLength(1);
      expect(permissionsOf([[scope, auto({ allow: ['x'] })]]).autoMode.lists.allow).toEqual([]);
    }
  });

  test('entries of each file are concatenated: a developer cannot remove what managed settings provide', () => {
    const policy = permissionsOf([
      ['managed', auto({ soft_deny: ['org rule'] })],
      ['user', auto({ soft_deny: ['my rule'], allow: ['mine'] })],
    ]);
    expect(policy.autoMode.lists.soft_deny).toEqual(['org rule', 'my rule']);
    expect(policy.autoMode.lists.allow).toEqual(['mine']);
  });

  test('is repaired per field: an entry that is no text is dropped, the rest stay', () => {
    const read = layerOf('user', auto({ allow: ['a', 5], environment: ['e'] })).settings.autoMode;
    expect(plain(read)).toEqual({ allow: ['a'], environment: ['e'] });
  });

  test('a soft_deny or hard_deny list that cannot be read withholds allow and environment in managed settings', () => {
    const raw = auto({ soft_deny: 'oops', allow: ['a'], environment: ['e'], hard_deny: ['h'] });
    expect(plain(layerOf('managed', raw).settings.autoMode)).toEqual({ hard_deny: ['h'] });
    const found = issuesOf('managed', raw).map((issue) => issue.message);
    expect(
      found.some((text) => text.includes('autoMode.allow') && text.includes('autoMode.soft_deny')),
    ).toBe(true);
    expect(found.some((text) => text.includes('autoMode.environment'))).toBe(true);
  });

  test('a soft_deny that lost an invalid entry withholds them the same way', () => {
    const raw = auto({ hard_deny: ['h', 3], allow: ['a'] });
    expect(plain(layerOf('managed', raw).settings.autoMode)).toEqual({ hard_deny: ['h'] });
  });

  test('in a user file the same damage withholds nothing', () => {
    const raw = auto({ soft_deny: 'oops', allow: ['a'] });
    expect(plain(layerOf('user', raw).settings.autoMode)).toEqual({ allow: ['a'] });
  });
});

spec('permissions.setting.autoMode.classifyAllShell', () => {
  test('true sends every shell command through the classifier; the default is false', () => {
    expect(
      permissionsOf([['user', auto({ classifyAllShell: true })]]).autoMode.classifyAllShell,
    ).toBe(true);
    expect(
      permissionsOf([['user', auto({ classifyAllShell: false })]]).autoMode.classifyAllShell,
    ).toBe(false);
    expect(permissionsOf([]).autoMode.classifyAllShell).toBe(false);
  });

  test('a true from user settings or --settings holds even when a managed source sets false', () => {
    for (const scope of ['user', 'flag'] as const) {
      const policy = permissionsOf([
        ['managed', auto({ classifyAllShell: false })],
        [scope, auto({ classifyAllShell: true })],
      ]);
      expect(policy.autoMode.classifyAllShell).toBe(true);
    }
  });

  test('a managed true applies over a user false', () => {
    const policy = permissionsOf([
      ['managed', auto({ classifyAllShell: true })],
      ['user', auto({ classifyAllShell: false })],
    ]);
    expect(policy.autoMode.classifyAllShell).toBe(true);
  });

  test('is read wherever autoMode is read, not from a project file', () => {
    const policy = permissionsOf([['project', auto({ classifyAllShell: true })]]);
    expect(policy.autoMode.classifyAllShell).toBe(false);
  });

  test('unreadable in managed settings it reads as true; the text "false" reads as false with a notice', () => {
    expect(
      layerOf('managed', auto({ classifyAllShell: 'yes' })).settings.autoMode?.classifyAllShell,
    ).toBe(true);
    expect(
      layerOf('managed', auto({ classifyAllShell: 'false' })).settings.autoMode?.classifyAllShell,
    ).toBe(false);
    expect(issuesOf('managed', auto({ classifyAllShell: 'false' }))[0]?.message).toContain(
      'drop the quotes',
    );
    expect(plain(layerOf('user', auto({ classifyAllShell: 'yes' })).settings.autoMode)).toEqual({});
  });
});

spec('permissions.setting.useAutoModeDuringPlan', () => {
  const plan = (value: unknown) => ({ useAutoModeDuringPlan: value });

  test('is on by default and when set true', () => {
    expect(permissionsOf([]).autoMode.useAutoModeDuringPlan).toBe(true);
    expect(permissionsOf([['user', plan(true)]]).autoMode.useAutoModeDuringPlan).toBe(true);
  });

  test('a false in managed settings, --settings, user settings or the local file turns it off', () => {
    for (const scope of ['managed', 'flag', 'user', 'local'] as const) {
      expect(permissionsOf([[scope, plan(false)]]).autoMode.useAutoModeDuringPlan).toBe(false);
    }
  });

  test('a repository cannot turn it off for you: a false in .claude/settings.json is ignored', () => {
    expect(plain(layerOf('project', plan(false)).settings)).toEqual({});
    expect(permissionsOf([['project', plan(false)]]).autoMode.useAutoModeDuringPlan).toBe(true);
  });

  test('a false holds even when the winning managed source sets true', () => {
    const policy = permissionsOf([
      ['managed', plan(true)],
      ['user', plan(false)],
    ]);
    expect(policy.autoMode.useAutoModeDuringPlan).toBe(false);
  });

  test('with auto mode available the classifier reviews a plan-mode command; false asks instead', () => {
    const npm = call('Bash', { command: 'npm install' });
    const reviewed = decide(npm, {
      ...sessionOf(permissionsOf([]), terminal({ permissionMode: 'plan' })).context,
    });
    expect(reviewed).toEqual({ outcome: 'classify', reason: 'mode-plan' });
    const off = permissionsOf([['user', plan(false)]]);
    const asked = decide(npm, sessionOf(off, terminal({ permissionMode: 'plan' })).context);
    expect(asked).toEqual({ outcome: 'ask', reason: 'mode-plan' });
  });

  test('a command in the built-in read-only set runs in plan mode either way', () => {
    const off = permissionsOf([['user', plan(false)]]);
    const ls = call('Bash', { command: 'ls' });
    const decided = decide(ls, sessionOf(off, terminal({ permissionMode: 'plan' })).context);
    expect(decided.outcome).toBe('allow');
  });
});

spec('permissions.setting.skipAutoPermissionPrompt', () => {
  const skip = (value: unknown) => ({ skipAutoPermissionPrompt: value });

  test('true skips the one-time notice; false is the same as unset', () => {
    expect(permissionsOf([['user', skip(true)]]).autoMode.skipAutoPermissionPrompt).toBe(true);
    expect(permissionsOf([['user', skip(false)]]).autoMode.skipAutoPermissionPrompt).toBe(false);
    expect(permissionsOf([]).autoMode.skipAutoPermissionPrompt).toBe(false);
  });

  test('is read from user or managed settings; a repository cannot set it for you', () => {
    for (const scope of ['project', 'local', 'flag'] as const) {
      expect(plain(layerOf(scope, skip(true)).settings)).toEqual({});
    }
    expect(permissionsOf([['managed', skip(true)]]).autoMode.skipAutoPermissionPrompt).toBe(true);
  });

  test('another of these files that sets true wins over a false', () => {
    const policy = permissionsOf([
      ['managed', skip(false)],
      ['user', skip(true)],
    ]);
    expect(policy.autoMode.skipAutoPermissionPrompt).toBe(true);
  });
});

spec('permissions.setting.skipDangerousModePermissionPrompt', () => {
  const skip = (value: unknown) => ({ skipDangerousModePermissionPrompt: value });

  test('true skips the confirmation dialog before bypassPermissions; false is the same as unset', () => {
    expect(permissionsOf([['user', skip(true)]]).skipDangerousModePermissionPrompt).toBe(true);
    expect(permissionsOf([['user', skip(false)]]).skipDangerousModePermissionPrompt).toBe(false);
    expect(permissionsOf([]).skipDangerousModePermissionPrompt).toBe(false);
  });

  test('is read from user, local, managed and --settings; an untrusted repository cannot skip the dialog', () => {
    for (const scope of ['user', 'local', 'managed', 'flag'] as const) {
      expect(permissionsOf([[scope, skip(true)]]).skipDangerousModePermissionPrompt).toBe(true);
    }
    expect(plain(layerOf('project', skip(true)).settings)).toEqual({});
    expect(permissionsOf([['project', skip(true)]]).skipDangerousModePermissionPrompt).toBe(false);
  });

  test('another of these files that sets true wins over a false', () => {
    const policy = permissionsOf([
      ['local', skip(false)],
      ['user', skip(true)],
    ]);
    expect(policy.skipDangerousModePermissionPrompt).toBe(true);
  });

  test('applies to a start from the flag and from defaultMode "bypassPermissions" alike', () => {
    const policy = permissionsOf([
      ['user', { ...skip(true), permissions: { defaultMode: 'bypassPermissions' } }],
    ]);
    for (const input of [{ dangerouslySkipPermissions: true }, {}]) {
      const start = policy.startingMode({ surface: 'terminal', autoAvailable: true, ...input });
      expect(start.outcome === 'started' && [start.mode, start.bypassWarning]).toEqual([
        'bypassPermissions',
        false,
      ]);
    }
  });
});
