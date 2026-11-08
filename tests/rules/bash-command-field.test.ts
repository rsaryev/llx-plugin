/**
 * hooks.md § Bash and § PowerShell (input tables): `command` is "the shell command to execute" /
 * "the PowerShell command to execute"; permissions.md § Bash and § PowerShell: the rule's specifier
 * is matched against that command text. The behaviour proven is the field's role in a rule: a
 * command rule reads `command` and no other field of the input, and an input without a command
 * string matches no command rule (permissions.md, "Match by input parameter": parameter rules on
 * `command` are ignored, so a rule's text pattern is the only way a command is matched).
 */
import { expect, test } from 'bun:test';
import { matchRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const covered = (rule: string, toolName: string, input: unknown): boolean =>
  matchRule(parsed(rule, 'deny'), call(toolName, input), matchContext);

const ROLE: readonly (readonly [string, string, string])[] = [
  ['tools.input.Bash.command', 'Bash', 'Bash(rm *)'],
  ['tools.input.PowerShell.command', 'PowerShell', 'PowerShell(Remove-Item *)'],
];

for (const [id, tool, rule] of ROLE) {
  const command = tool === 'Bash' ? 'rm -rf build' : 'Remove-Item -Recurse build';
  spec(id, () => {
    test('a command rule matches the command field', () => {
      expect(covered(rule, tool, { command })).toBe(true);
    });

    test('it reads no other field: the same text in description does not match', () => {
      expect(covered(rule, tool, { command: 'ls', description: command })).toBe(false);
    });

    test('the other fields of the table do not change the match', () => {
      const input = { command, description: 'Clean', timeout: 120000, run_in_background: false };
      expect(covered(rule, tool, input)).toBe(true);
    });

    test('an input with no command string matches no command rule', () => {
      expect(covered(rule, tool, {})).toBe(false);
      expect(covered(rule, tool, { command: 7 })).toBe(false);
      expect(covered(rule, tool, undefined)).toBe(false);
    });

    test('a command rule on another tool does not read this command', () => {
      const other = tool === 'Bash' ? 'PowerShell' : 'Bash';
      expect(covered(rule, other, { command })).toBe(false);
    });
  });
}
