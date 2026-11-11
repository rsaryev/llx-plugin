/**
 * settings-reference.md § `pluginConfigs` (the plugin's `options` and an `mcpServers` field "holding
 * per-server user configuration values") and plugins/components.md § Include a packaged MCPB server
 * ("A bundled server with a required setting that has no saved value doesn't start"). The docs do not
 * describe one host serving sessions with different saved values: that a loaded plugin keeps no saved
 * value, that each session reads its own settings and `SessionOptions.userConfig` (a bundled server's
 * settings under `<server>.<key>`) and that the verdict is made when the server is resolved are
 * judgments (spec/judgments.md), tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin, type PluginSession } from '../../src/index.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, SESSION } from '../support/host.ts';
import { hostPlugin } from '../support/host-update.ts';
import { bundle, fakeBundles } from '../support/mcp-bundle.ts';
import { layerOf } from '../support/settings-layers.ts';
import { memoryFiles } from '../support/ports.ts';

const ID = 'db@acme';

const reader = fakeBundles({
  'db.mcpb': {
    ...bundle('database', { token: { required: true, sensitive: true } }),
    server: { command: 'db', env: { TOKEN: '${user_config.token}', ZONE: '${user_config.zone}' } },
  },
});

const PLUGIN_FILES = {
  '.claude-plugin/plugin.json': JSON.stringify({
    name: 'db',
    mcpServers: ['./db.mcpb', { cli: { command: 'cli', args: ['${user_config.zone}'] } }],
    userConfig: { zone: { type: 'string', title: 'Zone', description: 'Where' } },
  }),
};

const sharedHost = async () => {
  const { plugin } = await loadPlugin({ files: memoryFiles(PLUGIN_FILES), bundles: reader });
  if (plugin === undefined) throw new Error('the plugin did not load');
  return hostOf({ plugins: [hostPlugin(ID, plugin)] });
};

const userSettings = (config: unknown) =>
  createPolicyView([layerOf('user', { pluginConfigs: { [ID]: config } })]);

const servers = async (session: PluginSession) => {
  const done = await session.mcpServers();
  return {
    byName: Object.fromEntries(done.resolved.map((each) => [each.name, each.server])),
    messages: done.issues.map((each) => each.message),
  };
};

describe('judgment: one loaded plugin serves sessions with different saved values', () => {
  test("each session's pluginConfigs answer the plugin options and the bundled server's settings", async () => {
    const { host } = await sharedHost();
    const a = host.openSession({
      ...SESSION,
      settings: userSettings({ options: { zone: 'eu' }, mcpServers: { database: { token: 'a' } } }),
    });
    const b = host.openSession({
      ...SESSION,
      sessionId: 'sess-2',
      settings: userSettings({ options: { zone: 'us' }, mcpServers: { database: { token: 'b' } } }),
    });
    expect((await servers(a)).byName).toMatchObject({
      database: { env: { TOKEN: 'a' } },
      cli: { args: ['eu'] },
    });
    expect((await servers(b)).byName).toMatchObject({
      database: { env: { TOKEN: 'b' } },
      cli: { args: ['us'] },
    });
  });

  test("a session's own userConfig holds the secrets, a bundled setting under <server>.<key>, over its settings", async () => {
    const { host } = await sharedHost();
    const own = host.openSession({
      ...SESSION,
      settings: userSettings({ mcpServers: { database: { token: 'from-settings' } } }),
      userConfig: { [ID]: { 'database.token': 'from-store', zone: 'ap' } },
    });
    expect((await servers(own)).byName).toMatchObject({
      database: { env: { TOKEN: 'from-store' } },
      cli: { args: ['ap'] },
    });
  });

  test('a session with no saved value gets the verdict when the servers resolve; the other servers start', async () => {
    const { host } = await sharedHost();
    const bare = host.openSession(SESSION);
    const { byName, messages } = await servers(bare);
    expect(Object.keys(byName)).toEqual(['cli']);
    expect(messages).toContain(
      'Bundled MCP server "database" was not started: it needs configuration',
    );
    expect(host.issues.map((each) => each.message)).not.toContain(
      'Bundled MCP server "database" was not started: it needs configuration',
    );
  });
});
