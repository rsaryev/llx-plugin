/**
 * permission-modes.md § Actions no mode auto-approves, § Critical paths (which paths are critical,
 * the table of other targets, nested commands and inline scripts) and § Critical-path removals in
 * each permission mode. Which `rm` and `rmdir` targets are recognized, and what each mode does with
 * one, asserted through `decide()` on the docs' own examples.
 */
import { describe, expect, test } from 'bun:test';
import { PERMISSION_MODES } from '../../src/protocol/permission-modes.ts';
import type { PermissionMode } from '../../src/protocol/official.ts';
import { allow, ask, bash, deny, pathsWith, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

/** The table of "Critical-path removals in each permission mode", at a terminal. */
const OUTCOME: { readonly [M in PermissionMode]: ReturnType<typeof ask> } = {
  default: ask('critical-path'),
  acceptEdits: ask('critical-path'),
  plan: ask('critical-path'),
  auto: ask('critical-path'),
  dontAsk: deny('critical-path'),
  bypassPermissions: ask('critical-path'),
};

const CRITICAL: readonly string[] = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /usr',
  'rm -rf /etc',
  'rmdir /data',
  'rm -rf /home/alice',
  'rm -rf /work/app',
  'rm -rf .',
  'rm -rf /work',
  'rm -rf "$DIR"/*',
  'rm -rf "$1"/*',
  'rm -rf "$TMPDIR/mnt"',
  'D=$(pwd); rm -rf "$D"',
  'D=$(git rev-parse --show-toplevel); rm -rf "$D"',
  'rm -rf "$(pwd)"',
  'rm -rf ~/$(cmd)',
  'rm -rf logs/*/*',
  'rm -rf logs/*/',
  '(rm -rf ~)',
  'echo "$(rm -rf ~)"',
  "bash -c 'rm -rf ~'",
  "sh -c 'rm -rf /'",
  'ls && rm -rf ~',
  'LANG=C rm -rf ~',
  'timeout 5 rm -rf /',
];

const NOT_CRITICAL: readonly string[] = [
  'rm -rf build',
  'rm -rf /work/app/build',
  'rm -rf "${DIR:?}"/*',
  'rmdir empty',
  'rm -f /work/app/a.txt',
  'rm -rf /work/shared',
];

for (const mode of PERMISSION_MODES) {
  spec(`permissions.mode.${mode}`, () => {
    describe(`"Critical-path removals in each permission mode": ${mode}`, () => {
      test('a recognized removal gets the outcome of the table', () => {
        expect(bash(mode, 'rm -rf ~')).toEqual(OUTCOME[mode]);
      });

      test('no allow rule approves one', () => {
        const rules = rulesOf(['allow', 'Bash(rm *)'], ['allow', 'Bash']);
        expect(bash(mode, 'rm -rf ~', { rules })).toEqual(OUTCOME[mode]);
      });

      test('no PreToolUse hook that returns allow approves one', () => {
        expect(bash(mode, 'rm -rf ~', { hook: { decision: 'allow' } })).toEqual(OUTCOME[mode]);
      });

      test('a deny rule still denies it', () => {
        expect(bash(mode, 'rm -rf ~', { rules: rulesOf(['deny', 'Bash(rm *)']) })).toEqual(
          deny('deny-rule'),
        );
      });
    });
  });
}

spec('permissions.mode.default', () => {
  describe('"Which paths are critical" and "Other targets that count as critical paths"', () => {
    for (const command of CRITICAL) {
      test(`${command} is a critical-path removal`, () => {
        expect(bash('default', command)).toEqual(ask('critical-path'));
      });
    }

    for (const command of NOT_CRITICAL) {
      test(`${command} is not`, () => {
        expect(bash('default', command)).not.toEqual(ask('critical-path'));
      });
    }

    test('additional working directories count only for a glob under one of them', () => {
      const match = pathsWith({ additionalDirectories: ['/work/shared'] });
      expect(bash('default', 'rm -rf /work/shared/*', { match })).toEqual(ask('critical-path'));
      expect(bash('default', 'rm -rf /work/shared', { match })).not.toEqual(ask('critical-path'));
    });

    test('the parents of an additional working directory count, for a glob under one', () => {
      const match = pathsWith({ additionalDirectories: ['/srv/data/shared'] });
      expect(bash('default', 'rm -rf /srv/data/*', { match })).toEqual(ask('critical-path'));
    });

    test('on Windows, drive roots and their top-level directories are critical', () => {
      const match = pathsWith({
        platform: 'windows',
        cwd: 'C:\\work\\app',
        primaryWorkingDirectory: 'C:\\work\\app',
        home: 'C:\\Users\\alice',
      });
      expect(bash('default', 'rm -rf C:\\', { match })).toEqual(ask('critical-path'));
      expect(bash('default', 'rm -rf C:\\Windows', { match })).toEqual(ask('critical-path'));
      expect(bash('default', 'rm -rf C:\\work\\app\\build', { match })).not.toEqual(
        ask('critical-path'),
      );
    });

    test('a removal in a command with an unrelated part is still found, whichever part it is in', () => {
      expect(bash('default', 'echo hi && rm -rf ~ && echo done')).toEqual(ask('critical-path'));
    });
  });
});

spec('permissions.mode.auto', () => {
  describe('"Time limits and denials in auto and bypassPermissions modes": away from a terminal', () => {
    test('auto mode denies a critical-path removal where there is no terminal prompt', () => {
      expect(bash('auto', 'rm -rf ~', { interactive: false })).toEqual(deny('critical-path'));
    });
  });
});

spec('permissions.mode.bypassPermissions', () => {
  describe('"Turn off the critical-path removal prompt in bypassPermissions mode"', () => {
    test('with CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS, a removal runs without a prompt', () => {
      expect(bash('bypassPermissions', 'rm -rf ~', { criticalPathPromptOff: true })).toEqual(
        allow('mode-bypass'),
      );
    });

    test('only in bypassPermissions mode itself, not in plan mode or any other', () => {
      for (const mode of ['default', 'acceptEdits', 'plan', 'auto'] as const) {
        expect(
          bash(mode, 'rm -rf ~', { criticalPathPromptOff: true, bypassAvailable: true }),
        ).toEqual(ask('critical-path'));
      }
    });
  });
});
