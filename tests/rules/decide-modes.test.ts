/**
 * permissions.md § Permission system, § Permission modes, § Read-only commands, § Compound
 * commands; permission-modes.md § Available modes. What default (Manual) mode lets run without a
 * prompt, asserted through `decide()` on calls built from the docs' own examples. The other modes
 * have their own files (decide-accept-edits, decide-plan, decide-auto, decide-dontask-bypass).
 */
import { describe, expect, test } from 'bun:test';
import { normalizePermissionMode } from '../../src/protocol/permission-modes.ts';
import { allow, ask, bash, decision, onPath, pathsWith, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const READ_ONLY_SAMPLES: readonly string[] = [
  'ls -la',
  'cat README.md',
  'echo hello',
  'pwd',
  'head -n 5 CHANGELOG.md',
  'tail -f log.txt',
  'grep -r TODO src',
  "find . -name '*.ts'",
  'wc -l src/index.ts',
  'which node',
  'diff a.txt b.txt',
  'stat package.json',
  'du -sh .',
];

spec('permissions.mode.default', () => {
  describe('permissions.md, "Permission system": reads inside the working directories run, the rest asks', () => {
    test('Read, Grep and Glob inside the working directory run without a prompt', () => {
      expect(onPath('default', 'Read', '/work/app/src/index.ts')).toEqual(
        allow('read-in-working-directory'),
      );
      expect(onPath('default', 'Grep', '/work/app/src')).toEqual(
        allow('read-in-working-directory'),
      );
      expect(onPath('default', 'Glob', '/work/app')).toEqual(allow('read-in-working-directory'));
    });

    test('a search with no path searches the working directory', () => {
      expect(decision('default', 'Grep', { pattern: 'TODO' })).toEqual(
        allow('read-in-working-directory'),
      );
    });

    test('an additional directory reads like the working directory', () => {
      const match = pathsWith({ additionalDirectories: ['/work/shared'] });
      expect(onPath('default', 'Read', '/work/shared/lib.ts', { match })).toEqual(
        allow('read-in-working-directory'),
      );
    });

    test('a read outside both asks', () => {
      expect(onPath('default', 'Read', '/etc/hosts')).toEqual(ask('default-prompt'));
      expect(onPath('default', 'Read', '/work/app/../other/a.ts')).toEqual(ask('default-prompt'));
    });

    test('file modification, web fetch and web search ask', () => {
      expect(onPath('default', 'Edit', '/work/app/src/index.ts')).toEqual(ask('default-prompt'));
      expect(onPath('default', 'Write', '/work/app/new.ts')).toEqual(ask('default-prompt'));
      expect(onPath('default', 'NotebookEdit', '/work/app/a.ipynb')).toEqual(ask('default-prompt'));
      expect(decision('default', 'WebFetch', { url: 'https://example.com', prompt: 'x' })).toEqual(
        ask('default-prompt'),
      );
      expect(decision('default', 'WebSearch', { query: 'x' })).toEqual(ask('default-prompt'));
    });
  });

  describe('permissions.md, "Read-only commands": the built-in set runs, other commands ask', () => {
    for (const command of READ_ONLY_SAMPLES) {
      test(`${command} runs without a prompt`, () => {
        expect(bash('default', command)).toEqual(allow('read-only-command'));
      });
    }

    test('any other command asks', () => {
      expect(bash('default', 'npm test')).toEqual(ask('default-prompt'));
      expect(bash('default', 'rm -rf build')).toEqual(ask('default-prompt'));
    });

    test('unquoted globs run for a command whose every flag is read-only', () => {
      expect(bash('default', 'ls *.ts')).toEqual(allow('read-only-command'));
      expect(bash('default', 'wc -l src/*.py')).toEqual(allow('read-only-command'));
    });

    test('find prompts with an unquoted glob or an action that deletes, runs or writes', () => {
      expect(bash('default', 'find *.ts')).toEqual(ask('default-prompt'));
      expect(bash('default', 'find . -name x -delete')).toEqual(ask('default-prompt'));
      expect(bash('default', 'find . -exec rm {} \\;')).toEqual(ask('default-prompt'));
      expect(bash('default', 'find . -fprint out.txt')).toEqual(ask('default-prompt'));
    });

    test('a cd into the working directory or an additional directory is read-only', () => {
      const match = pathsWith({ additionalDirectories: ['/work/shared'] });
      expect(bash('default', 'cd packages/api')).toEqual(allow('read-only-command'));
      expect(bash('default', 'cd /work/shared', { match })).toEqual(allow('read-only-command'));
      expect(bash('default', 'cd /etc')).toEqual(ask('default-prompt'));
    });

    test('a compound command runs when each part qualifies on its own', () => {
      expect(bash('default', 'cd packages/api && ls')).toEqual(allow('read-only-command'));
      expect(bash('default', 'ls && npm test')).toEqual(ask('default-prompt'));
    });

    test('a cd with git prompts when the cd changes directory', () => {
      expect(bash('default', 'cd packages/api && git status')).toEqual(ask('default-prompt'));
      expect(bash('default', 'cd . && git status')).toEqual(allow('read-only-command'));
    });

    test('a command that cannot be parsed, or runs over 10,000 characters, asks', () => {
      expect(bash('default', 'ls &&')).toEqual(ask('critical-path'));
      expect(bash('default', `ls ${'a'.repeat(10_000)}`)).toEqual(ask('default-prompt'));
    });

    test('a command that sets a special shell variable prompts even when the rest is read-only', () => {
      expect(bash('default', 'PATH=/tmp ls')).toEqual(ask('default-prompt'));
      expect(bash('default', 'IFS=: ls')).toEqual(ask('default-prompt'));
    });

    test('an ask rule makes a read-only command prompt', () => {
      const rules = rulesOf(['ask', 'Bash(cat *)']);
      expect(bash('default', 'cat secrets.txt', { rules })).toEqual(ask('ask-rule'));
    });

    test('a command nested in a substitution is checked too', () => {
      expect(bash('default', 'echo "$(rm -rf build)"')).toEqual(ask('default-prompt'));
    });
  });

  describe('permissions.md, "Compound commands": every subcommand must be allowed', () => {
    const rules = rulesOf(['allow', 'Bash(npm test)'], ['allow', 'Bash(npm run *)']);

    test('an allow rule approves the command it matches', () => {
      expect(bash('default', 'npm test', { rules })).toEqual(allow('allow-rule'));
    });

    test('a read-only part and an allowed part together run', () => {
      expect(bash('default', 'ls && npm test', { rules })).toEqual(allow('allow-rule'));
    });

    test('two allow rules each cover their own subcommand', () => {
      expect(bash('default', 'npm run build && npm test', { rules })).toEqual(allow('allow-rule'));
    });

    test('a subcommand no rule covers makes the command ask', () => {
      expect(bash('default', 'npm test && rm -rf build', { rules })).toEqual(ask('default-prompt'));
    });

    test('a rule that matches the whole text does not approve a command left unparsed', () => {
      expect(bash('default', 'npm test &&', { rules })).toEqual(ask('critical-path'));
    });
  });

  describe('tools-reference.md, "Grep tool behavior" and "Glob tool behavior": permission comes first', () => {
    test('permission is decided from the path as asked, without checking that the path exists', () => {
      expect(onPath('default', 'Grep', '/etc/missing-directory-for-grep')).toEqual(
        ask('default-prompt'),
      );
      expect(onPath('default', 'Glob', '/etc/missing-directory-for-glob')).toEqual(
        ask('default-prompt'),
      );
      expect(onPath('default', 'Grep', '/work/app/missing-directory')).toEqual(
        allow('read-in-working-directory'),
      );
    });
  });

  describe('tools-reference.md, "EndConversation tool behavior"', () => {
    test('the tool never prompts, and deny and ask rules naming it have no effect', () => {
      const rules = rulesOf(['deny', 'EndConversation'], ['ask', 'EndConversation']);
      expect(decision('default', 'EndConversation', {}, { rules })).toEqual(
        allow('no-permission-required'),
      );
    });
  });

  describe('permissions.md, "Permission modes": the manual alias', () => {
    test('manual reads as default and decides the same', () => {
      const mode = normalizePermissionMode('manual');
      expect(mode).toBe('default');
      if (mode === undefined) throw new Error('manual must normalise');
      expect(bash(mode, 'npm test')).toEqual(ask('default-prompt'));
      expect(onPath(mode, 'Read', '/work/app/a.ts')).toEqual(allow('read-in-working-directory'));
    });
  });

  describe('permissions.md, "Read and Edit": rules layer on top of the baseline', () => {
    test('an Edit allow rule approves an edit it covers, and only that', () => {
      const rules = rulesOf(['allow', 'Edit(src/**)']);
      expect(onPath('default', 'Edit', '/work/app/src/a.ts', { rules })).toEqual(
        allow('allow-rule'),
      );
      expect(onPath('default', 'Edit', '/work/app/docs/a.md', { rules })).toEqual(
        ask('default-prompt'),
      );
    });
  });
});
