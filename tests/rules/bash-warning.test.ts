/**
 * errors.md § Has a wildcard before the rest of the command: Claude Code warns about "a `Bash`
 * allow rule whose `*` comes before a later word that determines which command it is, such as
 * `Bash(git * main)` or `Bash(git -C * status *)`", "keeps the rule and changes nothing about how
 * it matches"; permissions.md § Wildcard patterns: "Put the `*` after the subcommand", and
 * `Bash(git log * main)` is a documented rule that matches `git log --output=<file> main`.
 *
 * No requirement id covers the warning, so none of it is under spec(). Which rules the docs'
 * description reaches (where the subcommand is) is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import { DOCUMENTED_TOOLS } from '../../src/protocol/tool-names.ts';
import { ruleIssues } from '../../src/rules/index.ts';
import { allows } from '../support/bash-rules.ts';
import { parsed } from '../support/rule-context.ts';

const known: ReadonlySet<string> = new Set(DOCUMENTED_TOOLS);
const issuesOf = (text: string, behavior: PermissionBehavior = 'allow') =>
  ruleIssues([parsed(text, behavior, { kind: 'user' })], known);

describe('an allow rule with a * before the subcommand warns', () => {
  test.each(['Bash(git * main)', 'Bash(git -C * status *)', 'Bash(docker * run)'])(
    '%s warns and names the rule',
    (text) => {
      const [issue, ...rest] = issuesOf(text);
      expect(rest).toEqual([]);
      expect(issue?.severity).toBe('warning');
      expect(issue?.path).toBe('permissions.allow');
      expect(issue?.message).toContain(`(~/.claude/settings.json): ${text} has a wildcard`);
      expect(issue?.message).toContain('has a wildcard before the rest of the command');
      expect(issue?.message).toContain('only use * after the subcommand');
    },
  );

  test('the rule is kept: it still matches as the docs say, options inserted at the * included', () => {
    expect(allows('Bash(git * main)', 'git -c core.fsmonitor=x diff main')).toBe(true);
  });

  test('the :* suffix is a trailing wildcard, so it never warns, and the space form is the same', () => {
    expect(issuesOf('Bash(git status:*)')).toEqual([]);
    expect(issuesOf('Bash(git -C x status:*)')).toEqual([]);
  });
});

describe('a rule with the * after the subcommand, or no wildcard before a word, does not warn', () => {
  test.each([
    'Bash(git status *)',
    'Bash(git log * main)',
    'Bash(git commit -m *)',
    'Bash(npm run *)',
    'Bash(git *)',
    'Bash(* --version)',
    'Bash(ls*)',
    'Bash(npm run build)',
    'Bash(* --help *)',
  ])('%s', (text) => {
    expect(issuesOf(text)).toEqual([]);
  });

  test('a deny or ask rule never warns, nor does a rule for another tool', () => {
    expect(issuesOf('Bash(git * main)', 'deny')).toEqual([]);
    expect(issuesOf('Bash(git * main)', 'ask')).toEqual([]);
    expect(issuesOf('PowerShell(git * main)')).toEqual([]);
    expect(issuesOf('Read(src/*/main)')).toEqual([]);
  });
});
