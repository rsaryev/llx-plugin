/**
 * plugins/troubleshooting.md § `Invalid MCP server config for "<server>"` and MCP servers that don't
 * start: `Invalid MCP server config for "<server>": <error>` with `Missing environment variables:
 * <names>`, `URL is unset or invalid`, `has an invalid MCP url` and the `headersHelper` case;
 * `Bundled MCP server "<name>" was not started: it needs configuration`; "Server is configured but
 * never connects" (the 15-minute cache of a failed stdio connection, a schema failure that only the debug
 * log records and `claude plugin validate` reports); "Server works with `--plugin-dir` but fails after
 * install" (write paths with `${CLAUDE_PLUGIN_ROOT}`). Wording the docs do not quote is a judgment
 * (spec/judgments.md), asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  collectMcpServers,
  resolveMcpServer,
  skipsStdioConnection,
  type PluginMcpServer,
  type ResolvedUserConfig,
} from '../../../src/index.ts';
import { bundle, fakeBundles } from '../../support/mcp-bundle.ts';
import { HELPER_MESSAGE, scopeOf, userConfig } from '../../support/mcp-scope.ts';
import { fakeEnvironment, locations, memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const invalid = (server: string, why: string) =>
  `Invalid MCP server config for "${server}": ${why}`;
const NO_VALUES: ResolvedUserConfig = { declared: userConfig.declared, values: {} };

spec(
  `mcp.troubleshooting.Invalid MCP server config for "<server>": <error>.Missing environment variables: <names>`,
  () => {
    test('a ${VAR} no variable answers keeps the server from starting; the error names the variable', async () => {
      const { resolved, issues } = await resolveMcpServer(
        'db',
        { command: 'node', env: { URL: '${DB_URL_NOT_SET}' } },
        scopeOf(),
      );
      expect(resolved).toBeUndefined();
      expect(issues.map((found) => found.message)).toEqual([
        invalid('db', 'Missing environment variables: DB_URL_NOT_SET'),
      ]);
    });

    test('every missing variable is named once, in the order found, in whichever field it appears', async () => {
      const { issues } = await resolveMcpServer(
        'api',
        {
          type: 'http',
          url: 'https://${HOST_NOT_SET}/mcp',
          headers: { A: '${TOKEN_NOT_SET}', B: '${HOST_NOT_SET}' },
        },
        scopeOf(),
      );
      expect(issues.map((found) => found.message)).toEqual([
        invalid('api', 'Missing environment variables: HOST_NOT_SET, TOKEN_NOT_SET'),
      ]);
    });

    test('a variable with a default, one that is set (even to an empty string) and a path variable are not missing', async () => {
      const { resolved, issues } = await resolveMcpServer(
        'db',
        {
          command: 'node',
          env: { A: '${NOPE:-x}', B: '${EMPTY}', C: '${DB_URL}', D: '${CLAUDE_PLUGIN_ROOT}' },
        },
        scopeOf({ environment: fakeEnvironment({ EMPTY: '', DB_URL: 'postgres://db' }) }),
      );
      expect(issues).toEqual([]);
      expect(resolved?.server).toMatchObject({ env: { A: 'x', B: '', C: 'postgres://db' } });
    });

    test('the fix the docs give works: setting the variable in the shell starts the server in a new session', async () => {
      const entry: PluginMcpServer = { command: 'node', env: { URL: '${DB_URL_NOT_SET}' } };
      const before = await resolveMcpServer('db', entry, scopeOf());
      const after = await resolveMcpServer(
        'db',
        entry,
        scopeOf({ environment: fakeEnvironment({ DB_URL_NOT_SET: 'postgres://db' }) }),
      );
      expect(before.resolved).toBeUndefined();
      expect(after.resolved?.server).toMatchObject({ env: { URL: 'postgres://db' } });
    });
  },
);

spec(
  `mcp.troubleshooting.Invalid MCP server config for "<server>": <error>.URL is unset or invalid`,
  () => {
    test('a ${user_config.*} option that the URL uses and that is not set', async () => {
      const { resolved, issues } = await resolveMcpServer(
        'api',
        { type: 'http', url: 'https://${user_config.region}.example.com/mcp' },
        scopeOf({ userConfig: NO_VALUES }),
      );
      expect(resolved).toBeUndefined();
      expect(issues.at(-1)).toEqual({
        severity: 'error',
        path: 'mcpServers.api.url',
        message: invalid('api', 'URL is unset or invalid'),
      });
    });

    test('setting the option (/plugin configure <plugin>) is the fix: the URL then resolves', async () => {
      const { resolved } = await resolveMcpServer(
        'api',
        { type: 'http', url: 'https://${user_config.region}.example.com/mcp' },
        scopeOf(),
      );
      expect(resolved?.server).toMatchObject({ url: 'https://eu.example.com/mcp' });
    });
  },
);

spec(
  `mcp.troubleshooting.Invalid MCP server config for "<server>": <error>.has an invalid MCP url`,
  () => {
    test("the plugin's own url is not a URL: the cause is the plugin configuration, not an option", async () => {
      for (const url of ['not a url', '/relative/path', '']) {
        const { resolved, issues } = await resolveMcpServer(
          'api',
          { type: 'http', url },
          scopeOf(),
        );
        expect(resolved).toBeUndefined();
        expect(issues).toEqual([
          {
            severity: 'error',
            path: 'mcpServers.api.url',
            message: invalid('api', 'has an invalid MCP url'),
          },
        ]);
      }
    });

    test('the headersHelper case of the same entry: a helper that references ${user_config.*} keeps the server from starting', async () => {
      const { resolved, issues } = await resolveMcpServer(
        'api',
        {
          type: 'http',
          url: 'https://x.test/mcp',
          headersHelper: './h.sh ${user_config.api_token}',
        },
        scopeOf(),
      );
      expect(resolved).toBeUndefined();
      expect(issues[0]?.message).toBe(invalid('api', HELPER_MESSAGE('api')));
    });
  },
);

spec(
  `mcp.troubleshooting.Bundled MCP server "<name>" was not started: it needs configuration`,
  () => {
    const required = { token: { required: true } };

    test('a required setting with no saved value: the server is skipped with the quoted message and the rest of the plugin works', async () => {
      const files = memoryFiles({
        '.mcp.json': JSON.stringify({ mcpServers: { rest: { command: 'node' } } }),
      });
      const { servers, issues } = await collectMcpServers(files, './db.mcpb', {
        bundles: fakeBundles({ 'db.mcpb': bundle('database', required) }),
      });
      expect(issues).toEqual([
        {
          severity: 'error',
          path: 'mcpServers',
          message: 'Bundled MCP server "database" was not started: it needs configuration',
        },
      ]);
      expect(Object.keys(servers)).toEqual(['rest']);
    });

    test('once the values are saved (Configure in /plugin) and plugins reload, the server starts', async () => {
      const options = { bundles: fakeBundles({ 'db.mcpb': bundle('database', required) }) };
      const first = await collectMcpServers(memoryFiles({}), './db.mcpb', options);
      const saved = await collectMcpServers(memoryFiles({}), './db.mcpb', {
        ...options,
        bundleSettings: { database: { token: 'abc' } },
      });
      expect(Object.keys(first.servers)).toEqual([]);
      expect(Object.keys(saved.servers)).toEqual(['database']);
    });

    test('a setting that is not required does not keep it from starting', async () => {
      const { issues, servers } = await collectMcpServers(memoryFiles({}), './db.mcpb', {
        bundles: fakeBundles({ 'db.mcpb': bundle('database', { region: { required: false } }) }),
      });
      expect(issues).toEqual([]);
      expect(Object.keys(servers)).toEqual(['database']);
    });
  },
);

spec('mcp.troubleshooting.Server works with --plugin-dir but fails after install', () => {
  const server: PluginMcpServer = { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.js'] };

  test('paths written with ${CLAUDE_PLUGIN_ROOT} follow the plugin to wherever the host put it: its source directory, or the cache after install', async () => {
    const fromSource = await resolveMcpServer(
      'db',
      server,
      scopeOf({ locations: locations({ plugins: '/src/checkouts' }) }),
    );
    const afterInstall = await resolveMcpServer(
      'db',
      server,
      scopeOf({ locations: locations({ plugins: '/home/me/.claude/plugins/cache' }) }),
    );
    expect(fromSource.resolved?.server).toMatchObject({
      args: ['/src/checkouts/my-plugin@acme-tools/server.js'],
    });
    expect(afterInstall.resolved?.server).toMatchObject({
      args: ['/home/me/.claude/plugins/cache/my-plugin@acme-tools/server.js'],
    });
  });

  test('a path that only works from the source directory is passed through as written, and breaks once the plugin is copied', async () => {
    const { resolved } = await resolveMcpServer(
      'db',
      { command: 'node', args: ['../shared/server.js', './local.js'] },
      scopeOf(),
    );
    expect(resolved?.server).toEqual({
      command: 'node',
      args: ['../shared/server.js', './local.js'],
    });
  });
});

describe('what the docs leave open', () => {
  test('a server with a missing variable is a plain error issue and the other servers still resolve', async () => {
    const bad = await resolveMcpServer('bad', { command: '${GONE}' }, scopeOf());
    const good = await resolveMcpServer('good', { command: 'node' }, scopeOf());
    expect(bad.issues[0]?.severity).toBe('error');
    expect(good.resolved?.server).toEqual({ command: 'node' });
  });

  test('a failure dated in the future does not cache', () => {
    const stdio: PluginMcpServer = { command: 'node' };
    expect(skipsStdioConnection(stdio, { atMs: 5_000, server: stdio }, 1_000)).toBe(false);
  });
});
