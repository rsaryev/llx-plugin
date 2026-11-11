/**
 * hooks.md, the PreToolUse input tables: Read, Edit and Write carry the path in `file_path`, Grep and
 * Glob in `path`, NotebookEdit in `notebook_path`. A path rule reads that field and no other, so a
 * secret path in `old_string`, `content`, `pattern` or `glob` is not the path the tool acts on. Same
 * check as `bash-command-field.test.ts`, which puts the matching text in `description`.
 */
import { describe, expect, test } from 'bun:test';
import { matchRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';

const matches = (
  rule: string,
  tool: string,
  input: unknown,
  behavior: 'allow' | 'deny' | 'ask' = 'deny',
): boolean => matchRule(parsed(rule, behavior), call(tool, input), matchContext);

describe('a path rule reads the path field and no other field', () => {
  const secret = '/work/app/secrets/a.txt';
  const OTHER_FIELDS: readonly (readonly [string, unknown])[] = [
    ['Read', { file_path: '/work/app/ok.txt', offset: secret }],
    ['Edit', { file_path: '/work/app/ok.txt', old_string: secret, new_string: secret }],
    ['Write', { file_path: '/work/app/ok.txt', content: secret }],
    ['NotebookEdit', { notebook_path: '/work/app/ok.ipynb', new_source: secret }],
    ['Grep', { pattern: secret, path: '/work/app/docs', glob: secret }],
    // A relative pattern searches below `path`; an absolute one says where the search is
    // (`hostile-glob-pattern.test.ts`).
    ['Glob', { pattern: 'secrets/a.txt', path: '/work/app/docs' }],
  ];

  for (const [tool, input] of OTHER_FIELDS) {
    test(`the secret path in another field of ${tool} matches no rule`, () => {
      for (const rule of ['Read(secrets/**)', 'Edit(secrets/**)']) {
        for (const behavior of ['deny', 'ask'] as const) {
          expect([rule, behavior, matches(rule, tool, input, behavior)]).toEqual([
            rule,
            behavior,
            false,
          ]);
        }
      }
    });
  }

  test('a Grep or Glob call without a path searches the current directory, whatever its pattern says', () => {
    expect(matches('Read(secrets/**)', 'Grep', { pattern: 'secrets/a.txt' }, 'ask')).toBe(false);
    expect(matches('Read(secrets/**)', 'Glob', { pattern: 'secrets/**' }, 'ask')).toBe(false);
  });
});
