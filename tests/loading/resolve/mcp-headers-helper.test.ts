/**
 * plugins/manifest-reference.md § Fields that run through a shell (`headersHelper` rejects
 * `${user_config.*}`; the helper's environment carries `CLAUDE_PLUGIN_ROOT`,
 * `CLAUDE_CODE_MCP_SERVER_NAME` and `CLAUDE_CODE_MCP_SERVER_URL`, no option values); mcp.md § Use
 * dynamic headers for custom authentication (the same three variables; `${user_config.KEY}` goes in
 * `headers`); errors.md § Plugin command references user_config in a shell command (the message,
 * "The check runs on the command template, so the error appears even when no value is configured
 * yet"); plugins/troubleshooting.md § Invalid MCP server config
 * (`Invalid MCP server config for "<server>": <error>`).
 */
import { describe, expect, test } from 'bun:test';
import {
  headersHelperEnvironment,
  HEADERS_HELPER_GUARD,
  rejectUserConfigInShell,
  resolveMcpServer,
  type ResolvedUserConfig,
} from '../../../src/index.ts';
import { HELPER_MESSAGE, scopeOf, userConfig } from '../../support/mcp-scope.ts';
import { spec } from '../../support/spec.ts';

spec('userConfig.shell.headersHelper', () => {
  test('a headersHelper that references ${user_config.*} fails with the documented error and the server does not start', async () => {
    const { resolved, issues } = await resolveMcpServer(
      'internal-api',
      {
        type: 'http',
        url: 'https://mcp.internal.example.com',
        headersHelper: 'get-token --key ${user_config.api_token}',
      },
      scopeOf(),
    );
    expect(resolved).toBeUndefined();
    expect(issues).toEqual([
      {
        severity: 'error',
        path: 'mcpServers.internal-api.headersHelper',
        message: `Invalid MCP server config for "internal-api": ${HELPER_MESSAGE('internal-api')}`,
      },
    ]);
  });

  test('the check runs on the template: it fires with no value configured and for an undeclared key', async () => {
    const empty: ResolvedUserConfig = { declared: userConfig.declared, values: {} };
    for (const type of ['http', 'sse', 'ws'] as const) {
      const { resolved, issues } = await resolveMcpServer(
        'internal-api',
        {
          type,
          url: 'https://x.test',
          headersHelper: 'echo ${user_config.api_token} ${user_config.nope}',
        },
        scopeOf({ userConfig: empty }),
      );
      expect(resolved).toBeUndefined();
      expect(issues.map((found) => found.severity)).toEqual(['error']);
      expect(issues[0]?.message).toContain(HELPER_MESSAGE('internal-api'));
    }
  });

  test('the value is never substituted into the command', async () => {
    const { resolved, issues } = await resolveMcpServer(
      'internal-api',
      { type: 'http', url: 'https://x.test', headersHelper: 'echo ${user_config.api_token}' },
      scopeOf(),
    );
    expect(resolved).toBeUndefined();
    expect(JSON.stringify(issues)).not.toContain('s3cret');
  });

  test('${user_config.KEY} in headers, which is not shell-parsed, is the documented way and works', async () => {
    const { resolved, issues } = await resolveMcpServer(
      'internal-api',
      {
        type: 'http',
        url: 'https://x.test',
        headers: { Authorization: 'Bearer ${user_config.api_token}' },
        headersHelper: '${CLAUDE_PLUGIN_ROOT}/bin/helper.sh',
      },
      scopeOf(),
    );
    expect(issues).toEqual([]);
    expect(resolved?.server).toMatchObject({ headers: { Authorization: 'Bearer s3cret' } });
  });

  test('the helper runs with the plugin root, the server name and url, and no option values', async () => {
    const { resolved } = await resolveMcpServer(
      'internal-api',
      {
        type: 'http',
        url: 'https://mcp.${user_config.region}.example.com',
        headersHelper: './helper.sh',
      },
      scopeOf(),
    );
    expect(resolved?.headersHelperEnvironment).toEqual({
      CLAUDE_PLUGIN_ROOT: '/plugins/my-plugin@acme-tools',
      CLAUDE_CODE_MCP_SERVER_NAME: 'plugin:my-plugin:internal-api',
      CLAUDE_CODE_MCP_SERVER_URL: 'https://mcp.eu.example.com',
    });
  });

  test('rejectUserConfigInShell: the exact message, only for a reference', () => {
    expect(guarded('echo ${user_config.k}')).toEqual({
      severity: 'error',
      path: 'p',
      message: HELPER_MESSAGE('internal-api'),
    });
    expect(guarded('/opt/bin/get.sh ${CLAUDE_PLUGIN_ROOT} $HOME ${HOME}')).toBeUndefined();
  });
});

const guarded = (template: string) =>
  rejectUserConfigInShell(HEADERS_HELPER_GUARD, template, { server: 'internal-api' }, 'p');

describe('a server without a headersHelper has no helper environment', () => {
  test('stdio and a remote server with only headers', async () => {
    const stdio = await resolveMcpServer('db', { command: 'node' }, scopeOf());
    expect(stdio.resolved?.headersHelperEnvironment).toBeUndefined();
    const plain = await resolveMcpServer('api', { type: 'http', url: 'https://x.test' }, scopeOf());
    expect(plain.resolved?.headersHelperEnvironment).toBeUndefined();
  });

  test('headersHelperEnvironment alone', () => {
    expect(headersHelperEnvironment('api', 'https://x.test', scopeOf())).toEqual({
      CLAUDE_PLUGIN_ROOT: '/plugins/my-plugin@acme-tools',
      CLAUDE_CODE_MCP_SERVER_NAME: 'plugin:my-plugin:api',
      CLAUDE_CODE_MCP_SERVER_URL: 'https://x.test',
    });
  });
});
