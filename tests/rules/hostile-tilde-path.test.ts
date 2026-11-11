/**
 * permissions.md § Where a pattern anchors (`~/path`), hostile spellings: a path tool's `~/x` is the
 * home directory's `x`, so a rule anchored at `~/` covers it as it covers the absolute spelling.
 */
import { expect, test } from 'bun:test';
import { deny, onPath, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

spec('permissions.rule.~/path', () => {
  const rules = rulesOf(['deny', 'Read(~/.ssh/**)'], ['deny', 'Edit(~/.aws/**)']);

  test('a deny rule anchored at ~/ blocks a path written with ~', () => {
    expect(onPath('bypassPermissions', 'Read', '~/.ssh/id_rsa', { rules })).toEqual(
      deny('deny-rule'),
    );
    expect(onPath('bypassPermissions', 'Edit', '~/.aws/credentials', { rules })).toEqual(
      deny('deny-rule'),
    );
    expect(onPath('bypassPermissions', 'Grep', '~/.ssh', { rules })).toEqual(deny('deny-rule'));
  });

  test('a ~ path is outside the working directory and a protected file there is protected', () => {
    expect(onPath('default', 'Read', '~/notes.txt').outcome).toBe('ask');
    expect(onPath('acceptEdits', 'Edit', '~/.bashrc').outcome).toBe('ask');
  });
});
