/**
 * permissions.md § Read-only commands, hostile spellings: GNU `which` reads aliases and functions
 * from its standard input with `-i`, `--read-alias` and `--read-functions`, so only a plain lookup is
 * read-only.
 */
import { expect, test } from 'bun:test';
import { allow, bash } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

spec('permissions.behavior.Read-only commands', () => {
  test('which with an option that reads its input asks', () => {
    for (const command of ['which -i ls', 'which --read-alias ls', 'which --read-functions ls']) {
      expect({ command, outcome: bash('default', command).outcome }).toEqual({
        command,
        outcome: 'ask',
      });
    }
  });

  test('a plain lookup is read-only', () => {
    expect(bash('default', 'which ls')).toEqual(allow('read-only-command'));
    expect(bash('default', 'which -a ls node')).toEqual(allow('read-only-command'));
  });
});
