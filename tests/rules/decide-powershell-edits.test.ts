/**
 * permission-modes.md § Auto-approve file edits with acceptEdits mode (the PowerShell paragraph) and
 * § Remove-Item in PowerShell: `Set-Content`, `Add-Content`, `Clear-Content` and `Remove-Item` on
 * in-scope paths, the quote-character rule, and the cases of `Remove-Item` that are not ordinary.
 */
import { describe, expect, test } from 'bun:test';
import { allow, ask, decision, pathsWith, rulesOf } from '../support/decide.ts';
import { spec } from '../support/spec.ts';

const match = pathsWith({
  platform: 'windows',
  cwd: 'C:\\work\\app',
  primaryWorkingDirectory: 'C:\\work\\app',
  home: 'C:\\Users\\alice',
});

const powershell = (command: string, mode: 'acceptEdits' | 'default' = 'acceptEdits') =>
  decision(mode, 'PowerShell', { command }, { match });

const EDITS = allow('accept-edits');
const PROMPTS = ask('default-prompt');

spec('permissions.mode.acceptEdits', () => {
  describe('the four cmdlets on in-scope paths', () => {
    test('are auto-approved', () => {
      for (const command of [
        'Set-Content .\\notes.txt -Value done',
        'Add-Content .\\notes.txt -Value more',
        'Clear-Content .\\notes.txt',
        'Remove-Item .\\build.log',
        'Set-Content -Path .\\notes.txt -Value done',
        'Remove-Item -LiteralPath C:\\work\\app\\build.log -Force',
      ]) {
        expect(powershell(command)).toEqual(EDITS);
      }
    });

    test('their common aliases are too', () => {
      for (const command of [
        'sc .\\notes.txt -Value x',
        'ac .\\notes.txt -Value x',
        'clc .\\notes.txt',
        'ri .\\build.log',
        'del .\\build.log',
        'rm .\\build.log',
        'SET-CONTENT .\\notes.txt -Value x',
      ]) {
        expect(powershell(command)).toEqual(EDITS);
      }
    });

    test('a compound command is approved only when every part is one of them', () => {
      expect(powershell('Clear-Content .\\a.txt; Remove-Item .\\b.txt')).toEqual(EDITS);
      expect(powershell('Clear-Content .\\a.txt; Get-Date')).toEqual(PROMPTS);
    });

    test('only in acceptEdits mode', () => {
      expect(powershell('Set-Content .\\notes.txt -Value x', 'default')).toEqual(PROMPTS);
    });
  });

  describe('what still prompts', () => {
    test('a path outside the working directories', () => {
      expect(powershell('Set-Content C:\\other\\notes.txt -Value x')).toEqual(PROMPTS);
      expect(powershell('Remove-Item ..\\other.txt')).toEqual(PROMPTS);
    });

    test('a protected path', () => {
      expect(powershell('Set-Content .git\\config -Value x')).toEqual(ask('protected-path'));
      expect(powershell('Remove-Item .vscode\\settings.json')).toEqual(ask('protected-path'));
    });

    test('a path a variable or wildcard hides', () => {
      expect(powershell('Remove-Item $dir\\a.txt')).toEqual(PROMPTS);
      expect(powershell('Remove-Item .\\*')).toEqual(PROMPTS);
      expect(powershell('Remove-Item .\\*.log')).toEqual(PROMPTS);
    });

    test('a parameter the kit does not validate', () => {
      expect(powershell('Set-Content .\\notes.txt -Value x -Stream s')).toEqual(PROMPTS);
      expect(powershell('Remove-Item .\\a.txt -Filter *.log')).toEqual(PROMPTS);
    });

    test('a call with no path, or with a stray positional argument', () => {
      expect(powershell('Clear-Content')).toEqual(PROMPTS);
      expect(powershell('Clear-Content .\\a.txt extra')).toEqual(PROMPTS);
      expect(powershell('Clear-Content -Path .\\a.txt extra')).toEqual(PROMPTS);
      expect(powershell('Set-Content -Path .\\a.txt extra')).toEqual(EDITS);
    });
  });

  describe('"A positional argument that contains a quote character ... still prompts"', () => {
    test('the apostrophe in `Set-Content .\\notes.txt "It\'s done"`', () => {
      expect(powershell('Set-Content .\\notes.txt "It\'s done"')).toEqual(PROMPTS);
    });

    test('a positional argument with no quote character runs, quoted whole or not', () => {
      expect(powershell('Set-Content .\\notes.txt "done"')).toEqual(EDITS);
      expect(powershell('Set-Content .\\notes.txt done')).toEqual(EDITS);
    });

    test('a named parameter avoids the prompt', () => {
      expect(powershell('Set-Content .\\notes.txt -Value "It\'s done"')).toEqual(EDITS);
    });
  });

  describe('"Remove-Item in PowerShell": the targets that need more than acceptEdits', () => {
    test('a system path or the home directory is not approved', () => {
      expect(powershell('Remove-Item C:\\Windows -Recurse')).toEqual(PROMPTS);
      expect(powershell('Remove-Item C:\\Users\\alice')).toEqual(PROMPTS);
    });

    test('the working directory or a parent of it with -Recurse is not approved', () => {
      expect(powershell('Remove-Item . -Recurse')).toEqual(PROMPTS);
      expect(powershell('Remove-Item C:\\work\\app -Recurse -Force')).toEqual(PROMPTS);
      expect(powershell('Remove-Item . -Rec')).toEqual(PROMPTS);
    });

    test('the working directory itself without -Recurse is an ordinary target', () => {
      expect(powershell('Remove-Item .\\empty')).toEqual(EDITS);
    });
  });

  describe('rules still apply first', () => {
    test('a deny rule beats the acceptEdits approval', () => {
      const rules = rulesOf(['deny', 'PowerShell(Remove-Item *)']);
      expect(
        decision(
          'acceptEdits',
          'PowerShell',
          { command: 'Remove-Item .\\a.txt' },
          { match, rules },
        ),
      ).toEqual({ outcome: 'deny', reason: 'deny-rule' });
    });
  });
});
