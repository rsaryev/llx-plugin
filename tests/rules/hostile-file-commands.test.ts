/**
 * permissions.md § What Read and Edit rules cover: the rules apply "to file commands Claude Code
 * recognizes in Bash, such as `cat`, `head`, `tail`, `sed`, and `tee`". A deny rule blocks such a
 * command's file in every mode, however its name or path is quoted.
 */
import { describe, expect, test } from 'bun:test';
import { bash, deny, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const rules = rulesOf(
  ['deny', 'Read(//secret/**)'],
  ['deny', 'Edit(//locked/**)'],
  ['deny', 'Read(~/.ssh/**)'],
);

spec('permissions.behavior.What Read and Edit rules cover', () => {
  test('a Read deny rule blocks a file command that reads the file', () => {
    for (const command of [
      'cat /secret/k',
      'head -n1 /secret/k',
      'grep x /secret/k',
      '"cat" /secret/k',
      "cat '/secret/k'",
      'cp /secret/k /tmp/x',
      'cat ~/.ssh/id_rsa',
      'ls; tail /secret/k',
      'cat /work/../secret/k',
    ]) {
      expect({ command, decision: bash('bypassPermissions', command, { rules }) }).toEqual({
        command,
        decision: deny('deny-rule'),
      });
    }
  });

  test('an Edit deny rule blocks a file command that writes the file', () => {
    for (const command of [
      'touch /locked/x',
      'rm -f /locked/x',
      'cp a /locked/x',
      "sed -i 's/a/b/' /locked/x",
    ]) {
      expect({ command, decision: bash('bypassPermissions', command, { rules }) }).toEqual({
        command,
        decision: deny('deny-rule'),
      });
    }
  });
});

describe('Commands that do not name the file are not covered', () => {
  test('a pattern argument or an unrelated path is no read of the denied file', () => {
    expect(bash('bypassPermissions', 'grep /secret/k notes.txt', { rules }).outcome).toBe('allow');
    expect(bash('bypassPermissions', 'echo /secret/k', { rules }).outcome).toBe('allow');
  });
});
