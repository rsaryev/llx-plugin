/**
 * tools-reference.md § Shell selection in settings, hooks, and skills: `defaultShell`, a command
 * hook's `shell`, a skill's `shell`.
 */
import { expect, test } from 'bun:test';
import { interactiveShell } from '../../src/rules/index.ts';
import { resolveShell } from '../../src/skills/execution.ts';
import { spec } from '../support/spec.ts';

spec(
  'tools.behavior.Shell selection in settings, hooks, and skills."defaultShell": "powershell"',
  () => {
    test('powershell routes interactive ! commands through PowerShell when the tool is on', () => {
      expect(interactiveShell({ defaultShell: 'powershell', powerShellToolEnabled: true })).toBe(
        'powershell',
      );
    });
    test('it requires the PowerShell tool; anything else is bash', () => {
      expect(interactiveShell({ defaultShell: 'powershell', powerShellToolEnabled: false })).toBe(
        'bash',
      );
      expect(interactiveShell({ defaultShell: undefined, powerShellToolEnabled: true })).toBe(
        'bash',
      );
      expect(interactiveShell({ defaultShell: 'bash', powerShellToolEnabled: true })).toBe('bash');
    });
  },
);

spec('tools.behavior.Shell selection in settings, hooks, and skills.shell: powershell', () => {
  const skill = { name: 's', shell: 'powershell', shellDeclared: true } as const;
  test('a skill with shell: powershell runs through PowerShell when the tool is on', () => {
    expect(resolveShell(skill, { bash: true, powershell: true })).toEqual({
      ok: true,
      tool: 'powershell',
    });
  });
  test('without the PowerShell tool it falls to Bash', () => {
    expect(resolveShell(skill, { bash: true, powershell: false })).toEqual({
      ok: true,
      tool: 'bash',
    });
  });
});
