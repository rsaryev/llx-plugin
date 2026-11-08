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
];

/**
 * The docs' examples of a removal that is not critical, with the single-quoted script that binds
 * `$1` and a guarded expansion. They run without a prompt in bypassPermissions, where a critical
 * removal asks.
 */
const RUNS_IN_BYPASS: readonly string[] = [
  ...NOT_CRITICAL,
  'sh -c \'rm -rf "$1"/*\' _ {}',
  'rm -rf a/*',
  'cd logs && rm -rf a',
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

    for (const command of RUNS_IN_BYPASS) {
      test(`${command} is not, so bypassPermissions runs it without a prompt`, () => {
        expect(bash('bypassPermissions', command)).toEqual(allow('mode-bypass'));
      });
    }

    test('additional working directories count only for a glob under one of them', () => {
      const match = pathsWith({ additionalDirectories: ['/work/shared'] });
      expect(bash('bypassPermissions', 'rm -rf /work/shared/*', { match })).toEqual(
        ask('critical-path'),
      );
      expect(bash('bypassPermissions', 'rm -rf /work/shared', { match })).toEqual(
        allow('mode-bypass'),
      );
      // The same directory with no additional directory set is an ordinary path.
      expect(bash('bypassPermissions', 'rm -rf /work/shared/*')).toEqual(allow('mode-bypass'));
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

spec('permissions.mode.bypassPermissions', () => {
  describe('"Removals inside nested commands and inline scripts": positional parameters', () => {
    const FIND = 'find . -name \'*.tmp\' -exec sh -c "rm -rf \\"$1\\"/*" _ {} \\;';

    test('a double-quoted script is expanded by the invoking shell first: `$1` is empty, a removal from the root', () => {
      expect(bash('bypassPermissions', FIND)).toEqual(ask('critical-path'));
      expect(bash('bypassPermissions', 'sh -c "rm -rf \\"$1\\"/*" _ x')).toEqual(
        ask('critical-path'),
      );
    });

    test('a single-quoted script that binds `$1` to a real value is not flagged', () => {
      expect(bash('bypassPermissions', 'sh -c \'rm -rf "$1"/*\' _ {}')).toEqual(
        allow('mode-bypass'),
      );
      expect(bash('bypassPermissions', 'find . -exec sh -c \'rm -rf "$1"/*\' _ {} \\;')).toEqual(
        allow('mode-bypass'),
      );
    });

    test('a single-quoted script with no argument gives `$1` no value: flagged', () => {
      expect(bash('bypassPermissions', 'sh -c \'rm -rf "$1"/*\'')).toEqual(ask('critical-path'));
    });

    test('a variable the arguments do not bind is still flagged in a single-quoted script', () => {
      expect(bash('bypassPermissions', 'sh -c \'rm -rf "$DIR"/*\' _ {}')).toEqual(
        ask('critical-path'),
      );
    });

    test('a path typed into a `-c` script is found for a shell run by `-exec`, and not for a word that only names one', () => {
      expect(bash('bypassPermissions', "find . -exec sh -c 'rm -rf ~' _ {} \\;")).toEqual(
        ask('critical-path'),
      );
      // `sh` as an argument of another program is not a shell run.
      expect(bash('bypassPermissions', "echo sh -c 'rm -rf ~'")).toEqual(
        allow('read-only-command'),
      );
    });
  });

  describe('"Other targets that count as critical paths": the rows the table adds', () => {
    test('a glob after a cd: `cd logs && rm -rf a/*`', () => {
      expect(bash('bypassPermissions', 'cd logs && rm -rf a/*')).toEqual(ask('critical-path'));
      expect(bash('bypassPermissions', 'rm -rf a/*')).toEqual(allow('mode-bypass'));
      expect(bash('bypassPermissions', 'cd logs && rm -rf a')).toEqual(allow('mode-bypass'));
    });

    test('a target that is only backslashes counts on every platform', () => {
      expect(bash('bypassPermissions', 'rm -rf "\\\\"')).toEqual(ask('critical-path'));
      expect(bash('bypassPermissions', 'rm -rf \\\\')).toEqual(ask('critical-path'));
      expect(bash('bypassPermissions', 'rm -rf a\\b')).toEqual(allow('mode-bypass'));
    });

    test('a Windows path that names a volume by GUID counts', () => {
      expect(bash('bypassPermissions', "rm -rf '\\\\?\\Volume{GUID}\\work\\build'")).toEqual(
        ask('critical-path'),
      );
    });
  });

  describe('"Which paths are critical": Windows spellings', () => {
    const match = pathsWith({
      platform: 'windows',
      cwd: 'C:\\work\\app',
      primaryWorkingDirectory: 'C:\\work\\app',
      home: 'C:\\Users\\alice',
    });
    const run = (command: string) => bash('bypassPermissions', command, { match });

    test('`\\\\?\\C:\\` and `\\\\localhost\\C$` count as `C:\\`', () => {
      expect(run("rm -rf '\\\\?\\C:\\'")).toEqual(ask('critical-path'));
      expect(run("rm -rf '\\\\localhost\\C$'")).toEqual(ask('critical-path'));
      expect(run("rm -rf '\\\\?\\C:\\Windows'")).toEqual(ask('critical-path'));
    });

    test('the same spelling of a path below the working directory does not', () => {
      expect(run("rm -rf '\\\\?\\C:\\work\\app\\build'")).toEqual(allow('mode-bypass'));
    });

    test('the 8.3 short name of the home directory counts', () => {
      expect(run("rm -rf 'C:\\Users\\ALICE~1'")).toEqual(ask('critical-path'));
      expect(run("rm -rf 'C:\\Users\\alice\\build'")).toEqual(allow('mode-bypass'));
    });
  });

  describe('"The `Dangerous rm operation not ruled out` prompt": a command the shell may read differently', () => {
    test('a command that does not parse gets the critical-path outcome, bypassPermissions included', () => {
      expect(bash('bypassPermissions', 'ls && (')).toEqual(ask('critical-path'));
      expect(bash('bypassPermissions', 'echo "unclosed')).toEqual(ask('critical-path'));
    });

    test('no allow rule or hook allow approves it', () => {
      const rules = rulesOf(['allow', 'Bash']);
      expect(bash('default', 'ls && (', { rules, hook: { decision: 'allow' } })).toEqual(
        ask('critical-path'),
      );
    });

    test('dontAsk denies it, and a deny rule still denies it first', () => {
      expect(bash('dontAsk', 'ls && (')).toEqual(deny('critical-path'));
      expect(bash('default', 'ls && (', { rules: rulesOf(['deny', 'Bash(ls *)']) })).toEqual(
        deny('deny-rule'),
      );
    });
  });
});
