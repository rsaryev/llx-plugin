/**
 * plugins/manifest-reference.md § Where each variable resolves (stdio: `command`, `args`, `env`, with
 * `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA` and `CLAUDE_PROJECT_DIR` exported to the process; http,
 * sse and ws: `url`, `headers`, `headersHelper`, the process variables not applicable);
 * mcp.md § Plugin-provided MCP servers, § Environment variable expansion (`${VAR}`,
 * `${VAR:-default}`, a missing variable in a plugin server is the error `Invalid MCP server config for "<name>": Missing environment variables: ...`), § Credential variables that
 * read as empty; plugins/components.md § Server names, tool names, and reloads;
 * plugins/troubleshooting.md § Invalid MCP server config (`URL is unset or invalid`). The
 * `headersHelper` rules are in mcp-headers-helper.test.ts.
 *
 * `environment.component.stdio` and `.http` are also proven by the table-level tests in
 * components.test.ts; here the same rows are asserted through the real MCP resolver.
 */
import { describe, expect, test } from 'bun:test';
import {
  expandMcpServer,
  mcpServerKey,
  resolveMcpServer,
  type PluginMcpServer,
  type ResolvedUserConfig,
} from '../../../src/index.ts';
import { fakeEnvironment, locations } from '../../support/ports.ts';
import { PATHS, scopeOf, userConfig } from '../../support/mcp-scope.ts';
import { spec } from '../../support/spec.ts';

spec('environment.component.stdio', () => {
  const server = {
    command: '${CLAUDE_PLUGIN_ROOT}/servers/db-server',
    args: ['--config', '${CLAUDE_PLUGIN_ROOT}/config.json', '--data=${CLAUDE_PLUGIN_DATA}'],
    env: { DB_URL: '${DB_URL}', PROJECT: '${CLAUDE_PROJECT_DIR}', REGION: '${user_config.region}' },
  };

  test('resolves in command, args and env, and in no other field', async () => {
    // A string field outside the table (and loose keys) stays literal, even with a variable in it.
    const literal = {
      type: 'stdio',
      description: '${CLAUDE_PLUGIN_ROOT}',
      oauth: { clientId: '${CLAUDE_PLUGIN_ROOT}' },
      alwaysLoad: true,
    } as const;
    const { resolved, issues } = await resolveMcpServer(
      'database-tools',
      { ...server, ...literal },
      scopeOf(),
    );
    expect(issues).toEqual([]);
    expect(resolved?.server).toEqual({
      ...literal,
      command: '/plugins/my-plugin@acme-tools/servers/db-server',
      args: [
        '--config',
        '/plugins/my-plugin@acme-tools/config.json',
        '--data=/data/my-plugin-acme-tools',
      ],
      env: { DB_URL: 'postgres://db', PROJECT: '/work/app', REGION: 'eu' },
    });
  });

  test('the process gets the three path variables and no option variables', async () => {
    const { resolved } = await resolveMcpServer('database-tools', server, scopeOf());
    expect(resolved?.environment).toEqual(PATHS);
  });

  test('a default fills an unset ${VAR}; one with no default keeps the server from starting (plugins/troubleshooting.md)', async () => {
    const filled = await resolveMcpServer(
      'db',
      { command: 'node', env: { B: '${NOPE:-fallback}' } },
      scopeOf(),
    );
    expect(filled.resolved?.server).toEqual({ command: 'node', env: { B: 'fallback' } });
    expect(filled.issues).toEqual([]);
    const { resolved, issues } = await resolveMcpServer(
      'db',
      { command: 'node', env: { A: '${NOPE}', B: '${NOPE:-fallback}' } },
      scopeOf(),
    );
    expect(resolved).toBeUndefined();
    expect(issues).toEqual([
      {
        severity: 'error',
        path: 'mcpServers.db',
        message: 'Invalid MCP server config for "db": Missing environment variables: NOPE',
      },
    ]);
  });
});

const remoteServer = (type: 'http' | 'sse' | 'ws') => ({
  type,
  url: 'https://${user_config.region}.example.com/mcp',
  headers: {
    Authorization: 'Bearer ${user_config.api_token}',
    'X-Root': '${CLAUDE_PLUGIN_ROOT}',
  },
  headersHelper: '${CLAUDE_PLUGIN_ROOT}/bin/get-headers.sh',
});

spec('environment.component.http', () => {
  test('http, sse and ws resolve url, headers and headersHelper, and no other field', async () => {
    const literal = {
      description: '${CLAUDE_PLUGIN_ROOT}',
      oauth: { clientId: '${CLAUDE_PLUGIN_ROOT}' },
      timeout: 1000,
    };
    for (const type of ['http', 'sse', 'ws'] as const) {
      const { resolved, issues } = await resolveMcpServer(
        'api',
        { ...remoteServer(type), ...literal },
        scopeOf(),
      );
      expect(issues).toEqual([]);
      expect(resolved?.server).toEqual({
        ...literal,
        type,
        url: 'https://eu.example.com/mcp',
        headers: { Authorization: 'Bearer s3cret', 'X-Root': '/plugins/my-plugin@acme-tools' },
        headersHelper: '/plugins/my-plugin@acme-tools/bin/get-headers.sh',
      });
    }
  });

  test('the process variables are not applicable: nothing is exported, the data folder is never created', async () => {
    const host = locations();
    const { resolved } = await resolveMcpServer(
      'api',
      remoteServer('http'),
      scopeOf({ locations: host }),
    );
    expect(resolved?.environment).toEqual({});
    expect(host.dataCreated).toEqual([]);
  });
});

describe('credential variables in a remote server (mcp.md, "Credential variables that read as empty")', () => {
  test('read as empty in url and headers, expand in a stdio env', async () => {
    const remote = await resolveMcpServer(
      'api',
      {
        type: 'http',
        url: 'https://x.test/${ANTHROPIC_AUTH_TOKEN}',
        headers: { A: 'Bearer ${ANTHROPIC_AUTH_TOKEN}' },
      },
      scopeOf(),
    );
    expect(remote.resolved?.server).toMatchObject({
      url: 'https://x.test/',
      headers: { A: 'Bearer ' },
    });
    const stdio = await resolveMcpServer(
      'db',
      { command: 'node', env: { T: '${ANTHROPIC_AUTH_TOKEN}' } },
      scopeOf(),
    );
    expect(stdio.resolved?.server).toMatchObject({ env: { T: 'tok' } });
  });
});

describe('the registered server name (components.md, "Server names, tool names, and reloads")', () => {
  test('is plugin:<plugin>:<server>, the plugin without its marketplace', async () => {
    expect(mcpServerKey('my-plugin', 'db')).toBe('plugin:my-plugin:db');
    const { resolved } = await resolveMcpServer('db', { command: 'node' }, scopeOf());
    expect(resolved?.key).toBe('plugin:my-plugin:db');
    expect(resolved?.name).toBe('db');
    const bare = await resolveMcpServer(
      'db',
      { command: 'node' },
      scopeOf({ pluginId: 'my-plugin' }),
    );
    expect(bare.resolved?.key).toBe('plugin:my-plugin:db');
  });
});

describe('a url that does not resolve (troubleshooting.md, "URL is unset or invalid"; judgment on when)', () => {
  test('an option the url uses that has no value makes the server invalid, with that cause', async () => {
    const unset: ResolvedUserConfig = { declared: userConfig.declared, values: {} };
    const { resolved, issues } = await resolveMcpServer(
      'api',
      { type: 'http', url: '${user_config.region}' },
      scopeOf({ userConfig: unset }),
    );
    expect(resolved).toBeUndefined();
    expect(issues.at(-1)).toEqual({
      severity: 'error',
      path: 'mcpServers.api.url',
      message: 'Invalid MCP server config for "api": URL is unset or invalid',
    });
  });

  test('an unset ${VAR} in the url is a missing environment variable: the server does not start', async () => {
    const { resolved, issues } = await resolveMcpServer(
      'api',
      { type: 'http', url: '${NOPE}/mcp' },
      scopeOf(),
    );
    expect(resolved).toBeUndefined();
    expect(issues.map((found) => [found.severity, found.message])).toEqual([
      ['error', 'Invalid MCP server config for "api": Missing environment variables: NOPE'],
    ]);
  });

  test('a covered credential variable alone, set or not, with or without a default, leaves no URL', async () => {
    const unset = scopeOf({ environment: fakeEnvironment({}) });
    for (const scope of [scopeOf(), unset]) {
      for (const url of ['${ANTHROPIC_AUTH_TOKEN}', '${ANTHROPIC_AUTH_TOKEN:-https://a.test}']) {
        const { resolved, issues } = await resolveMcpServer('api', { type: 'http', url }, scope);
        expect(resolved).toBeUndefined();
        expect(issues.map((found) => [found.severity, found.message])).toEqual([
          ['error', 'Invalid MCP server config for "api": has an invalid MCP url'],
        ]);
      }
    }
  });

  test('a url that parses is fine, wss and http included', async () => {
    for (const url of ['wss://x.test/s', 'http://localhost:3000/mcp']) {
      const { resolved } = await resolveMcpServer('api', { type: 'ws', url }, scopeOf());
      expect(resolved?.server).toMatchObject({ url });
    }
  });
});

describe('plugin and settings-scope servers expand alike (judgment)', () => {
  const env = {
    EMPTY: '',
    HOST: 'h.example',
    NPM_TOKEN: 't',
    ANTHROPIC_BASE_URL: 'https://proxy.example',
  };
  const values = new Map(Object.entries(env));
  const servers: readonly PluginMcpServer[] = [
    {
      type: 'http',
      url: '${ANTHROPIC_BASE_URL}/${EMPTY:-d}/${HOST}',
      headers: { A: 'Bearer ${NPM_TOKEN:-x}', B: '${HOST}', C: '${MISSING:-dflt}' },
    },
    {
      command: '${HOST}',
      args: ['${EMPTY:-d}', '${NPM_TOKEN}'],
      env: { K: '${MISSING:-z}' },
    },
  ];

  test('one rule for both: the resolved server is the expanded one, with the same unset variables', async () => {
    for (const server of servers) {
      const plugin = await resolveMcpServer(
        'srv',
        server,
        scopeOf({ environment: fakeEnvironment(env) }),
      );
      const own = expandMcpServer('srv', server, (name) => values.get(name));
      expect(plugin.resolved?.server).toEqual(own.server);
      expect(plugin.issues.map((found) => found.message)).toEqual(
        own.issues.map((found) => found.message),
      );
    }
  });

  test('they differ in one thing: an unset ${VAR} with no default is a warning for the settings scopes and an error for a plugin', async () => {
    const server: PluginMcpServer = { command: 'node', args: ['${MISSING}'] };
    const own = expandMcpServer('srv', server, (name) => values.get(name));
    expect(own.server).toEqual(server);
    expect(own.issues.map((found) => found.severity)).toEqual(['warning']);
    const plugin = await resolveMcpServer(
      'srv',
      server,
      scopeOf({ environment: fakeEnvironment(env) }),
    );
    expect(plugin.resolved).toBeUndefined();
    expect(plugin.issues.map((found) => found.severity)).toEqual(['error']);
  });

  test('one concrete result: the default fills an unset name, an empty value counts as set', async () => {
    const plugin = await resolveMcpServer(
      'srv',
      servers[1] ?? { command: '' },
      scopeOf({ environment: fakeEnvironment(env) }),
    );
    expect(plugin.resolved?.server).toEqual({
      command: 'h.example',
      args: ['', 't'],
      env: { K: 'z' },
    });
  });
});
