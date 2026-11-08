/**
 * permissions.md § Wildcard patterns (and § Use specifiers for fine-grained control): "A `*` in a
 * Bash rule matches any text, including spaces … A rule with no `*` matches one exact command", the
 * table of rules with the commands each does and does not match, and the three matching rules under
 * it. Every row is asserted in both columns, as an allow rule and as a deny rule, because a single
 * command reaches the same pattern either way.
 */
import { describe, expect, test } from 'bun:test';
import { matchBashPattern } from '../../src/rules/bash/wildcard.ts';
import { allows, denies } from '../support/bash-rules.ts';
import { spec } from '../support/spec.ts';

function row(rule: string, matches: readonly string[], doesNot: readonly string[]): void {
  for (const command of matches) {
    expect([rule, command, 'allow', allows(rule, command)]).toEqual([rule, command, 'allow', true]);
    expect([rule, command, 'deny', denies(rule, command)]).toEqual([rule, command, 'deny', true]);
  }
  for (const command of doesNot) {
    expect([rule, command, 'allow', allows(rule, command)]).toEqual([
      rule,
      command,
      'allow',
      false,
    ]);
    expect([rule, command, 'deny', denies(rule, command)]).toEqual([rule, command, 'deny', false]);
  }
}

spec('permissions.rule.Bash(npm run build)', () => {
  test('a rule with no * matches the exact command and nothing longer', () => {
    row('Bash(npm run build)', ['npm run build'], ['npm run build --watch', 'npm run', 'npm']);
  });
});

spec('permissions.rule.Bash(npm run *)', () => {
  test('matches the script, its options and the bare command, not another npm command', () => {
    row(
      'Bash(npm run *)',
      ['npm run build', 'npm run test --watch', 'npm run'],
      ['npm install', 'npm runs', 'npmrun build'],
    );
  });
});

spec('permissions.rule.Bash(git log * main)', () => {
  test('the * stands for any text between git log and main, and the words around it are required', () => {
    row(
      'Bash(git log * main)',
      ['git log --oneline main', 'git log -5 main', 'git log --output=<file> main'],
      ['git log main', 'git push origin main'],
    );
  });
});

spec('permissions.rule.Bash(git * main)', () => {
  test('the * stands for the subcommand and every option before it, including -c', () => {
    row(
      'Bash(git * main)',
      ['git merge main', 'git push origin main', 'git -c core.fsmonitor=<script> diff main'],
      ['git log'],
    );
  });
});

spec('permissions.rule.Bash(* --version)', () => {
  test('the * stands for the program, quoted arguments included', () => {
    row('Bash(* --version)', ['node --version', "bash -c 'echo hi' --version"], ['node -v']);
  });
});

spec('permissions.rule.Bash(ls *)', () => {
  test('a trailing space-star also matches the bare command, and the space is part of the rule', () => {
    row('Bash(ls *)', ['ls -la', 'ls'], ['lsof']);
  });
});

spec('permissions.rule.Bash(ls*)', () => {
  test('without the space the star also reaches lsof', () => {
    row('Bash(ls*)', ['ls -la', 'lsof'], []);
  });
});

spec('permissions.rule.Bash(* --help *)', () => {
  test('the bare-command rule needs the trailing * to be the only wildcard', () => {
    row('Bash(* --help *)', ['npm --help x'], ['npm --help']);
  });
});

describe('the :* suffix (permissions.md § Wildcard patterns)', () => {
  test('Bash(ls:*) matches the same commands as Bash(ls *)', () => {
    for (const command of ['ls -la', 'ls', 'lsof', 'ls  ', 'git ls']) {
      expect([command, allows('Bash(ls:*)', command)]).toEqual([
        command,
        allows('Bash(ls *)', command),
      ]);
    }
    expect(allows('Bash(ls:*)', 'ls')).toBe(true);
    expect(allows('Bash(ls:*)', 'lsof')).toBe(false);
  });

  test('the colon is a literal character anywhere but the end: Bash(git:* push) matches no git command', () => {
    expect(allows('Bash(git:* push)', 'git status push')).toBe(false);
    expect(allows('Bash(git:* push)', 'git push')).toBe(false);
    expect(allows('Bash(git:* push)', 'git:x push')).toBe(true);
  });
});

describe('matchBashPattern (the matcher the three rules share)', () => {
  test('the star matches spaces and nothing is escaped', () => {
    expect(matchBashPattern('a * z', 'a b c z')).toBe(true);
    expect(matchBashPattern('a.b', 'axb')).toBe(false);
    expect(matchBashPattern('a(b)', 'a(b)')).toBe(true);
  });

  test('a lone star is every command', () => {
    expect(matchBashPattern('*', 'anything at all')).toBe(true);
  });

  test('a trailing wildcard that is not the only one does not match the bare command', () => {
    expect(matchBashPattern('git * log *', 'git log')).toBe(false);
    expect(matchBashPattern('git * log *', 'git x log y')).toBe(true);
  });

  test('matching can ignore case for the shells that do', () => {
    expect(matchBashPattern('Get-ChildItem *', 'get-childitem -r', { ignoreCase: true })).toBe(
      true,
    );
    expect(matchBashPattern('Get-ChildItem *', 'get-childitem -r')).toBe(false);
  });
});
