/**
 * plugins/components.md § MCP servers (a `.mcp.json` in the shape of a project `.mcp.json`; the
 * `mcpServers` wrapper is optional), mcp.md § Plugin-provided MCP servers (stdio, SSE, HTTP and
 * WebSocket servers; `url`, `headers` and `headersHelper` on the remote ones), § Option 4 (the `ws`
 * entry accepts `url`, `headers`, `headersHelper`, `timeout` and `alwaysLoad`), plugins/troubleshooting.md
 * § Invalid MCP server config (`Invalid MCP server config for "<server>": <error>`), and mcp.md
 * § Option 2 (the `streamable-http` alias of `http`, a `url` with no `type`, a `type: "sdk"` entry).
 *
 * The docs give the transports and fields, not every way an entry is wrong, so these tests are
 * outside `spec(...)`: the requirement ids that own them (`mcp.source.*`) are proven in
 * mcp-sources.test.ts through the loader.
 */
import { describe, expect, test } from 'bun:test';
import { isRemoteMcpServer, readMcpConfig, readMcpServer } from '../../src/index.ts';

describe('transports and fields', () => {
  test('a stdio server needs a command; its type is optional', () => {
    const entry = {
      command: 'node',
      args: ['s.js'],
      env: { A: '1' },
      timeout: 5000,
      alwaysLoad: true,
    };
    expect(readMcpServer('db', entry, '.mcp.json').server).toEqual(entry);
    const typed = { type: 'stdio', command: 'node' } as const;
    expect(readMcpServer('db', typed, '.mcp.json').server).toEqual(typed);
  });

  test('sse, http and ws servers need a url and take headers and headersHelper', () => {
    for (const type of ['sse', 'http', 'ws'] as const) {
      const entry = {
        type,
        url: 'https://mcp.example.com',
        headers: { 'X-Key': 'v' },
        headersHelper: '/opt/bin/get-headers.sh',
        timeout: 1000,
        alwaysLoad: false,
      };
      const { server, issues } = readMcpServer('api', entry, '.mcp.json');
      expect(issues).toEqual([]);
      expect(server).toEqual(entry);
      expect(server !== undefined && isRemoteMcpServer(server)).toBe(true);
    }
  });

  test('fields the docs name elsewhere (oauth, tools) are kept untouched', () => {
    const entry = {
      type: 'http',
      url: 'https://mcp.example.com',
      oauth: { clientId: 'abc' },
    } as const;
    expect(readMcpServer('api', entry, '.mcp.json').server).toEqual(entry);
  });

  test('streamable-http is the http transport: it reads as http and keeps its other fields', () => {
    const entry = { type: 'streamable-http', url: 'https://mcp.example.com', alwaysLoad: true };
    const { server, issues } = readMcpServer('api', entry, '.mcp.json');
    expect(issues).toEqual([]);
    expect(server).toEqual({ ...entry, type: 'http' });
    expect(server !== undefined && isRemoteMcpServer(server)).toBe(true);
    expect(readMcpServer('api', { type: 'streamable-http' }, '.mcp.json').server).toBeUndefined();
  });

  test('a url with no type is skipped with the quoted message, whatever else the entry holds', () => {
    for (const entry of [
      { url: 'https://mcp.example.com' },
      { command: 'node', url: 'https://x.test' },
      { command: 'node', url: 5 },
    ]) {
      const { server, issues } = readMcpServer('db', entry, '.mcp.json');
      expect(server).toBeUndefined();
      expect(issues).toEqual([
        {
          severity: 'error',
          path: '.mcp.json',
          message:
            'MCP server "db" has a "url" but no "type"; add "type": "http" (or "sse" / "ws") to this entry',
        },
      ]);
    }
  });

  test('a stdio entry that names its type may carry a url key and stays stdio', () => {
    const entry = { type: 'stdio', command: 'node', url: 5 } as const;
    const { server, issues } = readMcpServer('db', entry, '.mcp.json');
    expect(issues).toEqual([]);
    expect(server).toEqual(entry);
    expect(server !== undefined && isRemoteMcpServer(server)).toBe(false);
  });

  test('a type: "sdk" entry is skipped with the quoted message', () => {
    const { server, issues } = readMcpServer('live', { type: 'sdk', name: 'live' }, '.mcp.json');
    expect(server).toBeUndefined();
    expect(issues).toEqual([
      {
        severity: 'error',
        path: '.mcp.json',
        message:
          'Skipped — MCP server "live" declares type "sdk", which only an SDK host application can register',
      },
    ]);
  });

  test('a stdio server is not remote', () => {
    const { server } = readMcpServer('db', { command: 'node' }, '.mcp.json');
    expect(server !== undefined && isRemoteMcpServer(server)).toBe(false);
  });

  test('wrong entries are errors that name the server, with the troubleshooting wording', () => {
    const wrong: [string, unknown][] = [
      ['not-an-object', 'node server.js'],
      ['no-command', { args: [] }],
      ['empty-command', { command: '' }],
      ['bad-args', { command: 'node', args: 'x' }],
      ['bad-env', { command: 'node', env: { A: 1 } }],
      ['no-url', { type: 'http' }],
      ['bad-headers', { type: 'sse', url: 'https://x.test', headers: ['a'] }],
      ['bad-helper', { type: 'ws', url: 'wss://x.test', headersHelper: 5 }],
      ['bad-type', { type: 'carrier-pigeon', command: 'node' }],
      ['bad-timeout', { command: 'node', timeout: 'soon' }],
    ];
    for (const [name, entry] of wrong) {
      const { server, issues } = readMcpServer(name, entry, '.mcp.json');
      expect(server).toBeUndefined();
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe('error');
      expect(issues[0]?.path).toBe('.mcp.json');
      expect(issues[0]?.message).toStartWith(`Invalid MCP server config for "${name}": `);
    }
  });
});

describe('a .mcp.json value', () => {
  const db = { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.js'] };

  test('the mcpServers wrapper is optional', () => {
    expect(readMcpConfig({ mcpServers: { db } }, '.mcp.json').servers).toEqual({ db });
    expect(readMcpConfig({ db }, '.mcp.json').servers).toEqual({ db });
  });

  test('a server that is itself called mcpServers is still a bare map', () => {
    expect(readMcpConfig({ mcpServers: db }, '.mcp.json').servers).toEqual({ mcpServers: db });
  });

  test('drops an invalid entry with an error and keeps the others', () => {
    const { servers, issues } = readMcpConfig({ db, broken: { args: [] } }, 'servers.json');
    expect(Object.keys(servers)).toEqual(['db']);
    expect(issues.map((found) => found.path)).toEqual(['servers.json']);
  });

  test('anything but an object is an error', () => {
    for (const value of [null, 'x', 5, [db]]) {
      const { servers, issues } = readMcpConfig(value, 'servers.json');
      expect(servers).toEqual({});
      expect(issues).toEqual([
        {
          severity: 'error',
          path: 'servers.json',
          message: 'MCP servers must be a JSON object keyed by server name',
        },
      ]);
    }
  });

  test('an empty wrapper is no servers and no issue', () => {
    expect(readMcpConfig({ mcpServers: {} }, '.mcp.json')).toEqual({ servers: {}, issues: [] });
  });
});
