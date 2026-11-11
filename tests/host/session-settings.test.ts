/**
 * settings-reference.md § `enabledPlugins` and plugins/loading.md § Find where a plugin is enabled:
 * whether a plugin runs is a setting, resolved over the user, project and local files of the session's
 * project. A host that serves several projects from one `PluginHost` gives each session the settings
 * of its own project (`SessionOptions.settings`): the docs do not describe the embedding, so that a
 * session's settings replace the host's for everything that session exposes is a judgment
 * (spec/judgments.md), and every test here is outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, SESSION } from '../support/host.ts';
import { hostPlugin, pluginOf, skillText } from '../support/host-update.ts';
import { layerOf } from '../support/settings-layers.ts';

const parts = (name: string) => ({
  skills: { go: skillText(`Go ${name}`) },
  hooks: {
    [name === 'alpha' ? 'PreToolUse' : 'PostToolUse']: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'true' }] },
    ],
  },
  agents: { worker: 'Work.' },
  mcpServers: { [`${name}-db`]: { command: 'db' } },
});

const host = async () =>
  hostOf({
    plugins: [
      hostPlugin('alpha@acme', await pluginOf('alpha', parts('alpha'))),
      hostPlugin('beta@acme', await pluginOf('beta', parts('beta'))),
    ],
  });

const only = (id: string, off: string) =>
  createPolicyView([layerOf('project', { enabledPlugins: { [id]: true, [off]: false } })]);

const skillNames = (session: { skills(): { menu: readonly { name: string }[] } }) =>
  session.skills().menu.map((entry) => entry.name);

describe('judgment: a session with its own settings runs the plugins they enable', () => {
  test('two sessions of one host run different plugins: skills, agents, MCP servers and the plugin list', async () => {
    const { host: shared } = await host();
    const a = shared.openSession({ ...SESSION, settings: only('alpha@acme', 'beta@acme') });
    const b = shared.openSession({
      ...SESSION,
      sessionId: 'sess-2',
      settings: only('beta@acme', 'alpha@acme'),
    });
    expect(skillNames(a)).toContain('alpha:go');
    expect(skillNames(a)).not.toContain('beta:go');
    expect(skillNames(b)).toContain('beta:go');
    expect(skillNames(b)).not.toContain('alpha:go');
    expect(a.agentCatalog().agents.map((each) => each.name)).toContain('alpha:worker');
    expect(a.agentCatalog().agents.map((each) => each.name)).not.toContain('beta:worker');
    const servers = (await b.mcpServers()).resolved.map((each) => each.name);
    expect(servers).toEqual(['beta-db']);
    expect(a.plugins.map((each) => [each.id, each.enabled])).toEqual([
      ['alpha@acme', true],
      ['beta@acme', false],
    ]);
    expect([a.hasHooks('PreToolUse'), a.hasHooks('PostToolUse')]).toEqual([true, false]);
    expect([b.hasHooks('PreToolUse'), b.hasHooks('PostToolUse')]).toEqual([false, true]);
    expect(a.withTurn({ cwd: '/work/other' }).plugins).toEqual(a.plugins);
    expect(shared.plugins.every((each) => each.enabled)).toBe(true);
  });

  test('a session without settings reads the host settings; with them, the host settings do not reach it', async () => {
    const { host: shared } = await host();
    const plain = shared.openSession(SESSION);
    const own = shared.openSession({ ...SESSION, settings: only('alpha@acme', 'beta@acme') });
    shared.update({ settings: only('beta@acme', 'alpha@acme') });
    expect(skillNames(plain)).toContain('beta:go');
    expect(skillNames(plain)).not.toContain('alpha:go');
    expect(skillNames(own)).toContain('alpha:go');
    expect(skillNames(own)).not.toContain('beta:go');
  });

  test('an update of the plugins reaches a session with its own settings, decided by them', async () => {
    const { host: shared } = await host();
    const own = shared.openSession({
      ...SESSION,
      settings: only('gamma@acme', 'beta@acme'),
    });
    shared.update({
      plugins: [
        hostPlugin('beta@acme', await pluginOf('beta', parts('beta'))),
        hostPlugin('gamma@acme', await pluginOf('gamma', parts('gamma'))),
      ],
    });
    expect(skillNames(own)).toContain('gamma:go');
    expect(skillNames(own)).not.toContain('beta:go');
  });
});
