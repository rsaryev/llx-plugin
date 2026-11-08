/**
 * mcp.md § Environment variable expansion in `.mcp.json` (the supported forms and the fields they
 * apply to, § Example with variable expansion, § Unset variables without a default, § Variables set
 * to an empty string, § Credential variables that read as empty, § How references appear in `/mcp`
 * and CLI output); managed-mcp.md § What users can see and change (the host only).
 * The expander is pure over a lookup function: it needs no plugin.
 */
import { describe, expect, test } from 'bun:test';
import {
  displayReference,
  expandEnvText,
  expandMcpServer,
  type EnvLookup,
} from '../../src/format/mcp-env.ts';
import type { PluginMcpServer } from '../../src/format/mcp-config.ts';
import { spec } from '../support/spec.ts';

const lookupOf =
  (values: Readonly<Record<string, string>>): EnvLookup =>
  (name) =>
    Object.hasOwn(values, name) ? values[name] : undefined;

const API_SERVER: PluginMcpServer = {
  type: 'http',
  url: '${API_BASE_URL:-https://api.example.com}/mcp',
  headers: { Authorization: 'Bearer ${API_KEY}' },
};

describe('mcp.md § Environment variable expansion: forms and fields', () => {
  test('${VAR} and ${VAR:-default} in command, args and env of a stdio server', () => {
    const server: PluginMcpServer = {
      command: '${TOOLS}/run',
      args: ['--root', '${ROOT:-/srv}', '--literal', 'plain'],
      env: { DB: '${DB_URL}', MODE: '${MODE:-dev}' },
    };
    const out = expandMcpServer('db', server, lookupOf({ TOOLS: '/opt', DB_URL: 'pg://x' }));
    expect(out.server).toEqual({
      command: '/opt/run',
      args: ['--root', '/srv', '--literal', 'plain'],
      env: { DB: 'pg://x', MODE: 'dev' },
    });
    expect(out.issues).toEqual([]);
  });

  test('url and headers of a remote server expand; headersHelper and other fields do not', () => {
    const server: PluginMcpServer = {
      type: 'sse',
      url: 'https://${HOST}/sse',
      headers: { 'X-Team': '${TEAM}' },
      headersHelper: '${HOME}/bin/helper',
    };
    const out = expandMcpServer('s', server, lookupOf({ HOST: 'h.example', TEAM: 'a' }));
    expect(out.server).toEqual({
      type: 'sse',
      url: 'https://h.example/sse',
      headers: { 'X-Team': 'a' },
      headersHelper: '${HOME}/bin/helper',
    });
  });

  test('the default ends at the first closing brace and a value is never scanned again', () => {
    const out = expandEnvText('${A:-x}${B}', lookupOf({ A: '${B}', B: 'b' }));
    expect(out.text).toBe('${B}b');
  });
});

spec('mcpSettings.behavior.Example with variable expansion', () => {
  test('the documented server: default URL base and the key from API_KEY', () => {
    const out = expandMcpServer('api-server', API_SERVER, lookupOf({ API_KEY: 'k-123' }));
    expect(out.server).toEqual({
      type: 'http',
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer k-123' },
    });
    expect(out.issues).toEqual([]);
  });

  test('a set API_BASE_URL replaces the default', () => {
    const out = expandMcpServer(
      'api-server',
      API_SERVER,
      lookupOf({ API_BASE_URL: 'https://staging.example.com', API_KEY: 'k' }),
    );
    expect(out.server).toMatchObject({ url: 'https://staging.example.com/mcp' });
  });

  test('API_KEY is not a covered name, so it expands in a remote header', () => {
    const out = expandMcpServer('api-server', API_SERVER, lookupOf({ API_KEY: 'secret' }));
    expect(out.server).toMatchObject({ headers: { Authorization: 'Bearer secret' } });
  });
});

spec('mcpSettings.behavior.Unset variables without a default', () => {
  test('the config still loads with the ${VAR} text as is, and a warning names the server', () => {
    const out = expandMcpServer('api-server', API_SERVER, lookupOf({}));
    expect(out.server).toMatchObject({
      headers: { Authorization: 'Bearer ${API_KEY}' },
      url: 'https://api.example.com/mcp',
    });
    expect(out.issues).toEqual([
      {
        severity: 'warning',
        path: 'mcpServers.api-server.headers.Authorization',
        message: 'Environment variable API_KEY is not set and has no default',
      },
    ]);
    expect(out.missing).toEqual(['API_KEY']);
  });

  test('a stdio server keeps the text of every unset variable and warns for each field', () => {
    const out = expandMcpServer(
      'db',
      { command: '${BIN}', args: ['${ARG}'], env: { K: '${KEY_VALUE}' } },
      lookupOf({}),
    );
    expect(out.server).toEqual({ command: '${BIN}', args: ['${ARG}'], env: { K: '${KEY_VALUE}' } });
    expect(out.issues.map((found) => found.path)).toEqual([
      'mcpServers.db.command',
      'mcpServers.db.args',
      'mcpServers.db.env.K',
    ]);
  });

  test('a default avoids the warning', () => {
    const out = expandMcpServer('s', { command: '${BIN:-node}' }, lookupOf({}));
    expect(out.server).toEqual({ command: 'node' });
    expect(out.issues).toEqual([]);
    expect(out.missing).toEqual([]);
  });

  test('in a remote url and headers a covered credential reads as empty, with no warning', () => {
    const out = expandMcpServer(
      's',
      {
        type: 'http',
        url: 'https://x.example/mcp',
        headers: { Authorization: 'Bearer ${ANTHROPIC_AUTH_TOKEN}' },
      },
      lookupOf({}),
    );
    expect(out.server).toMatchObject({ headers: { Authorization: 'Bearer ' } });
    expect(out.issues).toEqual([]);
    expect(out.missing).toEqual([]);
  });
});

spec('mcpSettings.behavior.Variables set to an empty string', () => {
  test('an empty value counts as set: the default is not used', () => {
    expect(expandEnvText('${V:-fallback}', lookupOf({ V: '' })).text).toBe('');
    expect(expandEnvText('a${V}b', lookupOf({ V: '' })).text).toBe('ab');
    expect(expandEnvText('a${V}b', lookupOf({ V: '' })).missing).toEqual([]);
  });

  test('an unset variable uses the default', () => {
    expect(expandEnvText('${V:-fallback}', lookupOf({})).text).toBe('fallback');
  });

  test('the example server: API_BASE_URL empty makes the url `/mcp`, which is not a valid URL', () => {
    const out = expandMcpServer(
      'api-server',
      API_SERVER,
      lookupOf({ API_BASE_URL: '', API_KEY: 'k' }),
    );
    expect(out.server).toBeUndefined();
    expect(out.issues).toContainEqual({
      severity: 'error',
      path: 'mcpServers.api-server.url',
      message: `Invalid MCP server config for "api-server": 'url' is not a valid URL`,
    });
  });

  test('unsetting the variable gives the default URL back', () => {
    const out = expandMcpServer('api-server', API_SERVER, lookupOf({ API_KEY: 'k' }));
    expect(out.server).toMatchObject({ url: 'https://api.example.com/mcp' });
  });
});

spec('mcpSettings.behavior.How references appear in /mcp and CLI output', () => {
  const server: PluginMcpServer = {
    type: 'http',
    url: '${API_BASE_URL:-https://api.example.com}/mcp',
    headers: { Authorization: 'Bearer ${API_KEY}' },
  };
  const stdio: PluginMcpServer = { command: 'npx', args: ['-y', '${PKG}', '--root=${ROOT}'] };

  test('local, project and user servers show the ${VAR} reference by name, not its value', () => {
    for (const scope of ['local', 'project', 'user'] as const) {
      expect(displayReference(server, scope)).toBe('${API_BASE_URL:-https://api.example.com}/mcp');
      expect(displayReference(stdio, scope)).toBe('npx -y ${PKG} --root=${ROOT}');
    }
    // the connection uses the value; the display never does
    const lookup = lookupOf({ API_BASE_URL: 'https://internal.example', PKG: 'p', ROOT: '/r' });
    expect(expandMcpServer('s', server, lookup).server).toMatchObject({
      url: 'https://internal.example/mcp',
    });
    expect(displayReference(server, 'user')).not.toContain('internal.example');
  });

  test('a managed server shows the URL host only', () => {
    expect(
      displayReference({ type: 'http', url: 'https://mcp.example.com/v1/tools?x=1' }, 'managed'),
    ).toBe('https://mcp.example.com/…');
  });

  test('the host of a managed server keeps its port and drops userinfo', () => {
    // Judgment: "the URL's host only" is the URL's host component, which carries the port.
    expect(
      displayReference({ type: 'sse', url: 'https://u:p@mcp.example.com:8443/a' }, 'managed'),
    ).toBe('https://mcp.example.com:8443/…');
  });
});

describe('expansion edges (judgments)', () => {
  test('a name that is not a variable name stays as written and is not reported', () => {
    const out = expandEnvText('${1A} ${A-B} ${} $A', lookupOf({ A: 'x' }));
    expect(out.text).toBe('${1A} ${A-B} ${} $A');
    expect(out.missing).toEqual([]);
  });

  test('an unparseable url after expansion drops the server, whatever the cause', () => {
    const out = expandMcpServer('s', { type: 'http', url: '${NOPE}' }, lookupOf({}));
    expect(out.server).toBeUndefined();
    expect(out.issues.map((found) => found.severity)).toEqual(['warning', 'error']);
  });

  test('a stdio entry with a url key is expanded as stdio and the url is kept as written', () => {
    const odd = { type: 'stdio', command: '${C}', url: '${U}' } as const;
    const out = expandMcpServer('s', odd, lookupOf({ C: 'c', U: 'u' }));
    const expected = { type: 'stdio', command: 'c', url: '${U}' } as const;
    expect(out.server).toEqual(expected);
  });

  test('the same variable referenced twice is reported once per field', () => {
    const out = expandMcpServer('s', { command: '${X}${X}' }, lookupOf({}));
    expect(out.issues).toHaveLength(1);
    expect(out.missing).toEqual(['X']);
  });

  test('a managed display of an unparseable url shows nothing of it', () => {
    expect(displayReference({ type: 'http', url: 'not a url' }, 'managed')).toBe('…');
  });
});
