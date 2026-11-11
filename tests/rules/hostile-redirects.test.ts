/**
 * permissions.md § Redirections, hostile spellings: a redirect the shell reads is a redirect
 * wherever it sits in a word (`x>/etc/x`), after a descriptor duplication (`2>&1>/etc/x`), as
 * `>& file`, `<>` or `{fd}>`. Each one is checked "as if Claude wrote or read that file directly".
 */
import { describe, expect, test } from 'bun:test';
import { allow, bash, deny, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const WRITES_OUTSIDE = [
  'echo x>/etc/x',
  'echo x>.git/hooks/pre-commit',
  'echo hi >& /etc/x',
  'echo hi >&/etc/x',
  'echo hi 2>&1>/etc/x',
  'echo hi 1<>/etc/x',
  'echo hi {fd}>/etc/x',
  'echo hi &>/etc/x',
  'echo hi>>/etc/x',
  'echo "a"\'b\'>/etc/x',
];

spec('permissions.behavior.Redirections', () => {
  test('a redirect glued to a word, or after a duplication, is checked', () => {
    for (const command of WRITES_OUTSIDE) {
      expect({ command, outcome: bash('default', command).outcome }).toEqual({
        command,
        outcome: 'ask',
      });
    }
  });

  test('an Edit deny rule blocks a glued output target in every mode', () => {
    const rules = rulesOf(['deny', 'Edit(//etc/**)']);
    for (const command of WRITES_OUTSIDE.filter((text) => text.includes('/etc/'))) {
      expect({ command, decision: bash('bypassPermissions', command, { rules }) }).toEqual({
        command,
        decision: deny('deny-rule'),
      });
    }
  });

  test('a Read deny rule blocks a glued input target in every mode', () => {
    const rules = rulesOf(['deny', 'Read(//secret/**)']);
    expect(bash('bypassPermissions', 'cat</secret/k', { rules })).toEqual(deny('deny-rule'));
    expect(bash('bypassPermissions', 'cat 0</secret/k', { rules })).toEqual(deny('deny-rule'));
    expect(bash('bypassPermissions', 'cat <>/secret/k', { rules })).toEqual(deny('deny-rule'));
  });
});

describe('Targets with no file behind them stay unchecked', () => {
  test('descriptor forms, /dev/null and here-strings keep a read-only command read-only', () => {
    for (const command of ['echo hi 2>&1', 'echo hi>&2', 'echo hi 2>/dev/null', 'cat <<<x']) {
      expect({ command, decision: bash('default', command) }).toEqual({
        command,
        decision: allow('read-only-command'),
      });
    }
  });

  test('a quoted > is text, not a redirect', () => {
    expect(bash('default', "echo 'x>/etc/x'")).toEqual(allow('read-only-command'));
    expect(bash('default', 'echo x\\>/etc/x')).toEqual(allow('read-only-command'));
  });
});
