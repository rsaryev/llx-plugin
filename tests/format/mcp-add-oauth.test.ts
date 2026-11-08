/**
 * mcp.md § Use a fixed OAuth callback port and § Use pre-configured OAuth credentials (`--callback-port`,
 * `--client-id`, `--client-secret`, the secret from `MCP_CLIENT_SECRET`), § Authenticate with remote MCP
 * servers (a second `claude mcp add` of the same name at the same scope fails with a quoted message).
 * The transports of `claude mcp add` are in mcp-add.test.ts.
 */
import { expect, test } from 'bun:test';
import { mcpServerExistsMessage, readMcpAdd } from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const none = (): undefined => undefined;
const add = (...argv: string[]) => readMcpAdd(argv, none);

spec('mcp.behavior.Use a fixed OAuth callback port', () => {
  test('--callback-port on its own fixes the port with dynamic client registration', () => {
    const read = add(
      '--transport',
      'http',
      '--callback-port',
      '8080',
      'my-server',
      'https://mcp.example.com/mcp',
    );
    expect(read.issues).toEqual([]);
    expect(read.oauth).toEqual({ callbackPort: 8080 });
    expect(read.secret).toBeUndefined();
    expect(read.server).toMatchObject({ oauth: { callbackPort: 8080 } });
  });

  test('a port that is not a number is refused', () => {
    const read = add('--transport', 'http', '--callback-port', 'eight', 'n', 'https://x.test/mcp');
    expect(read.issues[0]?.severity).toBe('error');
  });
});

spec('mcp.behavior.Use pre-configured OAuth credentials', () => {
  const docsExample = [
    '--transport',
    'http',
    '--client-id',
    'your-client-id',
    '--client-secret',
    '--callback-port',
    '8080',
    'my-server',
    'https://mcp.example.com/mcp',
  ];

  test('the docs command: client id and callback port in the entry, the secret asked for', () => {
    const read = readMcpAdd(docsExample, none);
    expect(read.issues).toEqual([]);
    expect(read.oauth).toEqual({ clientId: 'your-client-id', callbackPort: 8080 });
    expect(read.secret).toEqual({ source: 'prompt' });
    expect(JSON.stringify(read.server)).not.toContain('secret');
  });

  test('the CI form: MCP_CLIENT_SECRET in the environment skips the prompt', () => {
    const env = (name: string) => (name === 'MCP_CLIENT_SECRET' ? 'your-secret' : undefined);
    const read = readMcpAdd(docsExample, env);
    expect(read.secret).toEqual({ source: 'environment', value: 'your-secret' });
  });

  test('on a stdio server the flags have no effect', () => {
    const read = add(
      '--client-id',
      'id',
      '--client-secret',
      '--transport',
      'stdio',
      'n',
      '--',
      'node',
    );
    expect(read.server).toEqual({ type: 'stdio', command: 'node' });
    expect(read.oauth).toBeUndefined();
    expect(read.secret).toBeUndefined();
    expect(read.issues[0]?.severity).toBe('warning');
  });
});

spec('mcp.behavior.Authenticate with remote MCP servers', () => {
  test('adding the same name again at the same scope fails with "MCP server sentry already exists in local config"', () => {
    expect(mcpServerExistsMessage('sentry', 'local')).toBe(
      'MCP server sentry already exists in local config',
    );
    expect(mcpServerExistsMessage('sentry', 'user')).toBe(
      'MCP server sentry already exists in user config',
    );
  });

  test('the sentry command of step 1 adds an http server', () => {
    expect(add('--transport', 'http', 'sentry', 'https://mcp.sentry.dev/mcp').server).toEqual({
      type: 'http',
      url: 'https://mcp.sentry.dev/mcp',
    });
  });
});
