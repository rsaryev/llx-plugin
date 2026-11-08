/**
 * permission-modes.md § "Skip all checks with bypassPermissions mode" (enabling it at launch; the
 * warning dialog; `--restricted`; root and `sudo` with the message verbatim; the background session),
 * § "Bypass permissions ignored in a background session" (the notice, verbatim); settings-reference.md
 * § `skipDangerousModePermissionPrompt` ("Skip the confirmation dialog ... whether from
 * `--dangerously-skip-permissions` or from `defaultMode: "bypassPermissions"`").
 */
import { describe, expect, test } from 'bun:test';
import { BYPASS_AS_ROOT, BYPASS_IGNORED_NOTICE } from '../../../src/settings/index.ts';
import { headless, permissionsOf, startedIn, terminal } from '../../support/permissions-policy.ts';
import { spec } from '../../support/spec.ts';

const mode = (value: unknown) => ({ permissions: { defaultMode: value } });
const bg = (overrides = {}) => terminal({ background: true, ...overrides });

describe('the bypass warning, --restricted and root', () => {
  spec('permissions.modes.Skip all checks with bypassPermissions mode', () => {
    test('enabled at launch with the flag or permissions.defaultMode in user settings', () => {
      expect(startedIn(permissionsOf([]), terminal({ permissionMode: 'bypassPermissions' }))).toBe(
        'bypassPermissions',
      );
      expect(startedIn(permissionsOf([['user', mode('bypassPermissions')]]), terminal())).toBe(
        'bypassPermissions',
      );
    });

    test('a session started without it cannot enter it later: the mode cycle holds it only when enabled', () => {
      const without = permissionsOf([]).startingMode(terminal({ permissionMode: 'default' }));
      expect(without.outcome === 'started' && without.bypassAvailable).toBe(false);
      const allowed = permissionsOf([]).startingMode(
        terminal({ allowDangerouslySkipPermissions: true }),
      );
      expect(allowed.outcome === 'started' && [allowed.mode, allowed.bypassAvailable]).toEqual([
        'auto',
        true,
      ]);
    });

    test('an interactive start shows the warning dialog unless skipDangerousModePermissionPrompt is true', () => {
      const flagged = terminal({ dangerouslySkipPermissions: true });
      const shown = permissionsOf([]).startingMode(flagged);
      expect(shown.outcome === 'started' && shown.bypassWarning).toBe(true);
      const skipped = permissionsOf([
        ['user', { skipDangerousModePermissionPrompt: true }],
      ]).startingMode(flagged);
      expect(skipped.outcome === 'started' && skipped.bypassWarning).toBe(false);
    });

    test('in non-interactive mode no dialog is shown', () => {
      const start = permissionsOf([]).startingMode(headless({ dangerouslySkipPermissions: true }));
      expect(start.outcome === 'started' && [start.mode, start.bypassWarning]).toEqual([
        'bypassPermissions',
        false,
      ]);
    });

    test('--restricted refuses bypassPermissions', () => {
      const start = permissionsOf([]).startingMode(
        terminal({ dangerouslySkipPermissions: true, restricted: true }),
      );
      expect(start.outcome).toBe('refused');
      expect(startedIn(permissionsOf([]), terminal({ restricted: true }))).toBe('auto');
    });

    test('root or sudo outside a recognized sandbox refuses it with the documented message', () => {
      const start = permissionsOf([]).startingMode(
        terminal({ dangerouslySkipPermissions: true, privileged: true }),
      );
      expect(start.outcome === 'refused' && start.reason).toBe(BYPASS_AS_ROOT);
      expect(BYPASS_AS_ROOT).toBe(
        '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons',
      );
    });
  });
});

spec('permissions.modes.Bypass permissions ignored in a background session', () => {
  const asked = { permissionMode: 'bypassPermissions' } as const;

  test('an acceptance in user or managed settings is honored', () => {
    for (const scope of ['user', 'managed'] as const) {
      const policy = permissionsOf([[scope, { skipDangerousModePermissionPrompt: true }]]);
      expect(startedIn(policy, bg(asked))).toBe('bypassPermissions');
    }
  });

  test('with no acceptance recorded the request is refused', () => {
    expect(startedIn(permissionsOf([]), bg(asked))).toStartWith('refused:');
  });

  test('an acceptance only in .claude/settings.local.json ignores the request: Manual mode and the documented notice', () => {
    const policy = permissionsOf([['local', { skipDangerousModePermissionPrompt: true }]]);
    const start = policy.startingMode(bg(asked));
    expect(start.outcome === 'started' && start.mode).toBe('default');
    expect(start.outcome === 'started' && start.issues.map((issue) => issue.message)).toEqual([
      BYPASS_IGNORED_NOTICE,
    ]);
    expect(BYPASS_IGNORED_NOTICE).toBe(
      'Bypass permissions was requested at launch and ignored · if that was you, ~/.claude/settings.json needs "skipDangerousModePermissionPrompt": true',
    );
  });

  test('--dangerously-skip-permissions is ignored the same way', () => {
    const policy = permissionsOf([['local', { skipDangerousModePermissionPrompt: true }]]);
    expect(startedIn(policy, bg({ dangerouslySkipPermissions: true }))).toBe('default');
  });

  test('--allow-dangerously-skip-permissions ignored leaves bypassPermissions out of the Shift+Tab cycle', () => {
    const policy = permissionsOf([['local', { skipDangerousModePermissionPrompt: true }]]);
    const start = policy.startingMode(bg({ allowDangerouslySkipPermissions: true }));
    expect(start.outcome === 'started' && [start.mode, start.bypassAvailable]).toEqual([
      'auto',
      false,
    ]);
    const honored = permissionsOf([
      ['user', { skipDangerousModePermissionPrompt: true }],
    ]).startingMode(bg({ allowDangerouslySkipPermissions: true }));
    expect(honored.outcome === 'started' && honored.bypassAvailable).toBe(true);
  });

  test('an interactive session counts the key in .claude/settings.local.json as the acceptance', () => {
    const policy = permissionsOf([['local', { skipDangerousModePermissionPrompt: true }]]);
    const start = policy.startingMode(terminal(asked));
    expect(start.outcome === 'started' && [start.mode, start.bypassWarning]).toEqual([
      'bypassPermissions',
      false,
    ]);
  });
});
