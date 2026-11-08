/**
 * permission-modes.md § "Which mode a session starts in" (the flag, `permissions.defaultMode`, the
 * built-in default; `auto` and `bypassPermissions` from `.claude/settings.json` or
 * `.claude/settings.local.json` "doesn't take effect"; the table of built-in modes: `disableAutoMode`,
 * `claude -p` or the Agent SDK, HIPAA, a terminal or VS Code; auto unavailable starts Manual), § "Start
 * in a different permission mode" (the table; the `manual` alias), § "Set plan mode as the default",
 * § "Tool calls denied in `claude -p` and Agent SDK runs", § "Skip all checks with bypassPermissions
 * mode" (the warning dialog, `--restricted`, root and `sudo`, the background session), § "Bypass
 * permissions ignored in a background session" (the notice, verbatim); settings-reference.md §
 * `permissions.defaultMode` (Scope: "For conversations the VS Code extension starts, Claude Code reads
 * only user, managed, and `--settings` values"; the six values and `manual`), § `disableAutoMode`,
 * § `skipDangerousModePermissionPrompt` ("Skip the confirmation dialog ... whether from
 * `--dangerously-skip-permissions` or from `defaultMode: "bypassPermissions"`"); permissions.md §
 * "Permission modes".
 */
import { expect, test } from 'bun:test';
import { layerOf, plain } from '../../support/settings-layers.ts';
import { headless, permissionsOf, startedIn, terminal } from '../../support/permissions-policy.ts';
import { spec } from '../../support/spec.ts';

const mode = (value: unknown) => ({ permissions: { defaultMode: value } });

spec('permissions.modes.Which mode a session starts in', () => {
  test('the flag comes first, then permissions.defaultMode, then the built-in default', () => {
    const policy = permissionsOf([['user', mode('acceptEdits')]]);
    expect(startedIn(policy, terminal({ permissionMode: 'plan' }))).toBe('plan');
    expect(startedIn(policy, terminal())).toBe('acceptEdits');
    expect(startedIn(permissionsOf([]), terminal())).toBe('auto');
  });

  test('--dangerously-skip-permissions is a flag too and beats a defaultMode', () => {
    const policy = permissionsOf([['user', mode('plan')]]);
    expect(startedIn(policy, terminal({ dangerouslySkipPermissions: true }))).toBe(
      'bypassPermissions',
    );
  });

  test('a project defaultMode "auto" is no value and the built-in default applies, not the user file\'s', () => {
    const policy = permissionsOf([
      ['project', mode('auto')],
      ['user', mode('plan')],
    ]);
    // The built-in default of a terminal is auto; with auto unavailable that is Manual.
    expect(startedIn(policy, terminal())).toBe('auto');
    expect(startedIn(policy, terminal({ autoAvailable: false }))).toBe('default');
  });

  test('a project or local defaultMode "bypassPermissions" does not take effect: the session starts in Manual', () => {
    for (const scope of ['project', 'local'] as const) {
      const policy = permissionsOf([
        [scope, mode('bypassPermissions')],
        ['user', mode('plan')],
      ]);
      expect(startedIn(policy, terminal())).toBe('default');
    }
  });

  test('the other values apply from any settings file', () => {
    for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
      for (const value of ['default', 'acceptEdits', 'plan', 'dontAsk']) {
        expect(startedIn(permissionsOf([[scope, mode(value)]]), terminal())).toBe(value);
      }
    }
  });

  test('auto and bypassPermissions apply from user, --settings and managed settings', () => {
    for (const scope of ['managed', 'flag', 'user'] as const) {
      expect(startedIn(permissionsOf([[scope, mode('auto')]]), terminal())).toBe('auto');
      expect(startedIn(permissionsOf([[scope, mode('bypassPermissions')]]), terminal())).toBe(
        'bypassPermissions',
      );
    }
  });

  test('a file that selects auto where auto is not available starts the session in Manual', () => {
    const policy = permissionsOf([['user', mode('auto')]]);
    expect(startedIn(policy, terminal({ autoAvailable: false }))).toBe('default');
    expect(startedIn(permissionsOf([]), terminal({ autoAvailable: false }))).toBe('default');
    expect(
      startedIn(permissionsOf([]), terminal({ permissionMode: 'auto', autoAvailable: false })),
    ).toBe('default');
  });

  test('the HIPAA configuration makes the built-in default Manual, and auto stays selectable', () => {
    expect(startedIn(permissionsOf([]), terminal({ hipaa: true }))).toBe('default');
    expect(startedIn(permissionsOf([]), terminal({ hipaa: true, permissionMode: 'auto' }))).toBe(
      'auto',
    );
    expect(startedIn(permissionsOf([['user', mode('auto')]]), terminal({ hipaa: true }))).toBe(
      'auto',
    );
  });

  test("a managed defaultMode outranks the user file's, which a lower file cannot override", () => {
    const policy = permissionsOf([
      ['managed', mode('plan')],
      ['user', mode('acceptEdits')],
    ]);
    expect(startedIn(policy, terminal())).toBe('plan');
  });

  test('the VS Code extension reads user, managed and --settings values only', () => {
    const vscode = { surface: 'vscode', autoAvailable: true } as const;
    expect(startedIn(permissionsOf([['project', mode('plan')]]), vscode)).toBe('auto');
    expect(startedIn(permissionsOf([['local', mode('plan')]]), vscode)).toBe('auto');
    for (const scope of ['user', 'managed', 'flag'] as const) {
      expect(startedIn(permissionsOf([[scope, mode('plan')]]), vscode)).toBe('plan');
    }
  });

  test('an unknown --permission-mode is refused', () => {
    expect(startedIn(permissionsOf([]), terminal({ permissionMode: 'yolo' }))).toStartWith(
      'refused:',
    );
  });
});

spec('permissions.modes.Which mode a session starts in.claude -p', () => {
  test('claude -p and the Agent SDK start in Manual (default) with no permission mode set', () => {
    expect(startedIn(permissionsOf([]), headless())).toBe('default');
  });

  test('a flag or a settings file still sets the mode there', () => {
    expect(startedIn(permissionsOf([]), headless({ permissionMode: 'auto' }))).toBe('auto');
    expect(startedIn(permissionsOf([['user', mode('acceptEdits')]]), headless())).toBe(
      'acceptEdits',
    );
  });
});

spec('permissions.modes.Which mode a session starts in.disableAutoMode', () => {
  test('any settings file that sets disableAutoMode to "disable" makes the built-in default Manual', () => {
    for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
      const policy = permissionsOf([[scope, { disableAutoMode: 'disable' }]]);
      expect(startedIn(policy, terminal())).toBe('default');
    }
  });

  test('a session that would start in auto from the flag, a settings file or the built-in default starts in default', () => {
    const policy = permissionsOf([['managed', { disableAutoMode: 'disable' }]]);
    expect(startedIn(policy, terminal({ permissionMode: 'auto' }))).toBe('default');
    const fromFile = permissionsOf([
      ['managed', { disableAutoMode: 'disable' }],
      ['user', mode('auto')],
    ]);
    expect(startedIn(fromFile, terminal())).toBe('default');
  });

  test('is accepted under permissions too, and removes auto from the mode cycle', () => {
    const policy = permissionsOf([['user', { permissions: { disableAutoMode: 'disable' } }]]);
    const start = policy.startingMode(terminal());
    expect(start.outcome === 'started' && [start.mode, start.autoAvailable]).toEqual([
      'default',
      false,
    ]);
  });
});

spec('permissions.setting.disableAutoMode', () => {
  test('is the string "disable" from any file; managed settings cannot be overridden by a lower file', () => {
    expect(permissionsOf([['managed', { disableAutoMode: 'disable' }]]).disableAutoMode).toBe(true);
    expect(permissionsOf([['user', { disableAutoMode: 'disable' }]]).disableAutoMode).toBe(true);
    expect(permissionsOf([]).disableAutoMode).toBe(false);
  });

  test('is accepted under permissions as permissions.disableAutoMode', () => {
    expect(
      permissionsOf([['project', { permissions: { disableAutoMode: 'disable' } }]]).disableAutoMode,
    ).toBe(true);
  });

  test('another value is dropped in a user file and read as "disable" in managed settings', () => {
    expect(plain(layerOf('user', { disableAutoMode: true }).settings)).toEqual({});
    expect(layerOf('managed', { disableAutoMode: true }).settings.disableAutoMode).toBe('disable');
  });

  test('removes auto from the Shift+Tab cycle', () => {
    const start = permissionsOf([['managed', { disableAutoMode: 'disable' }]]).startingMode(
      terminal(),
    );
    expect(start.outcome === 'started' && start.autoAvailable).toBe(false);
  });
});

/**
 * The id holds an apostrophe, which the id scan of `check:spec` (a quote-delimited literal) cannot read,
 * so it is a constant; `spec()` itself still refuses an id that is not a requirement.
 */
const ONE_SESSION =
  "permissions.modes.Start in a different permission mode.One session you're about to start";

spec(ONE_SESSION, () => {
  test('pass the mode as a flag: claude --permission-mode default', () => {
    expect(
      startedIn(permissionsOf([['user', mode('plan')]]), terminal({ permissionMode: 'default' })),
    ).toBe('default');
  });

  test('manual is an alias of default wherever you type the value', () => {
    expect(startedIn(permissionsOf([]), terminal({ permissionMode: 'manual' }))).toBe('default');
    expect(startedIn(permissionsOf([['user', mode('manual')]]), terminal())).toBe('default');
  });

  test('a managed defaultMode is a starting point, a flag still starts a session in another mode', () => {
    expect(
      startedIn(
        permissionsOf([['managed', mode('plan')]]),
        terminal({ permissionMode: 'acceptEdits' }),
      ),
    ).toBe('acceptEdits');
  });
});

spec('permissions.setting.permissions.defaultMode', () => {
  test('takes the six values and the alias manual, which is read as default', () => {
    for (const value of [
      'default',
      'acceptEdits',
      'plan',
      'auto',
      'dontAsk',
      'bypassPermissions',
    ]) {
      expect(plain(layerOf('user', mode(value)).settings.permissions?.defaultMode)).toBe(value);
    }
    expect(layerOf('user', mode('manual')).settings.permissions?.defaultMode).toBe('default');
  });

  test('is overridden for one session by --permission-mode and --dangerously-skip-permissions', () => {
    const policy = permissionsOf([['user', mode('acceptEdits')]]);
    expect(startedIn(policy, terminal())).toBe('acceptEdits');
    expect(startedIn(policy, terminal({ permissionMode: 'plan' }))).toBe('plan');
    expect(startedIn(policy, terminal({ dangerouslySkipPermissions: true }))).toBe(
      'bypassPermissions',
    );
  });

  test('unset: the built-in default of the surface applies', () => {
    expect(startedIn(permissionsOf([]), terminal())).toBe('auto');
    expect(startedIn(permissionsOf([]), headless())).toBe('default');
  });

  test('a value that is no mode is dropped in a user file and read as default in managed settings', () => {
    expect(plain(layerOf('user', mode('chaos')).settings.permissions)).toEqual({});
    expect(layerOf('managed', mode('chaos')).settings.permissions?.defaultMode).toBe('default');
  });

  test('the docs example, acceptEdits, starts a terminal session in acceptEdits', () => {
    expect(startedIn(permissionsOf([['user', mode('acceptEdits')]]), terminal())).toBe(
      'acceptEdits',
    );
  });
});

spec('permissions.modes.Set plan mode as the default', () => {
  test('defaultMode "plan" in the project\'s .claude/settings.json makes its terminal sessions start in plan mode', () => {
    expect(startedIn(permissionsOf([['project', mode('plan')]]), terminal())).toBe('plan');
  });

  test('a VS Code conversation does not read project settings for the starting mode', () => {
    expect(
      startedIn(permissionsOf([['project', mode('plan')]]), {
        surface: 'vscode',
        autoAvailable: true,
      }),
    ).toBe('auto');
  });
});

spec('permissions.modes.Tool calls denied in claude -p and Agent SDK runs', () => {
  test('a run with no permission mode set starts in Manual, which the SDK names default', () => {
    for (const policy of [permissionsOf([]), permissionsOf([['user', {}]])]) {
      expect(startedIn(policy, headless())).toBe('default');
    }
  });

  test('auto mode is the way to have calls reviewed instead: --permission-mode auto starts a run in auto', () => {
    expect(startedIn(permissionsOf([]), headless({ permissionMode: 'auto' }))).toBe('auto');
  });
});
