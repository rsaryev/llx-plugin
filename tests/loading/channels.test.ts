/**
 * plugins/manifest-reference.md § Channels: each entry is "bound to one of the plugin's MCP servers";
 * `server` is the "Key of the MCP server in this plugin's `mcpServers` that the channel binds to",
 * `displayName` "Defaults to the server name", and `userConfig` options' "Saved values substitute
 * into `${user_config.KEY}` references in the server's `env`" (the telegram example).
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../src/index.ts';
import { resolveChannel } from '../../src/entry/loading.ts';
import { type PluginChannel } from '../../src/entry/format.ts';
import { json } from '../support/plugin-folder.ts';
import { scopeOf } from '../support/mcp-scope.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const telegram = {
  command: 'node',
  args: ['${CLAUDE_PLUGIN_ROOT}/server.js'],
  env: { BOT_TOKEN: '${user_config.bot_token}' },
};
const botToken = {
  type: 'string',
  title: 'Bot token',
  description: 'Telegram bot token',
  sensitive: true,
} as const;
const plugin = { mcpServers: { telegram }, mcpBundles: {} };
const channel: PluginChannel = {
  server: 'telegram',
  displayName: 'Telegram',
  userConfig: { bot_token: botToken },
};

const load = async (manifest: Record<string, unknown>, extra: Record<string, string> = {}) =>
  loadPlugin({
    files: memoryFiles({
      '.claude-plugin/plugin.json': json({ name: 'demo', ...manifest }),
      ...extra,
    }),
  });

const unbound = (issues: readonly { path: string; severity: string; message: string }[]) =>
  issues.filter((found) => found.path.startsWith('channels'));

spec(['manifest.field.channels', 'channels.field.server'], () => {
  test('a channel bound to a server of the manifest loads without an issue', async () => {
    const { plugin, issues } = await load({ mcpServers: { telegram }, channels: [channel] });
    expect(issues).toEqual([]);
    expect(plugin?.manifest?.channels).toEqual([channel]);
  });

  test('a channel bound to a server of .mcp.json (the default file) loads without an issue', async () => {
    const { issues } = await load(
      { channels: [{ server: 'telegram' }] },
      { '.mcp.json': json({ mcpServers: { telegram } }) },
    );
    expect(issues).toEqual([]);
  });

  test('a channel bound to a server the plugin does not declare is an error issue, and the plugin still loads', async () => {
    const { plugin, issues } = await load({
      mcpServers: { telegram },
      channels: [{ server: 'telegram' }, { server: 'discord' }],
    });
    expect(plugin?.name).toBe('demo');
    expect(unbound(issues)).toEqual([
      {
        severity: 'error',
        path: 'channels[1].server',
        message: `Channel server "discord" is not a key of this plugin's mcpServers`,
      },
    ]);
  });

  test('a plugin with no mcpServers at all binds nothing', async () => {
    const { issues } = await load({ channels: [{ server: 'telegram' }] });
    expect(unbound(issues)).toHaveLength(1);
  });

  test('resolveChannel answers the unbound channel with its issue and no server', async () => {
    const { resolved, issues } = await resolveChannel({ server: 'ghost' }, plugin, scopeOf());
    expect(resolved).toBeUndefined();
    expect(issues).toEqual([
      expect.objectContaining({
        message: `Channel server "ghost" is not a key of this plugin's mcpServers`,
      }),
    ]);
  });
});

spec('channels.field.displayName', () => {
  test('is the name shown in the dialog title, as written', async () => {
    const { resolved } = await resolveChannel(channel, plugin, scopeOf());
    expect(resolved?.displayName).toBe('Telegram');
  });

  test('defaults to the server name', async () => {
    const { resolved } = await resolveChannel({ server: 'telegram' }, plugin, scopeOf());
    expect(resolved?.displayName).toBe('telegram');
  });
});

const scope = (values: Record<string, string>) => scopeOf({ userConfig: { declared: {}, values } });

spec('channels.field.userConfig', () => {
  test('the channel options are the ones the dialog prompts for', async () => {
    const { resolved } = await resolveChannel(channel, plugin, scope({}));
    expect(resolved?.userConfig).toEqual({ bot_token: botToken });
  });

  test("the saved value substitutes into ${user_config.KEY} in the server's env, sensitive or not", async () => {
    const { resolved, issues } = await resolveChannel(
      channel,
      plugin,
      scope({ bot_token: '123:abc' }),
    );
    expect(issues).toEqual([]);
    expect(resolved?.mcp?.server).toMatchObject({
      command: 'node',
      env: { BOT_TOKEN: '123:abc' },
    });
  });

  test('without the channel declaring the option the reference is left as written', async () => {
    const { resolved } = await resolveChannel(
      { server: 'telegram' },
      plugin,
      scope({ bot_token: '123:abc' }),
    );
    expect(resolved?.mcp?.server).toMatchObject({ env: { BOT_TOKEN: '${user_config.bot_token}' } });
  });
});

describe('judgments (spec/judgments.md)', () => {
  test("a channel bound to a bundled server reads that bundle's settings, as resolveMcpServers does", async () => {
    const bundled = {
      mcpServers: { telegram },
      mcpBundles: { telegram: { userConfig: { bot_token: { ...botToken, required: true } } } },
    };
    const saved = scopeOf({
      userConfig: {
        declared: { bot_token: botToken },
        values: { bot_token: 'from-plugin', 'telegram.bot_token': 'from-bundle' },
      },
    });
    const { resolved } = await resolveChannel(channel, bundled, saved);
    expect(resolved?.mcp?.server).toMatchObject({ env: { BOT_TOKEN: 'from-bundle' } });
  });

  test('a channel bound to a bundled server that lacks a required setting has no server, with the verdict', async () => {
    const bundled = {
      mcpServers: { telegram },
      mcpBundles: { telegram: { userConfig: { bot_token: { ...botToken, required: true } } } },
    };
    const { resolved, issues } = await resolveChannel(channel, bundled, scope({}));
    expect(resolved?.mcp).toBeUndefined();
    expect(issues.map((found) => found.message)).toEqual([
      'Bundled MCP server "telegram" was not started: it needs configuration',
    ]);
  });

  test("a channel option wins over a top-level option of the same key in its server's env", async () => {
    const scope = scopeOf({
      userConfig: {
        declared: { bot_token: { type: 'string', title: 'Top', description: 'd' } },
        values: { bot_token: 'saved' },
      },
    });
    const { resolved } = await resolveChannel(channel, plugin, scope);
    expect(resolved?.mcp?.server).toMatchObject({ env: { BOT_TOKEN: 'saved' } });
    expect(resolved?.userConfig).toEqual({ bot_token: botToken });
  });
});
