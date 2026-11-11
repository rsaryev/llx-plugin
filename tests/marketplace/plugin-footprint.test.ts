/** plugins/overview.md § What an enabled plugin adds to your sessions (its three consequences and the three stages). */
import { expect, test } from 'bun:test';
import {
  contextEntries,
  footprintGuide,
  processesOf,
  runsAs,
  showsContextCost,
  type PluginSummary,
} from '../../src/marketplace/plugin-footprint.ts';
import { spec } from '../support/spec.ts';

const O = 'install.overview.What an enabled plugin adds to your sessions.';
const plugin: PluginSummary = {
  id: 'deploy@acme',
  skills: [
    { name: 'deploy', description: 'Ship it', modelInvocable: true },
    { name: 'secret-ritual', description: 'Only by hand', modelInvocable: false },
  ],
  agents: [{ name: 'reviewer', description: 'Reviews', modelInvocable: true }],
  commands: [{ name: 'rollback', modelInvocable: true }],
  mcpServers: ['db', 'logs'],
  hookEvents: ['PreToolUse', 'Stop'],
};

spec(`${O}Context and usage`, () => {
  test('each skill, agent and command Claude can invoke on its own puts its name and description in context', () => {
    expect(contextEntries(plugin)).toEqual([
      { kind: 'skill', name: 'deploy', description: 'Ship it' },
      { kind: 'agent', name: 'reviewer', description: 'Reviews' },
      { kind: 'command', name: 'rollback', description: '' },
    ]);
  });
  test('one Claude cannot invoke on its own adds nothing, and a plugin with no components adds nothing', () => {
    expect(contextEntries(plugin).map((entry) => entry.name)).not.toContain('secret-ritual');
    expect(contextEntries({ ...plugin, skills: [], agents: [], commands: [] })).toEqual([]);
  });
});

spec(`${O}Processes`, () => {
  test('the MCP servers run alongside each session and the hooks fire at their events', () => {
    expect(processesOf(plugin)).toEqual({
      mcpServers: ['db', 'logs'],
      hookEvents: ['PreToolUse', 'Stop'],
    });
  });
});

spec(`${O}Permissions`, () => {
  test('what the plugin runs, it runs as the user', () => {
    expect(runsAs).toBe('the user');
  });
});

spec(`${O}Before you install`, () => {
  test('the plugin opens from the Marketplaces tab; official marketplaces show a Context cost estimate', () => {
    expect(
      footprintGuide('deploy@claude-plugins-official', 'claude-plugins-official').beforeInstall,
    ).toEqual({
      where: 'the Marketplaces tab in /plugin',
      contextCost: true,
    });
    expect(showsContextCost('claude-code-plugins')).toBe(true);
    expect(showsContextCost('acme')).toBe(false);
    expect(showsContextCost('claude-community')).toBe(false);
  });
});

spec(`${O}After you install`, () => {
  test('Measure what a plugin costs and the Installed tab Not used recently group show the footprint', () => {
    const where = footprintGuide('deploy@acme', 'acme').afterInstall.where;
    expect(where).toHaveLength(2);
    expect(where.join(' ')).toContain('Not used recently');
  });
});

spec(`${O}To stop it without uninstalling`, () => {
  test('disable it with /plugin or, in the shell, claude plugin disable', () => {
    expect(footprintGuide('deploy@acme', 'acme').stopWithoutUninstalling).toEqual({
      panel: '/plugin',
      shell: 'claude plugin disable deploy@acme',
    });
  });
});
