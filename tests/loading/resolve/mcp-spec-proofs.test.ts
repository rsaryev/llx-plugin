/**
 * mcp.md § Plugin-provided MCP servers (the `.mcp.json` and inline examples, the four transports, the
 * path placeholders and where they apply, the same environment as manually configured servers, the
 * redaction of `claude mcp get`, the plugin tool names, the lifecycle across reloads), plugins/
 * components.md § MCP servers (the shape, the optional wrapper, `plugin:my-plugin:db`, `claude plugin
 * validate`, the `mcpServers` manifest key and its precedence), § Server names, tool names, and reloads
 * and § Include a packaged MCPB server. The messages of plugins/troubleshooting.md are in
 * mcp-troubleshooting-proofs.test.ts, the transports in mcp-transport-proofs.test.ts. Behaviour the
 * docs do not state is a judgment (spec/judgments.md), asserted outside `spec(...)`.
 */
import { expect, test } from 'bun:test';
import {
  collectMcpServers,
  expandMcpServer,
  planMcpReload,
  readMcpConfig,
  redactPluginServer,
  type PluginMcpServer,
} from '../../../src/entry/format.ts';
import { matchesMatcher, mcpToolName, pluginMcpServerName } from '../../../src/entry/rules.ts';
import { mcpServerKey, resolveMcpServer } from '../../../src/entry/loading.ts';
import { PATHS, scopeOf } from '../../support/mcp-scope.ts';
import { fakeEnvironment, memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const DOCS_JSON = {
  mcpServers: {
    'database-tools': {
      command: '${CLAUDE_PLUGIN_ROOT}/servers/db-server',
      args: ['--config', '${CLAUDE_PLUGIN_ROOT}/config.json'],
      env: { DB_URL: '${DB_URL}' },
    },
  },
};

spec('mcp.behavior.Plugin-provided MCP servers', () => {
  test('the .mcp.json example at the plugin root defines the server, and so does the inline example of plugin.json', async () => {
    const fromFile = await collectMcpServers(
      memoryFiles({ '.mcp.json': JSON.stringify(DOCS_JSON) }),
      undefined,
    );
    expect(fromFile.issues).toEqual([]);
    expect(Object.keys(fromFile.servers)).toEqual(['database-tools']);
    const inline = {
      'plugin-api': {
        command: '${CLAUDE_PLUGIN_ROOT}/servers/api-server',
        args: ['--port', '8080'],
      },
    };
    const fromManifest = await collectMcpServers(memoryFiles({}), inline);
    expect(fromManifest.servers).toEqual(inline);
  });

  test('the server registers as plugin:<plugin-name>:<server-name>, the name /mcp shows and an mcp_tool hook names', () => {
    expect(mcpServerKey('my-plugin', 'database-tools')).toBe('plugin:my-plugin:database-tools');
  });

  test('its tools are mcp__plugin_<plugin-name>_<server-name>__<tool-name>, any character outside A-Z a-z 0-9 _ - replaced with _', () => {
    const server = pluginMcpServerName('my-plugin', 'database-tools');
    expect(mcpToolName(server, 'query')).toBe('mcp__plugin_my-plugin_database-tools__query');
    expect(mcpToolName(pluginMcpServerName('my plugin', 'db.tools'), 'query')).toBe(
      'mcp__plugin_my_plugin_db_tools__query',
    );
  });

  test('a hook matcher written against the bare server key never fires for a plugin-bundled server', () => {
    const tool = mcpToolName(pluginMcpServerName('my-plugin', 'database-tools'), 'query');
    expect(matchesMatcher('mcp__database-tools__.*', tool)).toBe(false);
    expect(matchesMatcher('mcp__plugin_my-plugin_database-tools__.*', tool)).toBe(true);
  });
});

spec('mcp.behavior.Plugin-provided MCP servers.Automatic lifecycle', () => {
  const server = (arg: string): PluginMcpServer => ({ command: 'node', args: [arg] });

  test('when you reload, the live connections of plugin servers whose configuration is unchanged are kept', () => {
    const before = { 'plugin:p:a': server('a.js'), 'plugin:p:b': server('b.js') };
    const plan = planMcpReload(before, { ...before });
    expect(plan).toEqual({
      keep: ['plugin:p:a', 'plugin:p:b'],
      reconnect: [],
      connect: [],
      disconnect: [],
    });
  });

  test('a server whose configuration changed reconnects; one that was removed disconnects; a new one connects', () => {
    const plan = planMcpReload(
      { a: server('a.js'), gone: server('g.js'), same: server('s.js') },
      { a: server('a2.js'), same: server('s.js'), added: server('n.js') },
    );
    expect(plan).toEqual({
      keep: ['same'],
      reconnect: ['a'],
      connect: ['added'],
      disconnect: ['gone'],
    });
  });

  test('enabling a plugin connects its servers at once and disabling one disconnects them', () => {
    expect(planMcpReload({}, { a: server('a.js') }).connect).toEqual(['a']);
    expect(planMcpReload({ a: server('a.js') }, {}).disconnect).toEqual(['a']);
  });
});

spec('mcp.behavior.Plugin-provided MCP servers.Multiple transport types', () => {
  test('stdio, SSE, HTTP and WebSocket servers load from one file', () => {
    const { servers, issues } = readMcpConfig(
      {
        mcpServers: {
          local: { command: 'node' },
          events: { type: 'sse', url: 'https://x.test/sse' },
          api: { type: 'http', url: 'https://x.test/mcp' },
          socket: { type: 'ws', url: 'wss://x.test/s' },
        },
      },
      '.mcp.json',
    );
    expect(issues).toEqual([]);
    expect(Object.keys(servers)).toEqual(['local', 'events', 'api', 'socket']);
  });
});

spec('mcp.behavior.Plugin-provided MCP servers.Path placeholders', () => {
  test('${CLAUDE_PLUGIN_ROOT}, ${CLAUDE_PLUGIN_DATA} and ${CLAUDE_PROJECT_DIR} resolve in the command, args and env of a stdio server', async () => {
    const { resolved, issues } = await resolveMcpServer(
      'db',
      {
        command: '${CLAUDE_PLUGIN_ROOT}/bin/db',
        args: ['${CLAUDE_PLUGIN_DATA}/state', '${CLAUDE_PROJECT_DIR}'],
        env: {
          ROOT: '${CLAUDE_PLUGIN_ROOT}',
          DATA: '${CLAUDE_PLUGIN_DATA}',
          PROJECT: '${CLAUDE_PROJECT_DIR}',
        },
      },
      scopeOf(),
    );
    expect(issues).toEqual([]);
    expect(resolved?.server).toEqual({
      command: `${PATHS.CLAUDE_PLUGIN_ROOT}/bin/db`,
      args: [`${PATHS.CLAUDE_PLUGIN_DATA}/state`, PATHS.CLAUDE_PROJECT_DIR],
      env: {
        ROOT: PATHS.CLAUDE_PLUGIN_ROOT,
        DATA: PATHS.CLAUDE_PLUGIN_DATA,
        PROJECT: PATHS.CLAUDE_PROJECT_DIR,
      },
    });
  });

  test('they resolve in the url, headers and headersHelper of an http, sse and ws server', async () => {
    for (const type of ['http', 'sse', 'ws'] as const) {
      const { resolved, issues } = await resolveMcpServer(
        'api',
        {
          type,
          url: 'https://x.test/${CLAUDE_PROJECT_DIR}',
          headers: { 'X-Root': '${CLAUDE_PLUGIN_ROOT}', 'X-Data': '${CLAUDE_PLUGIN_DATA}' },
          headersHelper: '${CLAUDE_PLUGIN_ROOT}/bin/headers',
        },
        scopeOf(),
      );
      expect(issues).toEqual([]);
      expect(resolved?.server).toEqual({
        type,
        url: 'https://x.test//work/app',
        headers: { 'X-Root': PATHS.CLAUDE_PLUGIN_ROOT, 'X-Data': PATHS.CLAUDE_PLUGIN_DATA },
        headersHelper: `${PATHS.CLAUDE_PLUGIN_ROOT}/bin/headers`,
      });
    }
  });

  test('they apply to no other field: a value in an unlisted field stays as written', async () => {
    // A variable, not a literal: a field no server type lists is not an excess-property error.
    const entry = { command: 'node', description: '${CLAUDE_PLUGIN_ROOT}' };
    const { resolved } = await resolveMcpServer('db', entry, scopeOf());
    expect(resolved?.server).toMatchObject({ description: '${CLAUDE_PLUGIN_ROOT}' });
  });
});

spec('mcp.behavior.Plugin-provided MCP servers.User environment access', () => {
  const lookup = (name: string) => (name === 'DB_URL' ? 'postgres://db' : undefined);
  const server = DOCS_JSON.mcpServers['database-tools'];

  test('a plugin server reads the same environment variables as a manually configured one: the docs example DB_URL', async () => {
    const plugin = await resolveMcpServer('database-tools', server, scopeOf());
    const manual = expandMcpServer('database-tools', { command: 'node', env: server.env }, lookup);
    expect(plugin.resolved?.server).toMatchObject({ env: { DB_URL: 'postgres://db' } });
    expect(manual.server).toMatchObject({ env: { DB_URL: 'postgres://db' } });
  });

  test('both read the default of ${VAR:-default}, and an empty value counts as set, the same way', async () => {
    const entry = { command: 'node', env: { A: '${UNSET:-fallback}', B: '${EMPTY:-fallback}' } };
    const manual = expandMcpServer('s', entry, (name) => (name === 'EMPTY' ? '' : undefined));
    const plugin = await resolveMcpServer(
      's',
      entry,
      scopeOf({ environment: fakeEnvironment({ EMPTY: '' }) }),
    );
    expect(plugin.resolved?.server).toEqual(manual.server);
    expect(plugin.resolved?.server).toMatchObject({ env: { A: 'fallback', B: '' } });
  });
});

spec('mcp.behavior.Plugin-provided MCP servers.stdio server', () => {
  test('claude mcp get prints Command: stdio, an empty Args: line and each environment variable as NAME=[REDACTED]', () => {
    expect(
      redactPluginServer({
        command: '/plugins/p/bin/db',
        args: ['--token', 'abc123'],
        env: { DB_URL: 'postgres://u:p@h/db', API_KEY: 'k' },
      }),
    ).toEqual({ get: ['Command: stdio', 'Args:', 'DB_URL=[REDACTED]', 'API_KEY=[REDACTED]'] });
  });

  test('a server with no env prints the first two lines only, and nothing of the command or args leaks', () => {
    const view = redactPluginServer({ command: 'secret-cmd', args: ['secret-arg'] });
    expect(view?.get).toEqual(['Command: stdio', 'Args:']);
    expect(JSON.stringify(view)).not.toContain('secret');
  });
});

spec('mcp.behavior.Plugin-provided MCP servers.WebSocket server', () => {
  test('claude mcp get prints URL: ws and each header as <name>: [REDACTED]; claude mcp list shows ws in place of the URL', () => {
    const view = redactPluginServer({
      type: 'ws',
      url: 'wss://mcp.example.com/socket?token=abc',
      headers: { Authorization: 'Bearer abc', 'X-Key': 'k' },
    });
    expect(view).toEqual({
      get: ['URL: ws', 'Authorization: [REDACTED]', 'X-Key: [REDACTED]'],
      list: 'ws',
    });
    expect(JSON.stringify(view)).not.toContain('abc');
  });

  test('the values of a plugin http or sse server are not among those the docs hide', () => {
    expect(redactPluginServer({ type: 'http', url: 'https://x.test/mcp' })).toBeUndefined();
    expect(redactPluginServer({ type: 'sse', url: 'https://x.test/sse' })).toBeUndefined();
  });
});
