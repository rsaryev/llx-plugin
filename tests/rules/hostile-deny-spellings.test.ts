/**
 * permissions.md § Bash rules (`Bash(rm *)`), hostile spellings: the command a deny rule names is
 * that command however the line spells it: a tab or a run of spaces between words, `$'rm'`, a line
 * continuation inside the name, a body of a function definition, or a redirect before the name.
 */
import { describe, expect, test } from 'bun:test';
import { evaluateIf } from '../../src/rules/index.ts';
import { allows, asks, denies } from '../support/bash-rules.ts';
import { bash } from '../support/decide.ts';
import { matchContext } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const SPELLINGS = [
  'rm\t-rf /',
  'rm  -rf /',
  "$'rm' -rf /",
  '$"rm" -rf /',
  'r\\\nm -rf /',
  'rm \\\n-rf /',
  'f() { rm -rf /; }; f',
  'f () { rm -rf /; }',
  'function f { rm -rf /; }; f',
  'function f() { rm -rf /; }',
  'f() ( rm -rf / )',
  '>out rm -rf /',
  '2>/dev/null rm -rf /',
  '<in rm -rf /',
];

spec('permissions.rule.Bash(rm *)', () => {
  test('a deny or ask rule covers every spelling of the command', () => {
    for (const command of SPELLINGS) {
      expect({ command, denied: denies('Bash(rm *)', command) }).toEqual({ command, denied: true });
      expect({ command, denied: denies('Bash(rm -rf *)', command) }).toEqual({
        command,
        denied: true,
      });
      expect({ command, asked: asks('Bash(rm *)', command) }).toEqual({ command, asked: true });
    }
  });

  test('a hook if filter runs for every spelling', () => {
    for (const command of SPELLINGS) {
      const { runs } = evaluateIf('Bash(rm *)', 'Bash', { command }, matchContext);
      expect({ command, runs }).toEqual({ command, runs: true });
    }
  });
});

describe('Function definitions', () => {
  test('a critical removal in a function body is a critical removal', () => {
    expect(bash('bypassPermissions', 'f() { rm -rf /; }; f').outcome).toBe('ask');
    expect(bash('bypassPermissions', 'function f { rm -rf ~; }; f').outcome).toBe('ask');
  });

  test('an allow rule for a spelling does not reach past a redirect or a body', () => {
    expect(allows('Bash(rm x)', '>out rm x')).toBe(false);
    expect(allows('Bash(ls)', 'ls() { rm -rf /; }; ls')).toBe(false);
    expect(bash('default', 'ls() { echo; }; ls').outcome).toBe('ask');
  });
});
