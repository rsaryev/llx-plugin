/**
 * permissions.md § Compound commands, hostile spellings: a `#` that starts a word comments out the
 * rest of its line and nothing more, so a quote or a here-document opener inside a comment hides
 * no command on the lines after it. PowerShell's `<# ... #>` block comment the same.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateIf } from '../../src/rules/index.ts';
import { allows, covers, denies } from '../support/bash-rules.ts';
import { bash, rulesOf } from '../support/decide.ts';
import { matchContext } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const HIDDEN = [
  "echo x # '\nrm -rf /\n#'",
  "echo x # <<'EOF'\nrm -rf /\nEOF",
  'echo x # "\nrm -rf /\n#"',
];

spec('permissions.behavior.Compound commands', () => {
  test('a quote or here-document in a comment hides no later command', () => {
    for (const command of HIDDEN) {
      expect({ command, denied: denies('Bash(rm *)', command) }).toEqual({ command, denied: true });
      expect({ command, allowed: allows('Bash(echo *)', command) }).toEqual({
        command,
        allowed: false,
      });
      expect(bash('default', command).outcome).toBe('ask');
      expect(evaluateIf('Bash(rm *)', 'Bash', { command }, matchContext).runs).toBe(true);
    }
  });

  test('a comment is not part of the command a rule reads', () => {
    expect(allows('Bash(echo x)', 'echo x # trailing words')).toBe(true);
    expect(allows('Bash(echo *)', 'echo x # ; rm -rf /')).toBe(true);
    expect(bash('default', "echo x # 'unclosed").outcome).toBe('allow');
  });

  test('a # inside a word or after $ starts no comment', () => {
    expect(allows('Bash(echo a#b)', 'echo a#b')).toBe(true);
    expect(denies('Bash(rm *)', 'echo a#b; rm -rf /')).toBe(true);
    expect(denies('Bash(rm *)', 'echo $# ${#x}; rm -rf /')).toBe(true);
  });
});

const powershell = (rule: string, command: string): boolean =>
  covers('deny', rule, command, { toolName: 'PowerShell' });

spec('permissions.behavior.PowerShell', () => {
  test('a PowerShell line comment or block comment hides no later command', () => {
    expect(powershell('PowerShell(Remove-Item *)', "Get-ChildItem # '\nRemove-Item x\n#'")).toBe(
      true,
    );
    expect(powershell('PowerShell(Remove-Item *)', "<# ' #> Remove-Item x")).toBe(true);
    expect(powershell('PowerShell(Remove-Item *)', '<# Remove-Item x #> Get-ChildItem')).toBe(
      false,
    );
  });
});

describe('Comments in the read-only gate', () => {
  test('a read-only command with a comment is still read-only', () => {
    expect(bash('default', 'ls # list').outcome).toBe('allow');
    expect(bash('default', 'ls # list', { rules: rulesOf(['deny', 'Bash(list *)']) }).outcome).toBe(
      'allow',
    );
  });
});
