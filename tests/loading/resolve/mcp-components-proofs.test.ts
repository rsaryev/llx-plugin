/**
 * plugins/components.md § MCP servers (the shape, the optional wrapper, `plugin:my-plugin:db`, `claude plugin
 * validate`, the `mcpServers` manifest key and its precedence), § Server names, tool names, and reloads and
 * § Include a packaged MCPB server. The plugin-provided servers of mcp.md are in mcp-spec-proofs.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  collectMcpServers,
  configFlagApplies,
  planMcpReload,
  readConfigFlag,
  type PluginMcpServer,
} from '../../../src/entry/format.ts';
import { matchesMatcher, mcpToolName, pluginMcpServerName } from '../../../src/entry/rules.ts';
import { mcpServerKey, resolveMcpServer } from '../../../src/entry/loading.ts';
import { validatePlugin } from '../../../src/index.ts';
import { bundle, fakeBundles, node } from '../../support/mcp-bundle.ts';
import { PATHS, scopeOf } from '../../support/mcp-scope.ts';
import { memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

spec('mcp.components.MCP servers', () => {
  test('.mcp.json at the plugin root holds the server in the shape of a project .mcp.json, here the db server of the docs', async () => {
    const docs = {
      mcpServers: { db: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.js'] } },
    };
    const { servers, issues } = await collectMcpServers(
      memoryFiles({ '.mcp.json': JSON.stringify(docs) }),
      undefined,
    );
    expect(issues).toEqual([]);
    expect(servers).toEqual(docs.mcpServers);
  });

  test('the mcpServers wrapper can be omitted: db at the top level of the file', async () => {
    const { servers } = await collectMcpServers(
      memoryFiles({ '.mcp.json': JSON.stringify({ db: { command: 'node', args: ['s.js'] } }) }),
      undefined,
    );
    expect(Object.keys(servers)).toEqual(['db']);
  });

  test('the loaded plugin shows the server as plugin:my-plugin:db', async () => {
    const { resolved } = await resolveMcpServer(
      'db',
      { command: 'node' },
      scopeOf({ pluginId: 'my-plugin' }),
    );
    expect(resolved?.key).toBe('plugin:my-plugin:db');
  });

  test('claude plugin validate reports a server entry Claude Code would drop at load time as an error', async () => {
    const report = await validatePlugin({
      files: memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify({
          name: 'demo',
          version: '1.0.0',
          description: 'D',
          author: { name: 'A' },
        }),
        '.mcp.json': JSON.stringify({
          mcpServers: { db: { url: 'https://x.test' }, ok: { command: 'node' } },
        }),
      }),
    });
    expect(report.issues.map((found) => [found.severity, found.file, found.path])).toEqual([
      ['error', '.mcp.json', 'mcpServers.db.type'],
    ]);
  });

  test('the mcpServers manifest key takes an inline server map, a path to a JSON file, or an array of those', async () => {
    const files = memoryFiles({
      'servers/extra.json': JSON.stringify({ mcpServers: { file: node('f.js') } }),
    });
    const inline = await collectMcpServers(files, { inline: node('i.js') });
    const path = await collectMcpServers(files, './servers/extra.json');
    const both = await collectMcpServers(files, [{ inline: node('i.js') }, './servers/extra.json']);
    expect(Object.keys(inline.servers)).toEqual(['inline']);
    expect(Object.keys(path.servers)).toEqual(['file']);
    expect(Object.keys(both.servers)).toEqual(['inline', 'file']);
  });

  test('when a manifest server has the same name as one in .mcp.json, the manifest server replaces it', async () => {
    const files = memoryFiles({
      '.mcp.json': JSON.stringify({ mcpServers: { db: node('old.js') } }),
    });
    const { servers } = await collectMcpServers(files, { db: node('new.js') });
    expect(servers).toEqual({ db: node('new.js') });
  });
});

spec('mcp.components.Server names, tool names, and reloads.Server name', () => {
  test('plugin:<plugin>:<server>: the db server in my-plugin is plugin:my-plugin:db', () => {
    expect(mcpServerKey('my-plugin', 'db')).toBe('plugin:my-plugin:db');
  });
});

spec('mcp.components.Server names, tool names, and reloads.Tool names', () => {
  test('a query tool on the db server of my-plugin is mcp__plugin_my-plugin_db__query, the name for permission rules and hook matchers', () => {
    const name = mcpToolName(pluginMcpServerName('my-plugin', 'db'), 'query');
    expect(name).toBe('mcp__plugin_my-plugin_db__query');
    expect(matchesMatcher('mcp__plugin_my-plugin_db__query', name)).toBe(true);
    expect(matchesMatcher('mcp__plugin_my-plugin_db__.*', name)).toBe(true);
  });
});

spec('mcp.components.Server names, tool names, and reloads.Substitution', () => {
  test('${CLAUDE_PLUGIN_ROOT} and the other path variables are substituted in command, args and env', async () => {
    const { resolved } = await resolveMcpServer(
      'db',
      {
        command: '${CLAUDE_PLUGIN_ROOT}/bin/db',
        args: ['${CLAUDE_PLUGIN_DATA}', '${CLAUDE_PROJECT_DIR}'],
        env: { ROOT: '${CLAUDE_PLUGIN_ROOT}' },
      },
      scopeOf(),
    );
    expect(resolved?.server).toEqual({
      command: `${PATHS.CLAUDE_PLUGIN_ROOT}/bin/db`,
      args: [PATHS.CLAUDE_PLUGIN_DATA, PATHS.CLAUDE_PROJECT_DIR],
      env: { ROOT: PATHS.CLAUDE_PLUGIN_ROOT },
    });
  });

  test('no quoting is needed in args: each element is one argument, whatever the substituted path holds', async () => {
    const root = '/plugins/my plugin; rm -rf "x" $HOME';
    const { resolved } = await resolveMcpServer(
      'db',
      { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.js', '--flag'] },
      scopeOf({ locations: { ...scopeOf().locations, pluginRoot: () => root } }),
    );
    expect(resolved?.server).toEqual({ command: 'node', args: [`${root}/server.js`, '--flag'] });
  });
});

spec('mcp.components.Server names, tool names, and reloads.Reload', () => {
  test('after /reload-plugins a server whose configuration is unchanged keeps its connection; a changed one reconnects; a removed one disconnects', () => {
    const a: PluginMcpServer = { command: 'node', args: ['a.js'] };
    const plan = planMcpReload(
      { keeps: a, changes: a, removed: a },
      { keeps: { ...a }, changes: { command: 'node', args: ['b.js'] } },
    );
    expect(plan).toMatchObject({
      keep: ['keeps'],
      reconnect: ['changes'],
      disconnect: ['removed'],
    });
  });

  test('the same configuration written in another key order is unchanged', () => {
    const left: PluginMcpServer = { command: 'node', args: ['a'], env: { X: '1', Y: '2' } };
    const right: PluginMcpServer = { env: { Y: '2', X: '1' }, args: ['a'], command: 'node' };
    expect(planMcpReload({ s: left }, { s: right }).keep).toEqual(['s']);
  });
});

spec('mcp.components.Include a packaged MCPB server', () => {
  const settings = { token: { required: true } };

  test('the mcpServers key accepts a .mcpb file as a path inside the plugin, the server taking the name in the bundle manifest', async () => {
    const reader = fakeBundles({ 'servers/db.mcpb': bundle('database') });
    const { servers, issues } = await collectMcpServers(memoryFiles({}), './servers/db.mcpb', {
      bundles: reader,
    });
    expect(issues).toEqual([]);
    expect(Object.keys(servers)).toEqual(['database']);
    expect(reader.opens[0]?.source).toEqual({ kind: 'path', path: 'servers/db.mcpb' });
  });

  test('the older .dxt extension and an https:// URL are accepted too', async () => {
    const reader = fakeBundles({
      'servers/db.dxt': bundle('old'),
      'https://example.com/db.mcpb': bundle('remote'),
    });
    const dxt = await collectMcpServers(memoryFiles({}), './servers/db.dxt', { bundles: reader });
    const url = await collectMcpServers(memoryFiles({}), 'https://example.com/db.mcpb', {
      bundles: reader,
    });
    expect(Object.keys(dxt.servers)).toEqual(['old']);
    expect(Object.keys(url.servers)).toEqual(['remote']);
  });

  test('a bundled server with a required setting that has no saved value does not start, and the plugin other servers do', async () => {
    const reader = fakeBundles({ 'db.mcpb': bundle('database', settings) });
    const { servers, issues } = await collectMcpServers(
      memoryFiles({ '.mcp.json': JSON.stringify({ mcpServers: { other: node('o.js') } }) }),
      './db.mcpb',
      { bundles: reader },
    );
    expect(Object.keys(servers)).toEqual(['other']);
    expect(issues.map((found) => found.message)).toEqual([
      'Bundled MCP server "database" was not started: it needs configuration',
    ]);
  });

  test('with the value saved the server starts', async () => {
    const reader = fakeBundles({ 'db.mcpb': bundle('database', settings) });
    const { servers, issues } = await collectMcpServers(memoryFiles({}), './db.mcpb', {
      bundles: reader,
      bundleSettings: { database: { token: 'abc' } },
    });
    expect(issues).toEqual([]);
    expect(Object.keys(servers)).toEqual(['database']);
  });

  test('--config <server>.<key>=<value> sets a setting of a bundled server, for a bundle packaged inside the plugin only', () => {
    expect(readConfigFlag('database.token=abc')).toEqual({
      server: 'database',
      key: 'token',
      value: 'abc',
    });
    expect(configFlagApplies({ kind: 'path', path: 'servers/db.mcpb' })).toBe(true);
    expect(configFlagApplies({ kind: 'url', url: 'https://example.com/db.mcpb' })).toBe(false);
  });

  test('a key with no server is a plugin userConfig option; the value keeps its own = signs; a flag with no = is refused', () => {
    expect(readConfigFlag('region=eu')).toEqual({ key: 'region', value: 'eu' });
    expect(readConfigFlag('database.url=https://x.test/?a=b')).toEqual({
      server: 'database',
      key: 'url',
      value: 'https://x.test/?a=b',
    });
    for (const bad of ['region', '=x', '.key=x', 'server.=x']) {
      expect(readConfigFlag(bad)).toMatchObject({ severity: 'error' });
    }
  });
});

describe('what the docs leave open', () => {
  test('a value for a bundled setting counts only when it is not undefined', async () => {
    const reader = fakeBundles({ 'db.mcpb': bundle('database', { token: { required: true } }) });
    const { issues } = await collectMcpServers(memoryFiles({}), './db.mcpb', {
      bundles: reader,
      bundleSettings: { database: { token: undefined } },
    });
    expect(issues).toHaveLength(1);
  });
});
