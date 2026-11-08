/**
 * permissions.md § Special characters and `!` negation: a deny or ask pattern that starts with `!`
 * "carves the paths it matches out of the `path` or `./path` rules listed before it" (`Read(*.env)`
 * then `Read(!sample.env)`), "A `!` rule listed first carves nothing out", the carve-out "reaches
 * only rules from the same source", the two limits (a `!` pattern is read relative to the current
 * directory so it cannot reach a `/`, `~/` or `//` rule; "a carve-out can't reopen a file inside a
 * directory that a rule blocks as a whole"), and "a deny or ask rule whose path isn't usable as a
 * gitignore pattern still guards that exact path. An allow rule with an unusable pattern doesn't
 * approve anything." No requirement id covers these, so none of it is under spec().
 */
import { describe, expect, test } from 'bun:test';
import { evaluateRules, type PermissionRule, type RuleSource } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { inputFor } from '../support/path-rules.ts';

const PROJECT: RuleSource = { kind: 'project' };

/** The verdict of a list of `[text, source]` deny rules, in order, for a Read of `path`. */
function verdict(
  rules: readonly (readonly [string, RuleSource?])[],
  path: string,
  behavior: 'deny' | 'ask' = 'deny',
): string | undefined {
  const list: PermissionRule[] = rules.map(([text, source]) => parsed(text, behavior, source));
  return evaluateRules(list, call('Read', inputFor('Read', path)), matchContext).behavior;
}

describe('a `!` pattern carves paths out of the rules listed before it (same source)', () => {
  const rules = [['Read(*.env)'], ['Read(!sample.env)']] as const;

  test('Read(*.env) then Read(!sample.env) blocks every .env file except sample.env', () => {
    expect(verdict(rules, '/work/app/prod.env')).toBe('deny');
    expect(verdict(rules, '/work/app/a/b/prod.env')).toBe('deny');
    expect(verdict(rules, '/work/app/sample.env')).toBeUndefined();
    expect(verdict(rules, '/work/app/a/sample.env')).toBeUndefined();
  });

  test('ask rules carve the same way', () => {
    expect(verdict(rules, '/work/app/prod.env', 'ask')).toBe('ask');
    expect(verdict(rules, '/work/app/sample.env', 'ask')).toBeUndefined();
  });

  test('a ! rule listed first carves nothing out', () => {
    const first = [['Read(!sample.env)'], ['Read(*.env)']] as const;
    expect(verdict(first, '/work/app/sample.env')).toBe('deny');
  });

  test('a ./path rule is carved out too, and a rule after the carve-out blocks again', () => {
    expect(verdict([['Read(./logs/**)'], ['Read(!logs/keep/**)']], '/work/app/logs/a.txt')).toBe(
      'deny',
    );
    const reblocked = [['Read(*.env)'], ['Read(!sample.env)'], ['Read(sample.env)']] as const;
    expect(verdict(reblocked, '/work/app/sample.env')).toBe('deny');
  });

  test('a ! rule never matches a path by itself', () => {
    expect(verdict([['Read(!sample.env)']], '/work/app/prod.env')).toBeUndefined();
    expect(verdict([['Read(!sample.env)']], '/work/app/sample.env')).toBeUndefined();
  });
});

describe('the carve-out reaches only rules from the same source', () => {
  test('a project ! rule does not cancel a managed deny', () => {
    const rules = [
      ['Read(./.env)', { kind: 'managed' }],
      ['Read(!.env)', PROJECT],
    ] as const;
    expect(verdict(rules, '/work/app/.env')).toBe('deny');
  });

  test('a --disallowedTools (cli) ! rule does not cancel a settings-file deny', () => {
    const rules = [
      ['Read(./.env)', { kind: 'local' }],
      ['Read(!.env)', { kind: 'cli' }],
    ] as const;
    expect(verdict(rules, '/work/app/.env')).toBe('deny');
  });

  test('two --settings files are two sources', () => {
    const rules = [
      ['Read(*.env)', { kind: 'flag-settings', file: '/a.json' }],
      ['Read(!sample.env)', { kind: 'flag-settings', file: '/b.json' }],
    ] as const;
    expect(verdict(rules, '/work/app/sample.env')).toBe('deny');
  });

  test('the same source with the same file carves', () => {
    const source: RuleSource = { kind: 'flag-settings', file: '/a.json' };
    const rules = [
      ['Read(*.env)', source],
      ['Read(!sample.env)', source],
    ] as const;
    expect(verdict(rules, '/work/app/sample.env')).toBeUndefined();
  });

  test('a deny carve-out does not reach an ask rule, and a Read carve-out not an Edit rule', () => {
    const list = [parsed('Read(*.env)', 'ask'), parsed('Read(!sample.env)', 'deny')];
    const read = call('Read', inputFor('Read', '/work/app/sample.env'));
    expect(evaluateRules(list, read, matchContext).behavior).toBe('ask');
    const edit = [parsed('Edit(*.env)', 'deny'), parsed('Read(!sample.env)', 'deny')];
    const write = call('Edit', inputFor('Edit', '/work/app/sample.env'));
    expect(evaluateRules(edit, write, matchContext).behavior).toBe('deny');
  });
});

describe('the two limits of a carve-out', () => {
  test('a ! pattern is read relative to the cwd, so it cannot reach a ~/ rule', () => {
    const rules = [['Read(~/notes/**)'], ['Read(!~/notes/public/**)']] as const;
    expect(verdict(rules, '/home/alice/notes/public/a.md')).toBe('deny');
  });

  test('nor a // rule or a / rule', () => {
    expect(verdict([['Read(//tmp/x/**)'], ['Read(!//tmp/x/pub/**)']], '/tmp/x/pub/a')).toBe('deny');
    expect(
      verdict([['Read(/secrets/**)'], ['Read(!/secrets/pub/**)']], '/work/app/secrets/pub/a'),
    ).toBe('deny');
  });

  test('a carve-out cannot reopen a file inside a directory a rule blocks as a whole', () => {
    const rules = [['Read(secrets/**)'], ['Read(!secrets/public/**)']] as const;
    expect(verdict(rules, '/work/app/secrets/public/readme.md')).toBe('deny');
    expect(verdict(rules, '/work/app/secrets/key')).toBe('deny');
  });

  test('it can reopen a file when the rule blocks files, not the directory', () => {
    const rules = [['Read(docs/*.md)'], ['Read(!docs/readme.md)']] as const;
    expect(verdict(rules, '/work/app/docs/readme.md')).toBeUndefined();
    expect(verdict(rules, '/work/app/docs/secret.md')).toBe('deny');
  });
});

describe('a pattern that is not usable as a gitignore pattern', () => {
  test('a deny or ask rule still guards that exact path', () => {
    expect(verdict([['Read(#notes.txt)']], '/work/app/#notes.txt')).toBe('deny');
    expect(verdict([['Read(#notes.txt)']], '/work/app/other.txt')).toBeUndefined();
    expect(verdict([['Read(#notes.txt)']], '/work/app/a/#notes.txt')).toBeUndefined();
    expect(verdict([['Read(#notes.txt)']], '/work/app/#notes.txt', 'ask')).toBe('ask');
  });

  test('an allow rule with an unusable pattern approves nothing', () => {
    const list = [parsed('Read(#notes.txt)', 'allow')];
    const read = call('Read', inputFor('Read', '/work/app/#notes.txt'));
    expect(evaluateRules(list, read, matchContext).behavior).toBeUndefined();
  });

  test('an allow rule starting with ! approves nothing', () => {
    const list = [parsed('Read(!sample.env)', 'allow')];
    const read = call('Read', inputFor('Read', '/work/app/prod.env'));
    expect(evaluateRules(list, read, matchContext).behavior).toBeUndefined();
  });
});

describe('parentheses in a path need no escape', () => {
  test('Edit(./Finance (2024)/**) matches the Finance (2024) folder as spelled', () => {
    const list = [parsed('Edit(./Finance (2024)/**)', 'allow')];
    const edit = (path: string) =>
      evaluateRules(list, call('Edit', inputFor('Edit', path)), matchContext).behavior;
    expect(edit('/work/app/Finance (2024)/sheet.xlsx')).toBe('allow');
    expect(edit('/work/app/Finance (2023)/sheet.xlsx')).toBeUndefined();
  });
});
