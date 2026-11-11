/**
 * What a session resolves of the other components (plugins/components.md, "Agents", "MCP servers",
 * "LSP servers", "Monitors", "Output styles"; plugins/manifest-reference.md, "Environment
 * variables", "User configuration"; sub-agents.md): agents as official definitions under their
 * namespaced name, servers and monitors with `${CLAUDE_PLUGIN_ROOT}` and `${user_config.*}`
 * resolved, output styles of the enabled plugins. End-to-end over the real loader: integration
 * tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { FORMATTER, hostOf, loaded, SESSION, standardPlugins } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';

const CONFIGURED = { [FORMATTER]: { endpoint: 'https://svc.example', api_token: 's3cret' } };

describe('session.agents()', () => {
  test('gives the official AgentDefinition of each plugin agent under <plugin>:<name>', async () => {
    const { host } = await hostOf();
    const { resolved, issues } = await host.openSession(SESSION).agents({ builtin: false });
    expect(issues).toEqual([]);
    expect(resolved.map((agent) => agent.name)).toEqual(['formatter:reviewer']);
    expect(resolved[0]?.definition).toEqual({
      description: 'Reviews diffs for the team',
      prompt: 'You review diffs. Rules live in /plugins/formatter@acme-tools/rules.md.',
      tools: ['Read', 'Grep'],
      model: 'sonnet',
    });
  });
});

describe('session.mcpServers()', () => {
  test('resolves the plugin root and the saved option into the stdio server', async () => {
    const { host } = await hostOf({ userConfig: CONFIGURED });
    const { resolved, issues } = await host.openSession(SESSION).mcpServers();
    expect(issues).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      name: 'db',
      key: 'plugin:formatter:db',
      server: {
        command: '/plugins/formatter@acme-tools/bin/db-server',
        args: ['--endpoint', 'https://svc.example'],
      },
      environment: { CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools' },
    });
  });

  test('a saved option of settings pluginConfigs counts, and the host value wins over it', async () => {
    const settings = createPolicyView([
      layerOf('user', {
        pluginConfigs: { [FORMATTER]: { options: { endpoint: 'https://from-settings' } } },
      }),
    ]);
    const fromSettings = await hostOf({ settings });
    const first = await fromSettings.host.openSession(SESSION).mcpServers();
    expect(first.resolved[0]?.server).toMatchObject({
      args: ['--endpoint', 'https://from-settings'],
    });
    const both = await hostOf({ settings, userConfig: CONFIGURED });
    const second = await both.host.openSession(SESSION).mcpServers();
    expect(second.resolved[0]?.server).toMatchObject({
      args: ['--endpoint', 'https://svc.example'],
    });
  });

  test('the server of a disabled plugin is not resolved', async () => {
    const { host } = await hostOf({ userConfig: CONFIGURED });
    const { resolved } = await host.openSession(SESSION).mcpServers();
    expect(resolved.map((server) => server.key)).not.toContain('plugin:dormant:never');
  });
});

describe('a channel of a plugin', () => {
  test("its bound server takes the channel's saved option in env (manifest-reference.md, Channels)", async () => {
    const plugin = await loaded({
      '.claude-plugin/plugin.json': JSON.stringify({
        name: 'chat',
        mcpServers: {
          telegram: { command: 'node', env: { BOT_TOKEN: '${user_config.bot_token}' } },
        },
        channels: [
          {
            server: 'telegram',
            userConfig: {
              bot_token: {
                type: 'string',
                title: 'Bot token',
                description: 'Token',
                sensitive: true,
              },
            },
          },
        ],
      }),
    });
    const { host } = await hostOf({
      plugins: [{ id: 'chat@acme-tools', plugin }],
      userConfig: { 'chat@acme-tools': { bot_token: 'tg-123' } },
    });
    const { resolved, issues } = await host.openSession(SESSION).mcpServers();
    expect(issues).toEqual([]);
    expect(resolved[0]?.server).toMatchObject({ env: { BOT_TOKEN: 'tg-123' } });
  });
});

describe('session.lspServers() and session.monitors()', () => {
  test('resolve the plugin root in an LSP server', async () => {
    const { host } = await hostOf();
    const { resolved } = await host.openSession(SESSION).lspServers();
    expect(resolved.map((server) => [server.name, server.command])).toEqual([
      ['ts', '/plugins/formatter@acme-tools/bin/ts-ls'],
    ]);
  });

  test('resolve the plugin root in a monitor command and keep its trigger', async () => {
    const { host } = await hostOf();
    const { resolved } = await host.openSession(SESSION).monitors();
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      name: 'deploy-log',
      command: 'tail -f ${CLAUDE_PLUGIN_ROOT}/deploy.log',
      environment: { CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools' },
      when: { kind: 'always' },
    });
  });
});

describe('the owner of a resolved process (spec/judgments.md)', () => {
  test('every MCP server, LSP server and monitor names its plugin by the id the host uses', async () => {
    const { host } = await hostOf({ userConfig: CONFIGURED });
    const session = host.openSession(SESSION);
    const owners = await Promise.all([
      session.mcpServers().then(({ resolved }) => resolved.map((one) => one.pluginId)),
      session.lspServers().then(({ resolved }) => resolved.map((one) => one.pluginId)),
      session.monitors().then(({ resolved }) => resolved.map((one) => one.pluginId)),
    ]);
    expect(owners).toEqual([[FORMATTER], [FORMATTER], [FORMATTER]]);
  });
});

describe('session.outputStyles()', () => {
  test('lists the styles of the enabled plugins under <plugin>:<name>', async () => {
    const { host } = await hostOf();
    expect(
      host
        .openSession(SESSION)
        .outputStyles()
        .map((style) => style.id),
    ).toEqual(['formatter:terse']);
  });
});

describe('the host', () => {
  test('says which plugins are enabled', async () => {
    const { host } = await hostOf();
    expect(host.plugins.map((plugin) => [plugin.id, plugin.enabled])).toEqual([
      ['formatter@acme-tools', true],
      ['audit@acme-tools', true],
      ['dormant@acme-tools', false],
    ]);
  });

  test('managed settings that turn a plugin off win over an enabled flag the host set', async () => {
    const settings = createPolicyView([
      layerOf('managed', { enabledPlugins: { 'audit@acme-tools': false } }),
    ]);
    const all = await standardPlugins();
    const { host } = await hostOf({
      settings,
      plugins: all.map((entry) => ({ ...entry, enabled: true })),
    });
    expect(host.plugins.find((plugin) => plugin.id === 'audit@acme-tools')?.enabled).toBe(false);
  });
});

describe('host.issues', () => {
  test('carries what the format readers found wrong in an enabled plugin', async () => {
    const plugin = await loaded({
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'sloppy' }),
      'agents/odd.md': '---\ndescription: "unclosed\n---\nBody',
    });
    const { host } = await hostOf({ plugins: [{ id: 'sloppy@acme-tools', plugin }] });
    expect(host.issues.map((found) => found.path)).toEqual(['agents/odd.md']);
  });
});
