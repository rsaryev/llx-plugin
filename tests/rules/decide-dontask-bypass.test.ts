/**
 * permission-modes.md § Allow only pre-approved tools with dontAsk mode and § Skip all checks with
 * bypassPermissions mode; permissions.md § Block file-tool reads and writes outside the working
 * directories. What these two modes let run, deny or prompt, asserted through `decide()`.
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, bash, decision, deny, onPath, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

spec('permissions.mode.dontAsk', () => {
  describe('permission-modes.md, "Allow only pre-approved tools with dontAsk mode"', () => {
    test('what would prompt is denied', () => {
      expect(bash('dontAsk', 'npm test')).toEqual(deny('mode-dontask'));
      expect(onPath('dontAsk', 'Edit', '/work/app/a.ts')).toEqual(deny('mode-dontask'));
      expect(decision('dontAsk', 'WebFetch', { url: 'https://example.com', prompt: 'x' })).toEqual(
        deny('mode-dontask'),
      );
      expect(onPath('dontAsk', 'Read', '/etc/hosts')).toEqual(deny('mode-dontask'));
    });

    test('file reads in the working directories and read-only Bash commands still run', () => {
      expect(onPath('dontAsk', 'Read', '/work/app/a.ts')).toEqual(
        allow('read-in-working-directory'),
      );
      expect(bash('dontAsk', 'ls')).toEqual(allow('read-only-command'));
    });

    test('permissions.allow rules run, as the CI example "Bash(npm test)" and "Read" shows', () => {
      const rules = rulesOf(['allow', 'Bash(npm test)'], ['allow', 'Read']);
      expect(bash('dontAsk', 'npm test', { rules })).toEqual(allow('allow-rule'));
      expect(bash('dontAsk', 'npm install', { rules })).toEqual(deny('mode-dontask'));
      expect(onPath('dontAsk', 'Read', '/etc/hosts', { rules })).toEqual(allow('allow-rule'));
    });

    test('calls matching an ask rule are denied rather than prompted', () => {
      const rules = rulesOf(['ask', 'Bash(git push *)']);
      expect(bash('dontAsk', 'git push origin main', { rules })).toEqual(deny('ask-rule'));
    });

    test('an ask rule is denied even when an allow rule also matches', () => {
      const rules = rulesOf(['allow', 'Bash(git push *)'], ['ask', 'Bash(git push *)']);
      expect(bash('dontAsk', 'git push origin main', { rules })).toEqual(deny('ask-rule'));
    });

    test('AskUserQuestion is denied even if an allow rule matches it', () => {
      const rules = rulesOf(['allow', 'AskUserQuestion']);
      expect(decision('dontAsk', 'AskUserQuestion', { questions: [] }, { rules })).toEqual(
        deny('requires-user-interaction'),
      );
    });

    test('an MCP tool marked requiresUserInteraction is denied the same way', () => {
      const rules = rulesOf(['allow', 'mcp__forms__confirm']);
      expect(
        decision(
          'dontAsk',
          'mcp__forms__confirm',
          {},
          { rules, requiresUserInteraction: new Set(['mcp__forms__confirm']) },
        ),
      ).toEqual(deny('requires-user-interaction'));
    });

    test('a deny rule still denies', () => {
      const rules = rulesOf(['deny', 'Bash(rm *)'], ['allow', 'Bash(rm *)']);
      expect(bash('dontAsk', 'rm x', { rules })).toEqual(deny('deny-rule'));
    });
  });
});

spec('permissions.mode.bypassPermissions', () => {
  describe('permission-modes.md, "Skip all checks with bypassPermissions mode"', () => {
    test('everything runs: edits anywhere, commands, web access and protected paths', () => {
      expect(onPath('bypassPermissions', 'Edit', '/etc/hosts')).toEqual(allow('mode-bypass'));
      expect(onPath('bypassPermissions', 'Write', '/work/app/.git/config')).toEqual(
        allow('mode-bypass'),
      );
      expect(bash('bypassPermissions', 'npm test')).toEqual(allow('mode-bypass'));
      expect(
        decision('bypassPermissions', 'WebFetch', { url: 'https://example.com', prompt: 'x' }),
      ).toEqual(allow('mode-bypass'));
    });

    test('deny rules block in every mode, including bypassPermissions', () => {
      const rules = rulesOf(['deny', 'Bash(rm *)']);
      expect(bash('bypassPermissions', 'rm -rf build', { rules })).toEqual(deny('deny-rule'));
    });

    test('an explicit ask rule still prompts', () => {
      const rules = rulesOf(['ask', 'Bash(git push *)']);
      expect(bash('bypassPermissions', 'git push origin main', { rules })).toEqual(ask('ask-rule'));
    });

    test('a tool that requires user interaction still prompts', () => {
      expect(decision('bypassPermissions', 'AskUserQuestion', { questions: [] })).toEqual(
        ask('requires-user-interaction'),
      );
      expect(
        decision(
          'bypassPermissions',
          'mcp__forms__confirm',
          {},
          { requiresUserInteraction: new Set(['mcp__forms__confirm']) },
        ),
      ).toEqual(ask('requires-user-interaction'));
    });

    test('permissions.blockReadsOutsideWorkingDirectories refuses file-tool reads in every mode', () => {
      const overrides = { blockReadsOutsideWorkingDirectories: true };
      expect(onPath('bypassPermissions', 'Read', '/etc/hosts', overrides)).toEqual(
        deny('outside-working-directory'),
      );
      expect(onPath('bypassPermissions', 'Read', '/work/app/a.ts', overrides)).toEqual(
        allow('read-in-working-directory'),
      );
    });

    test('permissions.blockWritesOutsideWorkingDirectories refuses Write, Edit and NotebookEdit there', () => {
      const overrides = { blockWritesOutsideWorkingDirectories: true };
      for (const tool of ['Write', 'Edit', 'NotebookEdit'] as const) {
        expect(onPath('bypassPermissions', tool, '/etc/hosts', overrides)).toEqual(
          deny('outside-working-directory'),
        );
      }
      expect(onPath('bypassPermissions', 'Write', '/work/app/a.ts', overrides)).toEqual(
        allow('mode-bypass'),
      );
    });
  });
});
