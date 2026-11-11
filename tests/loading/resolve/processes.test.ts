/**
 * What loading hands the host to start (plugins/manifest-reference.md § Where each variable resolves,
 * § Fields that run through a shell; mcp.md § Plugin-provided MCP servers; plugins/components.md
 * § Monitors): `resolveProcesses` runs each declared MCP server, language server and monitor through its
 * resolver. The per-component rules are proven in their own tests; these prove the composition: one
 * result for the plugin, an entry that must not start is left out with its issue, the others unaffected.
 * Nothing here is a requirement of its own: the kit never spawns, the host starts what it is given.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../../src/index.ts';
import { resolveProcesses } from '../../../src/entry/loading.ts';
import { json } from '../../support/plugin-folder.ts';
import { scopeOf } from '../../support/mcp-scope.ts';
import { memoryFiles } from '../../support/ports.ts';

const PLUGIN = {
  '.claude-plugin/plugin.json': json({
    name: 'my-plugin',
    userConfig: { region: { type: 'string', title: 'Region', description: 'Region' } },
  }),
  '.mcp.json': json({
    mcpServers: {
      db: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/db.js'] },
      remote: { type: 'http', url: 'https://example.com/mcp' },
    },
  }),
  '.lsp.json': json({
    go: { command: 'gopls', args: ['serve'], extensionToLanguage: { '.go': 'go' } },
  }),
  'monitors/monitors.json': json([
    { name: 'errors', command: 'tail -F ${CLAUDE_PLUGIN_DATA}/error.log', description: 'Errors' },
    { name: 'leaky', command: 'echo ${user_config.region}', description: 'Leaks an option' },
  ]),
};

const load = async (tree: Record<string, string>) => {
  const { plugin } = await loadPlugin({ files: memoryFiles(tree) });
  if (!plugin) throw new Error('the plugin did not load');
  return plugin;
};

describe('resolveProcesses', () => {
  test('resolves every declared server and monitor for this host', async () => {
    const resolved = await resolveProcesses(await load(PLUGIN), scopeOf({ shellPaths: 'pasted' }));
    expect(Object.keys(resolved.mcpServers).toSorted()).toEqual(['db', 'remote']);
    expect(resolved.mcpServers.db?.server).toEqual({
      command: 'node',
      args: ['/plugins/my-plugin@acme-tools/db.js'],
    });
    expect(resolved.mcpServers.db?.key).toBe('plugin:my-plugin:db');
    expect(resolved.lspServers.go?.command).toBe('gopls');
    expect(resolved.lspServers.go?.args).toEqual(['serve']);
    expect(resolved.monitors.map((one) => [one.name, one.command])).toEqual([
      ['errors', 'tail -F /data/my-plugin-acme-tools/error.log'],
    ]);
  });

  test('a monitor that references user_config does not start: it is left out and its issue is reported', async () => {
    const resolved = await resolveProcesses(await load(PLUGIN), scopeOf());
    expect(resolved.monitors.map((one) => one.name)).toEqual(['errors']);
    expect(resolved.issues).toHaveLength(1);
    expect(resolved.issues[0]?.severity).toBe('error');
    expect(resolved.issues[0]?.message).toContain('Monitor "leaky"');
  });

  test('an MCP server whose headersHelper references user_config is left out; the other servers still resolve', async () => {
    const plugin = await load({
      '.mcp.json': json({
        mcpServers: {
          bad: {
            type: 'http',
            url: 'https://example.com/mcp',
            headersHelper: 'print-headers ${user_config.api_token}',
          },
          good: { command: 'node' },
        },
      }),
      '.claude-plugin/plugin.json': json({ name: 'my-plugin' }),
    });
    const resolved = await resolveProcesses(plugin, scopeOf());
    expect(Object.keys(resolved.mcpServers)).toEqual(['good']);
    expect(resolved.issues).toHaveLength(1);
  });

  test('a plugin with no processes resolves to nothing', async () => {
    const plugin = await load({ '.claude-plugin/plugin.json': json({ name: 'my-plugin' }) });
    expect(await resolveProcesses(plugin, scopeOf())).toEqual({
      mcpServers: {},
      lspServers: {},
      monitors: [],
      issues: [],
    });
  });

  test('every process is resolved against the scope it is given: the same plugin under two roots', async () => {
    const plugin = await load(PLUGIN);
    const first = await resolveProcesses(plugin, scopeOf());
    const second = await resolveProcesses(plugin, scopeOf({ pluginId: 'my-plugin@other' }));
    expect(first.mcpServers.db?.server).not.toEqual(second.mcpServers.db?.server);
  });

  test("a server a channel binds to takes the channel's saved option in its env", async () => {
    const plugin = await load({
      '.claude-plugin/plugin.json': json({
        name: 'my-plugin',
        mcpServers: {
          telegram: { command: 'node', env: { BOT_TOKEN: '${user_config.bot_token}' } },
          other: { command: 'node', env: { BOT_TOKEN: '${user_config.bot_token}' } },
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
    const scope = scopeOf({ userConfig: { declared: {}, values: { bot_token: 'tg-123' } } });
    const resolved = await resolveProcesses(plugin, scope);
    expect(resolved.mcpServers.telegram?.server).toMatchObject({ env: { BOT_TOKEN: 'tg-123' } });
    expect(resolved.mcpServers.other?.server).toMatchObject({
      env: { BOT_TOKEN: '${user_config.bot_token}' },
    });
    expect(resolved.issues.map((one) => one.path)).toEqual(['mcpServers.other.env.BOT_TOKEN']);
  });
});
