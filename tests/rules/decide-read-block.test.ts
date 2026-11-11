/**
 * permission-modes.md § Actions no mode auto-approves and settings-reference.md §
 * `permissions.blockReadsOutsideWorkingDirectories` (the read block on Bash commands);
 * permission-modes.md § acceptEdits ("Each path also goes through the symlink check" for shell
 * commands). Asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionMode } from '../../src/protocol/official.ts';
import { PERMISSION_MODES } from '../../src/protocol/permission-modes.ts';
import { decide, type PreparedCall } from '../../src/rules/index.ts';
import { allow, ask, baseContext, bash, deny, pathsWith, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const AUTO = { autoAvailable: true };
const READS = { blockReadsOutsideWorkingDirectories: true };

/** A shell command a host prepared, with the real paths its symlinks lead to. */
const prepared = (mode: PermissionMode, command: string, resolvedPaths: readonly string[]) =>
  decide(
    { toolName: 'Bash', input: { command }, resolvedPaths } satisfies PreparedCall,
    baseContext(mode, AUTO),
  );

for (const mode of PERMISSION_MODES) {
  spec(`permissions.mode.${mode}`, () => {
    describe(`the read block on Bash in ${mode} mode`, () => {
      const PROMPT =
        mode === 'dontAsk' ? deny('outside-working-directory') : ask('outside-working-directory');

      test('a file-reading command that names a path outside the working directories prompts, bypassPermissions included', () => {
        expect(bash(mode, 'cat /etc/passwd', { ...READS, ...AUTO })).toEqual(PROMPT);
        expect(bash(mode, 'grep -r x ~/notes', { ...READS, ...AUTO })).toEqual(PROMPT);
        expect(bash(mode, 'ls /etc/*', { ...READS, ...AUTO })).toEqual(PROMPT);
      });

      test('a command the parser cannot trace prompts even when it names no outside path', () => {
        for (const command of [
          'cd a && cd b && ls',
          '(ls)',
          'echo "$(ls)"',
          'cd packages && git status',
        ]) {
          expect(bash(mode, command, { ...READS, ...AUTO })).toEqual(PROMPT);
        }
      });

      test('an allow rule and a hook allow do not skip it', () => {
        const rules = rulesOf(['allow', 'Bash(cat *)']);
        expect(
          bash(mode, 'cat /etc/passwd', { ...READS, ...AUTO, rules, hook: { decision: 'allow' } }),
        ).toEqual(PROMPT);
      });
    });
  });
}

spec('permissions.mode.default', () => {
  describe('the read block on Bash: what does not prompt', () => {
    test('a read inside the working directory, with the block on', () => {
      expect(bash('default', 'cat README.md', READS)).toEqual(allow('read-only-command'));
      expect(bash('default', 'cd packages/api && ls', READS)).toEqual(allow('read-only-command'));
    });

    test('a command that does not read files', () => {
      expect(bash('default', 'echo /etc/passwd', READS)).toEqual(allow('read-only-command'));
    });

    test('with the block off, a read of /etc/passwd is asked as any file outside (oracle 2.1.322)', () => {
      expect(bash('default', 'cat /etc/passwd')).toEqual(ask('default-prompt'));
      expect(bash('default', 'cat README.md')).toEqual(allow('read-only-command'));
      expect(bash('bypassPermissions', 'cd a && cd b && ls')).toEqual(allow('read-only-command'));
    });

    test('a command in a sandbox that enforces the block does not prompt', () => {
      expect(
        bash('default', 'cat /etc/passwd', { ...READS, sandboxEnforcesReadBlock: true }),
      ).toEqual(ask('default-prompt'));
      // The block's own prompt is gone; the file outside is still asked (oracle 2.1.322).
      expect(bash('default', 'ls /work/app', { ...READS, sandboxEnforcesReadBlock: true })).toEqual(
        allow('read-only-command'),
      );
    });

    test('an additional directory is inside', () => {
      const match = pathsWith({ additionalDirectories: ['/work/shared'] });
      expect(bash('default', 'cat /work/shared/a.txt', { ...READS, match })).toEqual(
        allow('read-only-command'),
      );
    });
  });
});

spec('permissions.mode.acceptEdits', () => {
  describe('"Each path also goes through the symlink check" for a shell command', () => {
    test('a write that resolves inside the scope is approved', () => {
      expect(prepared('acceptEdits', 'rm link', ['/work/app/real'])).toEqual(allow('accept-edits'));
    });

    test('a write that resolves outside the scope is not', () => {
      for (const command of ['rm link', 'mv link other', 'cp a link']) {
        expect(prepared('acceptEdits', command, ['/etc/target'])).toEqual(ask('default-prompt'));
      }
    });

    test('a write that resolves to a protected path prompts, in auto mode too', () => {
      expect(prepared('acceptEdits', 'rm link', ['/work/app/.git/hooks/x'])).toEqual(
        ask('protected-path'),
      );
      expect(prepared('auto', 'rm link', ['/work/app/.git/hooks/x'])).toEqual(
        ask('protected-path'),
      );
    });

    test('a read-only command is asked when a file it names leads outside (oracle 2.1.322)', () => {
      expect(prepared('acceptEdits', 'ls link', ['/etc/target'])).toEqual(ask('default-prompt'));
      expect(prepared('acceptEdits', 'ls link', ['/work/app/target'])).toEqual(
        allow('read-only-command'),
      );
    });
  });
});
