/**
 * mcp.md § Option 1: Add a remote HTTP server (`type: "http"`, the `streamable-http` alias, a `url` with
 * no `type`, `type: "sdk"`), § Option 2: Add a remote SSE server (`type: "sse"`, headers), § Option 3: Add
 * a local stdio server (the entry, `CLAUDE_PROJECT_DIR`, the `${CLAUDE_PROJECT_DIR:-.}` default a
 * settings-scope entry needs and a plugin one does not), § Option 4: Add a remote WebSocket server (the
 * `ws` entry and its fields). The `claude mcp add` commands of the same sections are proven in
 * tests/format/mcp-add.test.ts, `add-json` in mcp-add-json.test.ts.
 */
import { expect, test } from 'bun:test';
import {
  expandMcpServer,
  isRemoteMcpServer,
  readMcpConfig,
  readMcpServer,
  resolveMcpServer,
} from '../../../src/index.ts';
import { PATHS, scopeOf } from '../../support/mcp-scope.ts';
import { spec } from '../../support/spec.ts';

const read = (entry: unknown) => readMcpServer('s', entry, '.mcp.json');

spec('mcp.behavior.Option 1: Add a remote HTTP server', () => {
  test('a type "http" entry with a url and headers is an HTTP server', () => {
    const entry = {
      type: 'http',
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer your-token' },
    } as const;
    const { server, issues } = read(entry);
    expect(issues).toEqual([]);
    expect(server).toEqual(entry);
    expect(server !== undefined && isRemoteMcpServer(server)).toBe(true);
  });

  test('in .mcp.json, ~/.claude.json and add-json the type field accepts streamable-http as an alias for http', () => {
    const { server, issues } = read({
      type: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
    });
    expect(issues).toEqual([]);
    expect(server).toEqual({ type: 'http', url: 'https://mcp.example.com/mcp' });
  });

  test('a JSON entry that has a url but no type is a configuration error and the server is skipped, with the quoted message', () => {
    const { server, issues } = read({ url: 'https://mcp.example.com/mcp' });
    expect(server).toBeUndefined();
    expect(issues.map((found) => found.message)).toEqual([
      'MCP server "s" has a "url" but no "type"; add "type": "http" (or "sse" / "ws") to this entry',
    ]);
  });

  test('Claude Code skips a "type": "sdk" entry in .mcp.json and reports the quoted message', () => {
    const { server, issues } = read({ type: 'sdk', name: 'in-process' });
    expect(server).toBeUndefined();
    expect(issues.map((found) => found.message)).toEqual([
      'Skipped — MCP server "s" declares type "sdk", which only an SDK host application can register',
    ]);
  });

  test('the other servers of the file still load when one is skipped', () => {
    const { servers, issues } = readMcpConfig(
      {
        mcpServers: {
          bad: { url: 'https://x.test' },
          sdk: { type: 'sdk' },
          good: { type: 'http', url: 'https://g.test/mcp' },
        },
      },
      '.mcp.json',
    );
    expect(Object.keys(servers)).toEqual(['good']);
    expect(issues).toHaveLength(2);
  });
});

spec('mcp.behavior.Option 2: Add a remote SSE server', () => {
  test('a type "sse" entry with a url and an authentication header is an SSE server', () => {
    const entry = {
      type: 'sse',
      url: 'https://api.company.com/sse',
      headers: { 'X-API-Key': 'your-key-here' },
    } as const;
    const { server, issues } = read(entry);
    expect(issues).toEqual([]);
    expect(server).toEqual(entry);
    expect(server !== undefined && isRemoteMcpServer(server)).toBe(true);
  });

  test('an sse entry needs its url', () => {
    expect(read({ type: 'sse' }).server).toBeUndefined();
  });
});

spec('mcp.behavior.Option 3: Add a local stdio server', () => {
  test('the stdio entry of the docs: command, args and env, typed or not', () => {
    const untyped = {
      command: 'npx',
      args: ['-y', 'airtable-mcp-server'],
      env: { AIRTABLE_API_KEY: 'YOUR_KEY' },
    };
    const entry = { type: 'stdio' as const, ...untyped };
    expect(read(entry)).toEqual({ server: entry, issues: [] });
    expect(read(untyped).server).toEqual(untyped);
  });

  test('in a settings-scope entry ${CLAUDE_PROJECT_DIR} needs a default, because the variable is not in Claude Code own environment', () => {
    const shell = (name: string) => (name === 'HOME' ? '/home/me' : undefined);
    const bare = expandMcpServer('s', { command: '${CLAUDE_PROJECT_DIR}/srv' }, shell);
    expect(bare.server).toEqual({ command: '${CLAUDE_PROJECT_DIR}/srv' });
    expect(bare.missing).toEqual(['CLAUDE_PROJECT_DIR']);
    const defaulted = expandMcpServer(
      's',
      { command: 'node', args: ['${CLAUDE_PROJECT_DIR:-.}/srv.js'] },
      shell,
    );
    expect(defaulted.server).toEqual({ command: 'node', args: ['./srv.js'] });
    expect(defaulted.missing).toEqual([]);
  });

  test('a plugin-provided configuration substitutes ${CLAUDE_PROJECT_DIR} directly and needs no default', async () => {
    const { resolved, issues } = await resolveMcpServer(
      'db',
      { command: 'node', args: ['${CLAUDE_PROJECT_DIR}/srv.js'] },
      scopeOf(),
    );
    expect(issues).toEqual([]);
    expect(resolved?.server).toEqual({ command: 'node', args: ['/work/app/srv.js'] });
  });

  test('the spawned plugin server also gets CLAUDE_PROJECT_DIR in its environment, the project root', async () => {
    const { resolved } = await resolveMcpServer('db', { command: 'node' }, scopeOf());
    expect(resolved?.environment.CLAUDE_PROJECT_DIR).toBe(PATHS.CLAUDE_PROJECT_DIR);
  });
});

spec('mcp.behavior.Option 4: Add a remote WebSocket server', () => {
  test('a type "ws" entry takes the url, headers, headersHelper, timeout and alwaysLoad fields of http', () => {
    const entry = {
      type: 'ws',
      url: 'wss://mcp.example.com/socket',
      headers: { Authorization: 'Bearer YOUR_TOKEN' },
      headersHelper: '/opt/bin/mint-token',
      timeout: 5_000,
      alwaysLoad: true,
    } as const;
    const { server, issues } = read(entry);
    expect(issues).toEqual([]);
    expect(server).toEqual(entry);
    expect(server !== undefined && isRemoteMcpServer(server)).toBe(true);
  });

  test('authentication is header-only: a static token in headers, or a headersHelper that produces one at connect time', async () => {
    const { resolved } = await resolveMcpServer(
      'events',
      {
        type: 'ws',
        url: 'wss://mcp.example.com/socket',
        headers: { Authorization: 'Bearer ${user_config.api_token}' },
        headersHelper: '${CLAUDE_PLUGIN_ROOT}/bin/mint-token',
      },
      scopeOf(),
    );
    expect(resolved?.server).toMatchObject({
      headers: { Authorization: 'Bearer s3cret' },
      headersHelper: '/plugins/my-plugin@acme-tools/bin/mint-token',
    });
    expect(resolved?.headersHelperEnvironment).toBeDefined();
  });

  test('a ws entry with no url is dropped', () => {
    expect(read({ type: 'ws' }).server).toBeUndefined();
  });
});
