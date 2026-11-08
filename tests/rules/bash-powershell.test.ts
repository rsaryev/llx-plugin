/**
 * permissions.md § PowerShell: "PowerShell permission rules use the same shape as Bash rules, and a
 * bare `PowerShell` or `PowerShell(*)` matches every command"; "Common aliases are canonicalized
 * before matching. A rule written for the cmdlet name also matches those aliases, so
 * `PowerShell(Get-ChildItem *)` matches `gci`, `ls`, and `dir` as well. Matching is
 * case-insensitive."; "Pipeline operators `|`, statement separators `;`, and on PowerShell 7+ the
 * chain operators `&&` and `||` split a compound command into subcommands. Every subcommand must be
 * allowed for the compound command to run without a prompt"; the example configuration that allows
 * `Get-ChildItem *` and `git commit *` and denies `Remove-Item *`.
 *
 * hooks.md § PowerShell: `command` is "the PowerShell command to execute", and a rule reads it.
 *
 * No requirement id owns the aliases or the case rule; tools.tool.PowerShell is proven by the tool
 * catalogue. The AST-free split and the alias table are rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { canonicalizePowerShell } from '../../src/rules/bash/powershell.ts';
import { splitCommand } from '../../src/rules/bash/split.ts';
import { POWERSHELL_DIALECT } from '../../src/rules/bash/dialect.ts';
import { covers } from '../support/bash-rules.ts';

const allow = (rule: string, command: string) =>
  covers('allow', rule, command, { toolName: 'PowerShell' });
const deny = (rule: string, command: string) =>
  covers('deny', rule, command, { toolName: 'PowerShell' });

describe('aliases and case', () => {
  test('PowerShell(Get-ChildItem *) matches gci, ls and dir as well', () => {
    for (const command of [
      'Get-ChildItem -Recurse',
      'gci -Recurse',
      'ls -Recurse',
      'dir -Recurse',
    ]) {
      expect([command, allow('PowerShell(Get-ChildItem *)', command)]).toEqual([command, true]);
    }
  });

  test('a rule written with the alias matches the cmdlet and the other aliases', () => {
    expect(allow('PowerShell(gci *)', 'Get-ChildItem x')).toBe(true);
    expect(allow('PowerShell(ls *)', 'dir x')).toBe(true);
  });

  test('matching is case-insensitive', () => {
    expect(allow('PowerShell(Get-ChildItem *)', 'GET-CHILDITEM -Path .')).toBe(true);
    expect(allow('PowerShell(get-childitem *)', 'Get-ChildItem -Path .')).toBe(true);
    expect(allow('PowerShell(Git Commit *)', 'git COMMIT -m x')).toBe(true);
    expect(allow('PowerShell(Get-ChildItem *)', 'LS')).toBe(true);
  });

  test('only the command position is an alias, and only the three documented ones', () => {
    expect(allow('PowerShell(Get-ChildItem *)', 'Write-Host ls')).toBe(false);
    expect(allow('PowerShell(Get-ChildItem *)', 'lsof x')).toBe(false);
    expect(canonicalizePowerShell('dir -Force')).toBe('Get-ChildItem -Force');
    expect(canonicalizePowerShell('dirx -Force')).toBe('dirx -Force');
  });

  test('a bare PowerShell and PowerShell(*) match every command', () => {
    expect(allow('PowerShell', 'anything at all')).toBe(true);
    expect(allow('PowerShell(*)', 'anything at all')).toBe(true);
  });
});

describe('compound commands', () => {
  test.each(['|', ';', '&&', '||', '\n'])('%j splits two subcommands', (separator) => {
    expect(splitCommand(`Get-Date ${separator} Get-Item x`, POWERSHELL_DIALECT)).toEqual({
      subcommands: ['Get-Date', 'Get-Item x'],
      parseable: true,
    });
  });

  test('every subcommand must be allowed', () => {
    expect(allow('PowerShell(Get-ChildItem *)', 'Get-ChildItem | Remove-Item x')).toBe(false);
    expect(allow('PowerShell(Get-ChildItem *)', 'gci a; dir b && ls c')).toBe(true);
  });

  test('a deny rule matches when any subcommand does', () => {
    expect(deny('PowerShell(Remove-Item *)', 'Get-ChildItem | Remove-Item x')).toBe(true);
    expect(deny('PowerShell(Remove-Item *)', 'Get-ChildItem | Get-Item x')).toBe(false);
  });

  test('a command inside a script block or a sub-expression is a subcommand', () => {
    expect(deny('PowerShell(Remove-Item *)', 'gci | ForEach-Object { Remove-Item $_ }')).toBe(true);
    expect(deny('PowerShell(Remove-Item *)', 'Write-Host $(Remove-Item x)')).toBe(true);
  });

  test('a quoted separator does not split, and a backtick is an escape, not a substitution', () => {
    expect(
      splitCommand('Write-Host "a; b" ; Write-Host \'c | d\'', POWERSHELL_DIALECT).subcommands,
    ).toEqual(['Write-Host "a; b"', "Write-Host 'c | d'"]);
    expect(splitCommand('Write-Host a`;b', POWERSHELL_DIALECT).subcommands).toEqual([
      'Write-Host a`;b',
    ]);
    expect(deny('PowerShell(Remove-Item *)', 'Write-Host `Remove-Item x`')).toBe(false);
  });

  test('& is the call operator, not a separator', () => {
    expect(splitCommand('& "C:\\a b\\x.exe" arg', POWERSHELL_DIALECT).subcommands).toEqual([
      '& "C:\\a b\\x.exe" arg',
    ]);
  });
});

describe('the example configuration', () => {
  test('allows Get-ChildItem and git commit, blocks Remove-Item', () => {
    expect(allow('PowerShell(Get-ChildItem *)', 'Get-ChildItem')).toBe(true);
    expect(allow('PowerShell(git commit *)', 'git commit -m "x"')).toBe(true);
    expect(deny('PowerShell(Remove-Item *)', 'Remove-Item -Recurse build')).toBe(true);
  });
});
