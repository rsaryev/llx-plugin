/**
 * permission-modes.md § Auto-approve file edits with acceptEdits mode: file edits and the common
 * filesystem commands (`mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, `sed`) in the working directory
 * or `additionalDirectories`, and what still prompts. Asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { decide, type PreparedCall } from '../../src/rules/index.ts';
import {
  allow,
  ask,
  baseContext,
  bash,
  deny,
  onPath,
  pathsWith,
  rulesOf,
} from '../support/decide.ts';
import { spec } from '../support/spec.ts';

/** `decide` on a call a host already prepared (its symlinks resolved). */
const decisionOfPrepared = (call: PreparedCall) => decide(call, baseContext('acceptEdits'));

spec('permissions.mode.acceptEdits', () => {
  describe('permission-modes.md, "Auto-approve file edits with acceptEdits mode": file edits in scope', () => {
    test('Edit, Write and NotebookEdit in the working directory run', () => {
      expect(onPath('acceptEdits', 'Edit', '/work/app/src/a.ts')).toEqual(allow('accept-edits'));
      expect(onPath('acceptEdits', 'Write', '/work/app/new.ts')).toEqual(allow('accept-edits'));
      expect(onPath('acceptEdits', 'NotebookEdit', '/work/app/a.ipynb')).toEqual(
        allow('accept-edits'),
      );
    });

    test('a path in additionalDirectories runs, a path outside asks', () => {
      const match = pathsWith({ additionalDirectories: ['/work/shared'] });
      expect(onPath('acceptEdits', 'Edit', '/work/shared/a.ts', { match })).toEqual(
        allow('accept-edits'),
      );
      expect(onPath('acceptEdits', 'Edit', '/work/other/a.ts', { match })).toEqual(
        ask('default-prompt'),
      );
    });

    test('a write whose symlink check resolves outside the scope is not auto-approved', () => {
      const call = { toolName: 'Edit', input: { file_path: '/work/app/link/a.ts' } };
      const resolved = { ...call, resolvedPaths: ['/etc/passwd'] };
      expect(
        // The preparation is the host's: a path that resolves outside, as `prepareCall` fills it.
        decisionOfPrepared(resolved),
      ).toEqual(ask('default-prompt'));
    });

    test('reads and the read-only command set still run', () => {
      expect(onPath('acceptEdits', 'Read', '/work/app/a.ts')).toEqual(
        allow('read-in-working-directory'),
      );
      expect(bash('acceptEdits', 'ls')).toEqual(allow('read-only-command'));
    });
  });

  describe('permission-modes.md: the common filesystem commands in scope', () => {
    for (const command of [
      'mkdir -p build/out',
      'touch notes.txt',
      'rm -rf build',
      'rmdir empty',
      'mv a.txt b.txt',
      'cp a.txt dist/a.txt',
      "sed -i 's/a/b/' src/a.ts",
    ]) {
      test(`${command} runs`, () => {
        expect(bash('acceptEdits', command)).toEqual(allow('accept-edits'));
      });
    }

    test('safe environment variables and process wrappers do not stop them, except for touch', () => {
      expect(bash('acceptEdits', 'LANG=C rm -rf build')).toEqual(allow('accept-edits'));
      expect(bash('acceptEdits', 'NO_COLOR=1 mkdir out')).toEqual(allow('accept-edits'));
      expect(bash('acceptEdits', 'timeout 5 rm -rf build')).toEqual(allow('accept-edits'));
      expect(bash('acceptEdits', 'nice mv a b')).toEqual(allow('accept-edits'));
      expect(bash('acceptEdits', 'nohup cp a b')).toEqual(allow('accept-edits'));
    });

    test('touch with an option, a glob or a prefix still prompts', () => {
      expect(bash('acceptEdits', 'touch -t 202001010000 a.txt')).toEqual(ask('default-prompt'));
      expect(bash('acceptEdits', 'touch *.ts')).toEqual(ask('default-prompt'));
      expect(bash('acceptEdits', 'timeout 5 touch a.txt')).toEqual(ask('default-prompt'));
      expect(bash('acceptEdits', 'LANG=C touch a.txt')).toEqual(ask('default-prompt'));
    });

    test('paths outside the working directory prompt', () => {
      expect(bash('acceptEdits', 'rm -rf /work/other/build')).toEqual(ask('default-prompt'));
      expect(bash('acceptEdits', 'mv a.txt /etc/a.txt')).toEqual(ask('default-prompt'));
    });

    test('every path of a compound command must be in scope', () => {
      expect(bash('acceptEdits', 'mkdir out && touch out/a')).toEqual(allow('accept-edits'));
      expect(bash('acceptEdits', 'mkdir out && rm /etc/hosts')).toEqual(ask('default-prompt'));
    });

    test('all other commands outside the read-only set prompt', () => {
      expect(bash('acceptEdits', 'npm test')).toEqual(ask('default-prompt'));
      expect(bash('acceptEdits', 'curl https://example.com')).toEqual(ask('default-prompt'));
    });

    test('a deny rule and an ask rule still apply', () => {
      expect(
        onPath('acceptEdits', 'Edit', '/work/app/src/a.ts', {
          rules: rulesOf(['deny', 'Edit(src/**)']),
        }),
      ).toEqual(deny('deny-rule'));
      expect(
        bash('acceptEdits', 'rm -rf build', { rules: rulesOf(['ask', 'Bash(rm *)']) }),
      ).toEqual(ask('ask-rule'));
    });
  });
});
