/**
 * permissions.md § PowerShell, hostile spellings: a cmdlet run through one of PowerShell's built-in
 * aliases, the call operator `&` or `.`, a module-qualified name, quotes or a tab is the same cmdlet
 * to a deny rule. The docs name `gci`, `ls` and `dir`; the other aliases are PowerShell's own built-in
 * ones (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { covers } from '../support/bash-rules.ts';
import { spec } from '../support/spec.ts';

const denies = (rule: string, command: string): boolean =>
  covers('deny', rule, command, { toolName: 'PowerShell' });

spec('permissions.behavior.PowerShell', () => {
  test('the call operator, a module qualifier, quotes and a tab do not hide the cmdlet', () => {
    for (const command of [
      '& Remove-Item x',
      '. Remove-Item x',
      "& 'Remove-Item' x",
      '& "Remove-Item" x',
      'Microsoft.PowerShell.Management\\Remove-Item x',
      'Remove-Item\tx',
      'Remove-Item   x',
      'remove-item x',
    ]) {
      expect({ command, denied: denies('PowerShell(Remove-Item *)', command) }).toEqual({
        command,
        denied: true,
      });
    }
  });
});

describe('PowerShell built-in aliases', () => {
  test('the built-in aliases of Remove-Item and other cmdlets are canonicalized', () => {
    for (const command of ['rm x', 'del x', 'ri x', 'erase x', 'rd x', 'rmdir x', 'RM x']) {
      expect({ command, denied: denies('PowerShell(Remove-Item *)', command) }).toEqual({
        command,
        denied: true,
      });
    }
    expect(denies('PowerShell(Invoke-Expression *)', 'iex $x')).toBe(true);
    expect(denies('PowerShell(Invoke-WebRequest *)', 'iwr https://x')).toBe(true);
    expect(denies('PowerShell(Set-Content *)', 'sc x y')).toBe(true);
    expect(denies('PowerShell(rm *)', 'Remove-Item x')).toBe(true);
  });

  test('a name that is no alias is left alone', () => {
    expect(denies('PowerShell(Remove-Item *)', 'rmx x')).toBe(false);
    expect(denies('PowerShell(Remove-Item *)', 'Get-ChildItem rm')).toBe(false);
  });
});
