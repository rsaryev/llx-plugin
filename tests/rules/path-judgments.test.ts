/**
 * The choices spec/judgments.md records for the path rules where permissions.md is silent: what
 * "a single directory segment" covers, `./path` and `../path`, the managed tiers' anchor, and the
 * tools no page routes. Outside spec() on purpose: a judgment never counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateRules, matchRule } from '../../src/rules/index.ts';
import { allows, asks, denies, withPaths } from '../support/path-rules.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';

const matches = (
  behavior: 'allow' | 'deny' | 'ask',
  rule: string,
  tool: string,
  input: unknown,
): boolean => matchRule(parsed(rule, behavior), call(tool, input), matchContext);

describe('which patterns are "a single directory segment"', () => {
  test('one directory and a file pattern is widened for deny and ask, not for allow', () => {
    expect(denies('Read(src/index.ts)', '/work/app/vendor/src/index.ts')).toBe(true);
    expect(denies('Read(src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(true);
    expect(asks('Read(src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(true);
    expect(allows('Read(src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(false);
    expect(allows('Read(src/*.ts)', '/work/app/src/a.ts')).toBe(true);
  });

  test('a ** after the one directory is the same shape, so a deny or ask rule reaches every depth', () => {
    expect(denies('Read(src/**/*.ts)', '/work/app/vendor/src/a/b.ts')).toBe(true);
    expect(asks('Read(src/**/*.ts)', '/work/app/vendor/src/a/b.ts')).toBe(true);
    expect(allows('Read(src/**/*.ts)', '/work/app/vendor/src/a/b.ts')).toBe(false);
    expect(allows('Read(src/**/*.ts)', '/work/app/src/a/b.ts')).toBe(true);
  });

  test('two directories, a leading ** or a leading slash are other shapes', () => {
    expect(denies('Read(src/lib/**/*.ts)', '/work/app/vendor/src/lib/a/b.ts')).toBe(false);
    expect(denies('Read(src/lib/*.ts)', '/work/app/vendor/src/lib/a.ts')).toBe(false);
    expect(denies('Read(/src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(false);
    expect(denies('Read(**/src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(true);
  });
});

describe('./path and ../path', () => {
  test('./.env names the .env of the current directory only, apart from Read(.env) at any depth', () => {
    expect(denies('Read(./.env)', '/work/app/.env')).toBe(true);
    expect(denies('Read(./.env)', '/work/app/pkg/.env')).toBe(false);
    expect(denies('Read(.env)', '/work/app/pkg/.env')).toBe(true);
  });

  test('so an allow rule Read(./.env) approves the .env of the current directory only', () => {
    expect(allows('Read(./.env)', '/work/app/.env')).toBe(true);
    expect(allows('Read(./.env)', '/work/app/pkg/.env')).toBe(false);
  });

  test('./*.env is anchored the same way; ./src/** still follows the single-directory rule', () => {
    expect(denies('Read(./*.env)', '/work/app/prod.env')).toBe(true);
    expect(denies('Read(./*.env)', '/work/app/pkg/prod.env')).toBe(false);
    expect(denies('Read(./src/**)', '/work/app/vendor/src/a.ts')).toBe(true);
  });

  test('a ../ prefix names the parent of the current directory', () => {
    expect(denies('Read(../shared/**)', '/work/shared/key')).toBe(true);
    expect(denies('Read(../shared/**)', '/work/app/shared/key')).toBe(false);
  });
});

describe('anchors the source table leaves open', () => {
  test('the managed tiers anchor /path at the primary working directory', () => {
    for (const kind of ['managed', 'embedder-managed'] as const) {
      expect(denies('Read(/secrets/**)', '/work/app/secrets/k', { source: { kind } })).toBe(true);
    }
  });

  test('a relative --settings file resolves against the primary working directory', () => {
    const source = { kind: 'flag-settings', file: 'cfg/team.json' } as const;
    const ctx = withPaths({ cwd: '/work/app/sub', primaryWorkingDirectory: '/work/app' });
    expect(denies('Read(/s/**)', '/work/app/cfg/s/k', { source, ctx })).toBe(true);
  });
});

describe('a name that starts with two dots is a file, not a parent climb', () => {
  test('Read(..hidden) guards a file named ..hidden', () => {
    expect(denies('Read(..hidden)', '/work/app/..hidden')).toBe(true);
    expect(denies('Read(..hidden)', '/work/app/a/..hidden')).toBe(true);
    expect(denies('Read(**/..cache/**)', '/work/app/..cache/x')).toBe(true);
    expect(denies('Read(..hidden)', '/work/app/.hidden')).toBe(false);
  });
});

describe('tools whose path the docs do not give', () => {
  test('MultiEdit reads its path from file_path, as Edit does, and is covered by Edit rules', () => {
    expect(denies('Edit(src/**)', '/work/app/src/a.ts', { tool: 'MultiEdit' })).toBe(true);
    expect(asks('Edit(src/**)', '/work/app/src/a.ts', { tool: 'MultiEdit' })).toBe(true);
    expect(allows('Edit(src/**)', '/work/app/src/a.ts', { tool: 'MultiEdit' })).toBe(true);
    expect(denies('Edit(src/**)', '/work/app/lib/a.ts', { tool: 'MultiEdit' })).toBe(false);
  });

  test('a Read deny rule blocks MultiEdit like Edit; a Read ask or allow rule does not', () => {
    expect(denies('Read(keys/**)', '/work/app/keys/a', { tool: 'MultiEdit' })).toBe(true);
    expect(asks('Read(keys/**)', '/work/app/keys/a', { tool: 'MultiEdit' })).toBe(false);
    expect(allows('Read(keys/**)', '/work/app/keys/a', { tool: 'MultiEdit' })).toBe(false);
  });

  test('MultiEdit(docs/**) is accepted but never matches; MultiEdit(*) covers every use', () => {
    expect(denies('MultiEdit(docs/**)', '/work/app/docs/a.md', { tool: 'MultiEdit' })).toBe(false);
    expect(allows('MultiEdit(docs/**)', '/work/app/docs/a.md', { tool: 'MultiEdit' })).toBe(false);
    expect(denies('MultiEdit(*)', '/work/app/docs/a.md', { tool: 'MultiEdit' })).toBe(true);
  });

  test('a Read deny or ask rule covers every LSP call, an allow rule none, and no ! rule reopens one', () => {
    const lsp = { operation: 'hover' };
    for (const behavior of ['deny', 'ask'] as const) {
      expect(matches(behavior, 'Read(secrets/**)', 'LSP', lsp)).toBe(true);
    }
    expect(matches('allow', 'Read(secrets/**)', 'LSP', lsp)).toBe(false);
    const rules = [parsed('Read(secrets/**)', 'deny'), parsed('Read(!secrets/public/**)', 'deny')];
    expect(evaluateRules(rules, call('LSP', lsp), matchContext).behavior).toBe('deny');
  });
});
