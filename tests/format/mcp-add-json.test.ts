/**
 * mcp.md § Add MCP servers from JSON configuration (`claude mcp add-json <name> '<json>'`, the three
 * examples, `--scope`, the `--client-secret` flag next to an `oauth` object), § Option 4 (a `ws`
 * server is added with add-json), § Add a server from an `mcpServers` JSON block (pass the object
 * inside `mcpServers`; a `url` with no `type`; a name of letters, numbers, hyphens and underscores),
 * § Use pre-configured OAuth credentials (the secret from the prompt or `MCP_CLIENT_SECRET`, only
 * with `--client-secret`). Wording the docs do not quote is a judgment and is asserted outside
 * `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { readMcpAddJson } from '../../src/entry/format.ts';
import { spec } from '../support/spec.ts';

const none = (): undefined => undefined;

spec('mcp.behavior.Add MCP servers from JSON configuration', () => {
  test('the HTTP example: type, url and headers become the server entry, in local scope by default', () => {
    const json =
      '{"type":"http","url":"https://api.weather.com/mcp","headers":{"Authorization":"Bearer token"}}';
    const read = readMcpAddJson('weather-api', json, {}, none);
    expect(read.issues).toEqual([]);
    expect(read.name).toBe('weather-api');
    expect(read.scope).toBe('local');
    expect(read.server).toEqual({
      type: 'http',
      url: 'https://api.weather.com/mcp',
      headers: { Authorization: 'Bearer token' },
    });
  });

  test('the stdio example: command, args and env', () => {
    const json =
      '{"type":"stdio","command":"/path/to/weather-cli","args":["--api-key","abc123"],"env":{"CACHE_DIR":"/tmp"}}';
    expect(readMcpAddJson('local-weather', json, {}, none).server).toEqual({
      type: 'stdio',
      command: '/path/to/weather-cli',
      args: ['--api-key', 'abc123'],
      env: { CACHE_DIR: '/tmp' },
    });
  });

  test('the OAuth example: the oauth object is read as the pre-registered client and the secret is asked for', () => {
    const json =
      '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"your-client-id","callbackPort":8080}}';
    const read = readMcpAddJson('my-server', json, { clientSecret: true }, none);
    expect(read.issues).toEqual([]);
    expect(read.oauth).toEqual({ clientId: 'your-client-id', callbackPort: 8080 });
    expect(read.secret).toEqual({ source: 'prompt' });
    expect(read.server).toMatchObject({
      oauth: { clientId: 'your-client-id', callbackPort: 8080 },
    });
  });

  test('--scope picks user or project; local is the default; another scope is refused', () => {
    const json = '{"command":"node"}';
    expect(readMcpAddJson('s', json, { scope: 'user' }, none).scope).toBe('user');
    expect(readMcpAddJson('s', json, { scope: 'project' }, none).scope).toBe('project');
    const bad = readMcpAddJson('s', json, { scope: 'global' }, none);
    expect(bad.server).toBeUndefined();
    expect(bad.issues[0]?.severity).toBe('error');
    expect(bad.issues[0]?.message).toContain('"local", "project" or "user"');
  });

  test('JSON that does not parse, or is not an object, adds nothing', () => {
    for (const json of ['{"command":', '[]', '"node"', 'null', '']) {
      const read = readMcpAddJson('s', json, {}, none);
      expect(read.server).toBeUndefined();
      expect(read.issues).toHaveLength(1);
      expect(read.issues[0]?.severity).toBe('error');
    }
  });

  test('the JSON must conform to the server schema: a stdio entry with no command is refused with the quoted wording', () => {
    const read = readMcpAddJson('s', '{"type":"stdio"}', {}, none);
    expect(read.server).toBeUndefined();
    expect(read.issues[0]?.message).toMatch(/^Invalid MCP server config for "s": /);
  });

  test('a url with no type is the documented configuration error', () => {
    const read = readMcpAddJson('s', '{"url":"https://mcp.example.com/mcp"}', {}, none);
    expect(read.server).toBeUndefined();
    expect(read.issues[0]?.message).toBe(
      'MCP server "s" has a "url" but no "type"; add "type": "http" (or "sse" / "ws") to this entry',
    );
  });

  test('the whole mcpServers block is not accepted: add-json takes the object inside it', () => {
    const read = readMcpAddJson(
      'example',
      '{"mcpServers":{"example":{"command":"npx"}}}',
      {},
      none,
    );
    expect(read.server).toBeUndefined();
    expect(read.issues[0]?.message).toContain('the object inside "mcpServers"');
  });

  test('a name with characters other than letters, numbers, hyphens and underscores is refused', () => {
    for (const name of ['my server', 'a.b', 'a/b', '', 'naïve']) {
      const read = readMcpAddJson(name, '{"command":"node"}', {}, none);
      expect(read.server).toBeUndefined();
      expect(read.issues[0]?.message).toContain('letters, numbers, hyphens and underscores');
    }
    expect(readMcpAddJson('Okay_name-2', '{"command":"node"}', {}, none).server).toBeDefined();
  });
});

spec('mcp.behavior.Option 4: Add a remote WebSocket server', () => {
  const json =
    '{"type":"ws","url":"wss://mcp.example.com/socket","headers":{"Authorization":"Bearer YOUR_TOKEN"}}';

  test('the docs add-json example adds a ws server with its headers', () => {
    const read = readMcpAddJson('events-server', json, {}, none);
    expect(read.issues).toEqual([]);
    expect(read.server).toEqual({
      type: 'ws',
      url: 'wss://mcp.example.com/socket',
      headers: { Authorization: 'Bearer YOUR_TOKEN' },
    });
  });

  test('url, headers, headersHelper, timeout and alwaysLoad are the fields the entry accepts', () => {
    const entry = {
      type: 'ws' as const,
      url: 'wss://mcp.example.com/socket',
      headers: { 'X-Key': 'k' },
      headersHelper: './headers.sh',
      timeout: 5000,
      alwaysLoad: true,
    };
    expect(readMcpAddJson('events', JSON.stringify(entry), {}, none).server).toEqual(entry);
  });

  test('WebSocket supports no OAuth: an oauth block on it is warned about and the secret flag has no effect', () => {
    const entry = '{"type":"ws","url":"wss://x.test/s","oauth":{"callbackPort":8080}}';
    const read = readMcpAddJson('events', entry, { clientSecret: true }, none);
    expect(read.oauth).toBeUndefined();
    expect(read.secret).toBeUndefined();
    expect(read.issues.map((found) => found.severity)).toEqual(['warning']);
    expect(read.issues[0]?.message).toContain('OAuth works with HTTP and SSE servers only');
  });
});

spec('mcp.behavior.Use pre-configured OAuth credentials', () => {
  const entry = '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"id"}}';

  test('--client-secret asks for the secret with a prompt, or reads MCP_CLIENT_SECRET to skip the prompt', () => {
    const asked = readMcpAddJson('s', entry, { clientSecret: true }, none);
    expect(asked.secret).toEqual({ source: 'prompt' });
    const env = (name: string) => (name === 'MCP_CLIENT_SECRET' ? 'your-secret' : undefined);
    const fromEnvironment = readMcpAddJson('s', entry, { clientSecret: true }, env);
    expect(fromEnvironment.secret).toEqual({ source: 'environment', value: 'your-secret' });
  });

  test('MCP_CLIENT_SECRET alone does nothing: there is a secret only when --client-secret is passed', () => {
    const env = (name: string) => (name === 'MCP_CLIENT_SECRET' ? 'your-secret' : undefined);
    expect(readMcpAddJson('s', entry, {}, env).secret).toBeUndefined();
  });

  test('a public client uses --client-id only: no secret', () => {
    const read = readMcpAddJson('s', entry, {}, none);
    expect(read.secret).toBeUndefined();
    expect(read.oauth).toEqual({ clientId: 'id' });
  });

  test('the secret is never in the entry that is stored', () => {
    const env = (name: string) => (name === 'MCP_CLIENT_SECRET' ? 'your-secret' : undefined);
    const read = readMcpAddJson('s', entry, { clientSecret: true }, env);
    expect(JSON.stringify(read.server)).not.toContain('your-secret');
  });

  test('the flags only apply to HTTP and SSE: on a stdio server they have no effect, and are said to have none', () => {
    const stdio = '{"command":"node","oauth":{"clientId":"id"}}';
    const read = readMcpAddJson('s', stdio, { clientSecret: true }, none);
    expect(read.oauth).toBeUndefined();
    expect(read.secret).toBeUndefined();
    expect(read.issues[0]?.severity).toBe('warning');
    expect(read.issues[0]?.message).toContain('OAuth works with HTTP and SSE servers only');
    const sse = '{"type":"sse","url":"https://x.test/sse","oauth":{"clientId":"id"}}';
    expect(readMcpAddJson('s', sse, { clientSecret: true }, none).secret).toEqual({
      source: 'prompt',
    });
  });

  test('--client-secret with no oauth block still asks for a secret on a remote server (the client id may come from the flag)', () => {
    const read = readMcpAddJson(
      's',
      '{"type":"http","url":"https://x.test/mcp"}',
      { clientSecret: true },
      none,
    );
    expect(read.secret).toEqual({ source: 'prompt' });
  });
});

spec('mcp.behavior.Use a fixed OAuth callback port', () => {
  test('MCP_OAUTH_CALLBACK_PORT is the port when the add names none; the entry or flag wins over it', () => {
    const env = (name: string) => (name === 'MCP_OAUTH_CALLBACK_PORT' ? '9090' : undefined);
    const bare = '{"type":"http","url":"https://x.test/mcp","oauth":{"clientId":"id"}}';
    expect(readMcpAddJson('s', bare, {}, env).oauth).toEqual({
      clientId: 'id',
      callbackPort: 9090,
    });
    const fixed = '{"type":"http","url":"https://x.test/mcp","oauth":{"callbackPort":8080}}';
    expect(readMcpAddJson('s', fixed, {}, env).oauth).toEqual({ callbackPort: 8080 });
  });
});

spec('environment.host.MCP_CLIENT_SECRET', () => {
  const entry = '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"id"}}';
  const env = (name: string) => (name === 'MCP_CLIENT_SECRET' ? 'your-secret' : undefined);

  test('it is the OAuth client secret of a server with pre-configured credentials, and avoids the prompt of --client-secret', () => {
    expect(readMcpAddJson('s', entry, { clientSecret: true }, env).secret).toEqual({
      source: 'environment',
      value: 'your-secret',
    });
    expect(readMcpAddJson('s', entry, { clientSecret: true }, none).secret).toEqual({
      source: 'prompt',
    });
  });

  test('it is read when the server is added only: with no --client-secret nothing asks for a secret', () => {
    expect(readMcpAddJson('s', entry, {}, env).secret).toBeUndefined();
  });

  test('an empty value is no secret: the prompt stays', () => {
    const empty = (name: string) => (name === 'MCP_CLIENT_SECRET' ? '' : undefined);
    expect(readMcpAddJson('s', entry, { clientSecret: true }, empty).secret).toEqual({
      source: 'prompt',
    });
  });
});

spec('environment.host.MCP_OAUTH_CALLBACK_PORT', () => {
  const env = (name: string) => (name === 'MCP_OAUTH_CALLBACK_PORT' ? '9090' : undefined);

  test('it fixes the port of the OAuth redirect callback, as an alternative to --callback-port', () => {
    const entry = '{"type":"http","url":"https://x.test/mcp","oauth":{"clientId":"id"}}';
    expect(readMcpAddJson('s', entry, {}, env).oauth).toEqual({
      clientId: 'id',
      callbackPort: 9090,
    });
  });

  test('a server added with no oauth block gets the fixed port alone, with dynamic client registration', () => {
    const read = readMcpAddJson('s', '{"type":"http","url":"https://x.test/mcp"}', {}, env);
    expect(read.oauth).toEqual({ callbackPort: 9090 });
  });

  test('a server that does not sign in with OAuth is not given one', () => {
    expect(readMcpAddJson('s', '{"command":"node"}', {}, env).oauth).toBeUndefined();
    expect(readMcpAddJson('s', '{"command":"node"}', {}, env).issues).toEqual([]);
  });
});

describe('what the docs leave open', () => {
  test('an invalid oauth block drops no server: the error names oauth and the entry otherwise reads', () => {
    const read = readMcpAddJson(
      's',
      '{"type":"http","url":"https://x.test/mcp","oauth":{"callbackPort":0}}',
      {},
      none,
    );
    expect(read.issues[0]?.message).toContain('oauth.callbackPort');
    expect(read.oauth).toBeUndefined();
  });

  test('a port in MCP_OAUTH_CALLBACK_PORT that is not a port is ignored', () => {
    const env = (name: string) => (name === 'MCP_OAUTH_CALLBACK_PORT' ? 'abc' : undefined);
    const json = '{"type":"http","url":"https://x.test/mcp","oauth":{"clientId":"id"}}';
    expect(readMcpAddJson('s', json, {}, env).oauth).toEqual({ clientId: 'id' });
  });
});
