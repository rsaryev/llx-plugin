/**
 * What the kit decides where the docs are silent about the permission settings (spec/judgments.md).
 * Each test is one judgment, outside spec() because a judgment is never compatibility: the wording of
 * the reports, the keys a policy tier fails closed on beyond the one the docs name, the scopes the
 * docs leave open and the choices of the start of a session.
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, layerOf, plain } from '../../support/settings-layers.ts';
import { permissionsOf, startedIn, terminal } from '../../support/permissions-policy.ts';

describe('the permissions block of a file that is not the policy tier', () => {
  test('an entry of a rule list that is no text is dropped with a warning in every source, the managed one included', () => {
    for (const scope of ['managed', 'user'] as const) {
      const raw = { permissions: { deny: ['Bash(a)', 7] } };
      expect(plain(layerOf(scope, raw).settings.permissions)).toEqual({ deny: ['Bash(a)'] });
      expect(issuesOf(scope, raw)).toHaveLength(1);
    }
  });

  test('a list that is no list is dropped with a warning naming it', () => {
    const [found] = issuesOf('user', { permissions: { allow: 'Bash' } });
    expect(found?.path).toBe('user:permissions.allow');
    expect(found?.message).toContain('must be a list');
  });

  test('a lock or a mode that is invalid is dropped with a warning that names the field', () => {
    const [lock] = issuesOf('user', { permissions: { disableAutoMode: true } });
    expect(lock?.path).toBe('user:permissions.disableAutoMode');
    const [defaultMode] = issuesOf('user', { permissions: { defaultMode: 'chaos' } });
    expect(defaultMode?.message).toContain('not a mode');
  });
});

describe('the policy tier fails closed on the Booleans the docs only imply', () => {
  test.each([
    'useAutoModeDuringPlan',
    'skipAutoPermissionPrompt',
    'skipDangerousModePermissionPrompt',
  ])(
    'an unreadable %s in managed settings reads as false, its restrictive value, and says so',
    (key) => {
      expect(layerOf('managed', { [key]: 'maybe' }).settings[key]).toBe(false);
      expect(issuesOf('managed', { [key]: 'maybe' })[0]?.message).toContain(
        'was present but invalid',
      );
      expect(layerOf('managed', { [key]: 'true' }).settings[key]).toBe(true);
    },
  );
});

describe('where a key is read from', () => {
  test('autoMode is read from --settings too: auto-mode-config.md lists it, the settings index says "User or managed"', () => {
    expect(permissionsOf([['flag', { autoMode: { allow: ['x'] } }]]).autoMode.lists.allow).toEqual([
      'x',
    ]);
  });

  test('the parent settings of an embedding host carry permissions, but not disableAutoMode', () => {
    expect(plain(layerOf('parent', { permissions: { deny: ['Bash'] } }).settings)).toEqual({
      permissions: { deny: ['Bash'] },
    });
    expect(plain(layerOf('parent', { disableAutoMode: 'disable' }).settings)).toEqual({});
  });
});

describe('the start of a session', () => {
  test('a defaultMode of bypassPermissions locked by disableBypassPermissionsMode starts in Manual', () => {
    const policy = permissionsOf([
      ['user', { permissions: { defaultMode: 'bypassPermissions' } }],
      ['managed', { permissions: { disableBypassPermissionsMode: 'disable' } }],
    ]);
    expect(startedIn(policy, terminal())).toBe('default');
  });

  test('a defaultMode of bypassPermissions in a background session needs the acceptance like the flag does', () => {
    const policy = permissionsOf([['user', { permissions: { defaultMode: 'bypassPermissions' } }]]);
    expect(startedIn(policy, terminal({ background: true }))).toStartWith('refused:');
  });

  test('--allow-dangerously-skip-permissions with no acceptance is ignored, not refused', () => {
    const start = permissionsOf([]).startingMode(
      terminal({ background: true, allowDangerouslySkipPermissions: true }),
    );
    expect(start.outcome).toBe('started');
  });

  test('an unknown --permission-mode value is refused with the value named', () => {
    const start = permissionsOf([]).startingMode(terminal({ permissionMode: 'yolo' }));
    expect(start.outcome === 'refused' && start.reason).toBe('"yolo" is not a permission mode');
  });

  test('a start the lock refuses names the key', () => {
    const policy = permissionsOf([
      ['user', { permissions: { disableBypassPermissionsMode: 'disable' } }],
    ]);
    const start = policy.startingMode(terminal({ dangerouslySkipPermissions: true }));
    expect(start.outcome === 'refused' && start.reason).toContain('disableBypassPermissionsMode');
  });
});

describe('the lock on permission rules', () => {
  test('leaves the additionalDirectories of user, project and local files in place', () => {
    const policy = permissionsOf([
      ['managed', { allowManagedPermissionRulesOnly: true }],
      ['user', { permissions: { additionalDirectories: ['/data'] } }],
    ]);
    expect(policy.additionalDirectories.map((each) => each.path)).toEqual(['/data']);
  });

  test('a local file outside git counts as untracked unless the host says it is tracked', () => {
    const local = { permissions: { allow: ['Bash(ls)'] } };
    const rules = (tracked?: boolean) =>
      permissionsOf([['local', local]], {
        isFolderTrusted: () => false,
        ...(tracked === undefined ? {} : { localSettingsTracked: tracked }),
      }).rules;
    expect(rules()).toHaveLength(1);
    expect(rules(true)).toHaveLength(0);
  });
});
