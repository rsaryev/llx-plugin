/**
 * plugins/create.md § Test and debug: five checks "in order", each telling what Claude Code did with
 * the plugin, and the checks of an MCP server (`/mcp`) and of a hook (the debug log).
 */
import { expect, test } from 'bun:test';
import { COMPONENT_CHECKS, pluginDebugSteps } from '../../src/loading/plugin-debug.ts';
import { spec } from '../support/spec.ts';

spec('install.develop.Test and debug', () => {
  test('the checks run in the documented order: validate, reload, the manager, the list', () => {
    const steps = pluginDebugSteps({ inSkillsDirectory: false });
    expect(steps.map((step) => [step.place, step.command])).toEqual([
      ['shell', 'claude plugin validate <path>'],
      ['session', '/reload-plugins'],
      ['session', '/plugin'],
      ['shell', 'claude plugin list'],
    ]);
  });

  test('to include the plugin being developed in the list, --plugin-dir precedes the subcommand', () => {
    const steps = pluginDebugSteps({ inSkillsDirectory: false, pluginDir: './my-first-plugin' });
    expect(steps.at(-1)?.command).toBe('claude --plugin-dir ./my-first-plugin plugin list');
  });

  test('a plugin in a skills directory gets a fifth check: whether managed settings block it', () => {
    const steps = pluginDebugSteps({ inSkillsDirectory: true });
    expect(steps).toHaveLength(5);
    expect(steps.at(-1)).toMatchObject({ place: 'session', command: '/status' });
  });

  test('an MCP server is checked with /mcp and a hook by triggering its event and reading the debug log', () => {
    expect(COMPONENT_CHECKS.mcpServer.command).toBe('/mcp');
    expect(COMPONENT_CHECKS.hook.command).toContain('debug log');
  });
});
