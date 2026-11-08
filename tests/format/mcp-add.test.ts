/**
 * mcp.md § Option 1 (`claude mcp add --transport http <name> <url>`, `--header`), § Option 2
 * (`--transport sse`, `--header`), § Option 3 (`claude mcp add [options] <name> -- <command>
 * [args...]`, the `--` separator, `--env` pairs and the name that follows them), § Option 4 (`--transport`
 * does not accept `ws`), § Use a fixed OAuth callback port and § Use pre-configured OAuth credentials
 * (`--callback-port`, `--client-id`, `--client-secret`), § Add a server from setup instructions written
 * for another client (the scope of each command), § Authenticate with remote MCP servers (a second
 * `claude mcp add` of the same name at the same scope fails with a quoted message).
 * Wording the docs do not quote is a judgment and is asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { readMcpAdd } from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const none = (): undefined => undefined;
const add = (...argv: string[]) => readMcpAdd(argv, none);

spec('mcp.behavior.Option 1: Add a remote HTTP server', () => {
  test('claude mcp add --transport http <name> <url> adds an http server in local scope', () => {
    const read = add('--transport', 'http', 'notion', 'https://mcp.notion.com/mcp');
    expect(read.issues).toEqual([]);
    expect(read.name).toBe('notion');
    expect(read.scope).toBe('local');
    expect(read.server).toEqual({ type: 'http', url: 'https://mcp.notion.com/mcp' });
  });

  test('--header "Authorization: Bearer your-token" becomes a header of the entry', () => {
    const read = add(
      '--transport',
      'http',
      'secure-api',
      'https://api.example.com/mcp',
      '--header',
      'Authorization: Bearer your-token',
    );
    expect(read.server).toEqual({
      type: 'http',
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer your-token' },
    });
  });

  test('--header repeats, and a header with no colon is refused', () => {
    const two = add('-t', 'http', 'n', 'https://x.test/mcp', '-H', 'A: 1', '-H', 'B: 2');
    expect(two.server).toMatchObject({ headers: { A: '1', B: '2' } });
    const bad = add('-t', 'http', 'n', 'https://x.test/mcp', '-H', 'Authorization');
    expect(bad.server).toBeUndefined();
    expect(bad.issues[0]?.severity).toBe('error');
  });

  test('the CLI always writes the transport type for a url', () => {
    expect(add('--transport', 'http', 'n', 'https://x.test/mcp').server).toHaveProperty(
      'type',
      'http',
    );
  });

  test('the url must be given, once', () => {
    expect(add('--transport', 'http', 'n').server).toBeUndefined();
    expect(
      add('--transport', 'http', 'n', 'https://a.test', 'https://b.test').server,
    ).toBeUndefined();
  });
});

spec('mcp.behavior.Option 2: Add a remote SSE server', () => {
  test('--transport sse connects over SSE directly', () => {
    const read = add('--transport', 'sse', 'asana', 'https://mcp.asana.com/sse');
    expect(read.issues).toEqual([]);
    expect(read.server).toEqual({ type: 'sse', url: 'https://mcp.asana.com/sse' });
  });

  test('--header "X-API-Key: your-key-here" is the example with authentication', () => {
    const read = add(
      '--transport',
      'sse',
      'private-api',
      'https://api.company.com/sse',
      '--header',
      'X-API-Key: your-key-here',
    );
    expect(read.server).toEqual({
      type: 'sse',
      url: 'https://api.company.com/sse',
      headers: { 'X-API-Key': 'your-key-here' },
    });
  });
});

spec('mcp.behavior.Option 3: Add a local stdio server', () => {
  test('the Airtable example: --env, --transport stdio, then -- and the command with its arguments', () => {
    const read = add(
      '--env',
      'AIRTABLE_API_KEY=YOUR_KEY',
      '--transport',
      'stdio',
      'airtable',
      '--',
      'npx',
      '-y',
      'airtable-mcp-server',
    );
    expect(read.issues).toEqual([]);
    expect(read.server).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'airtable-mcp-server'],
      env: { AIRTABLE_API_KEY: 'YOUR_KEY' },
    });
  });

  test('everything after -- is passed to the server untouched, whatever flags it holds', () => {
    expect(add('--transport', 'stdio', 'myserver', '--', 'npx', 'server').server).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['server'],
    });
    const read = add(
      '--env',
      'KEY=value',
      '--transport',
      'stdio',
      'myserver',
      '--',
      'python',
      'server.py',
      '--port',
      '8080',
      '--scope',
      'user',
    );
    expect(read.scope).toBe('local');
    expect(read.server).toEqual({
      type: 'stdio',
      command: 'python',
      args: ['server.py', '--port', '8080', '--scope', 'user'],
      env: { KEY: 'value' },
    });
  });

  test('without -- the server flag is read as one of Claude Code own options, which does not know it', () => {
    const read = add('--transport', 'stdio', 'myserver', 'python', 'server.py', '--port', '8080');
    expect(read.server).toBeUndefined();
    expect(read.issues[0]?.severity).toBe('error');
  });

  test('--env accepts several KEY=value pairs', () => {
    const read = add('--env', 'A=1', 'B=2', '--transport', 'stdio', 'n', '--', 'node');
    expect(read.server).toMatchObject({ env: { A: '1', B: '2' } });
  });

  test('the server name directly after --env is read as another pair and rejected; another option between them fixes it', () => {
    const stuck = add('--env', 'KEY=value', 'myserver', '--', 'node');
    expect(stuck.server).toBeUndefined();
    expect(stuck.issues[0]?.message).toContain('"myserver"');
    const fixed = add('--env', 'KEY=value', '--transport', 'stdio', 'myserver', '--', 'node');
    expect(fixed.server).toMatchObject({ command: 'node', env: { KEY: 'value' } });
  });

  test('the name can come before --env, as in the setup-instructions example', () => {
    const read = add(
      'example',
      '--env',
      'API_KEY=your-key',
      '--',
      'npx',
      '-y',
      '@example/mcp-server',
    );
    expect(read.name).toBe('example');
    expect(read.server).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@example/mcp-server'],
      env: { API_KEY: 'your-key' },
    });
  });

  test('an environment value keeps its own = signs', () => {
    expect(
      add('--env', 'URL=https://x.test/?a=b', '--transport', 'stdio', 'n', '--', 'node').server,
    ).toMatchObject({ env: { URL: 'https://x.test/?a=b' } });
  });

  test('a command is needed', () => {
    expect(add('--transport', 'stdio', 'n', '--').server).toBeUndefined();
  });
});

spec('mcp.behavior.Option 4: Add a remote WebSocket server', () => {
  test('the --transport flag does not accept ws: the message sends the reader to add-json', () => {
    const read = add('--transport', 'ws', 'events', 'wss://mcp.example.com/socket');
    expect(read.server).toBeUndefined();
    expect(read.issues[0]?.message).toContain('claude mcp add-json');
    expect(read.issues[0]?.message).toContain('"ws"');
  });
});

describe('scope of a command (mcp.md, "Add a server from setup instructions written for another client")', () => {
  test('each command writes to local scope unless you add --scope project or --scope user', () => {
    const url = ['--transport', 'http', 'example', 'https://mcp.example.com/mcp'];
    expect(add(...url).scope).toBe('local');
    expect(add('--scope', 'project', ...url).scope).toBe('project');
    expect(add('-s', 'user', ...url).scope).toBe('user');
    expect(add('--scope', 'elsewhere', ...url).server).toBeUndefined();
  });
});

describe('what the docs leave open', () => {
  test('no name, an unknown flag and an unknown transport are refused', () => {
    expect(add().server).toBeUndefined();
    expect(add('--bogus', 'n', 'https://x.test').server).toBeUndefined();
    expect(add('--transport', 'carrier-pigeon', 'n', 'https://x.test').server).toBeUndefined();
    expect(add('--transport').server).toBeUndefined();
  });

  test('--header on a stdio server has no effect and is said to have none', () => {
    const read = add('-H', 'A: 1', '--transport', 'stdio', 'n', '--', 'node');
    expect(read.server).toEqual({ type: 'stdio', command: 'node' });
    expect(read.issues[0]?.severity).toBe('warning');
  });

  test('without --transport the server is stdio, and the command is the positional after the name', () => {
    expect(add('n', 'node', 'server.js').server).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
    });
  });
});
