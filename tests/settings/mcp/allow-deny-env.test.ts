/**
 * managed-mcp.md § "Environment variables in `serverCommand` and `serverUrl` entries": both the entry
 * and the server's value expand before matching, the server from the live environment and a policy
 * entry from a pinned one (the environment Claude Code started with plus `env` values from managed
 * settings); `serverName` never expands; an allowlist URL entry whose expansion would change its scheme,
 * host, or path scope is ignored; a denylist variable with no startup value and no `:-default` fills
 * from settings files outside the repository.
 */
import { expect, test } from 'bun:test';
import { resolved } from '../../support/policy-context.ts';
import { loads, policyOf, remote, stdio } from '../../support/mcp-policy.ts';
import { spec } from '../../support/spec.ts';

const ENV = 'mcpSettings.managed.Environment variables in serverCommand and serverUrl entries';

spec(ENV, () => {
  const home = { HOME: '/home/ada' };

  test('an entry written as ["${HOME}/bin/server"] matches a config with the same reference or the expanded path', () => {
    const policy = policyOf(
      [['managed', { allowedMcpServers: [{ serverCommand: ['${HOME}/bin/server'] }] }]],
      home,
    );
    expect(loads(policy, 'a', stdio('${HOME}/bin/server'))).toBe(true);
    expect(loads(policy, 'a', stdio('/home/ada/bin/server'))).toBe(true);
    expect(loads(policy, 'a', stdio('/home/bob/bin/server'))).toBe(false);
  });

  test('arguments expand too, and ${VAR:-default} takes its default when the variable is unset', () => {
    const policy = policyOf(
      [
        [
          'managed',
          { allowedMcpServers: [{ serverCommand: ['node', '${ROOT:-/srv}/server.js'] }] },
        ],
      ],
      {},
    );
    expect(loads(policy, 'a', stdio('node', '/srv/server.js'))).toBe(true);
    expect(loads(policy, 'a', stdio('node', '${ROOT:-/srv}/server.js'))).toBe(true);
    expect(loads(policy, 'a', stdio('node', '/other/server.js'))).toBe(false);
  });

  test('serverName values match literally and never expand', () => {
    const policy = policyOf([['managed', { deniedMcpServers: [{ serverName: '${HOME}' }] }]], home);
    expect(loads(policy, '${HOME}', stdio('x'))).toBe(false);
    expect(loads(policy, '/home/ada', stdio('x'))).toBe(true);
  });

  test('the server value expands from the live environment, the policy entry from the pinned one', () => {
    const started = policyOf(
      [['managed', { allowedMcpServers: [{ serverCommand: ['${TOOLS}/run'] }] }]],
      {},
    );
    const live = { TOOLS: '/live' };
    const pinned = (entry: string) =>
      resolved([['managed', { allowedMcpServers: [{ serverCommand: [entry] }] }]], {
        env: { TOOLS: '/started' },
      }).mcp.serverPolicy(live);
    expect(loads(pinned('${TOOLS}/run'), 'a', stdio('/started/run'))).toBe(true);
    expect(loads(pinned('${TOOLS}/run'), 'a', stdio('/live/run'))).toBe(false);
    expect(loads(pinned('${TOOLS}/run'), 'a', stdio('${TOOLS}/run'))).toBe(false);
    expect(loads(pinned('/live/run'), 'a', stdio('${TOOLS}/run'))).toBe(true);
    expect(loads(started, 'a', stdio('/anything'))).toBe(false);
  });

  test('a variable set by a project, local or user settings file cannot change what an allowlist entry means', () => {
    const entry = { allowedMcpServers: [{ serverCommand: ['${TOOLS}/run'] }] };
    for (const scope of ['project', 'local', 'user'] as const) {
      const policy = policyOf(
        [
          ['managed', entry],
          [scope, { env: { TOOLS: '/evil' } }],
        ],
        {},
      );
      expect([scope, loads(policy, 'a', stdio('/evil/run'))]).toEqual([scope, false]);
    }
  });

  test('env values from managed settings do expand an allowlist entry; the startup environment wins', () => {
    const entry = { allowedMcpServers: [{ serverCommand: ['${TOOLS}/run'] }] };
    const managed = policyOf([['managed', { ...entry, env: { TOOLS: '/managed' } }]], {});
    expect(loads(managed, 'a', stdio('/managed/run'))).toBe(true);
    const both = policyOf([['managed', { ...entry, env: { TOOLS: '/managed' } }]], {
      TOOLS: '/started',
    });
    expect(loads(both, 'a', stdio('/started/run'))).toBe(true);
    expect(loads(both, 'a', stdio('/managed/run'))).toBe(false);
  });

  test('an allowlist URL entry whose expansion would change its scheme, host or path scope is ignored', () => {
    const env = { HOST: 'mcp.example.com', SCHEME: 'https', DIR: 'v1', PORT: '8443' };
    const allowed = (url: string) =>
      policyOf([['managed', { allowedMcpServers: [{ serverUrl: url }] }]], env);
    expect(loads(allowed('https://${HOST}/*'), 'a', remote('https://mcp.example.com/x'))).toBe(
      false,
    );
    expect(
      loads(allowed('${SCHEME}://mcp.example.com/*'), 'a', remote('https://mcp.example.com/x')),
    ).toBe(false);
    expect(
      loads(
        allowed('https://mcp.example.com/${DIR}/*'),
        'a',
        remote('https://mcp.example.com/v1/x'),
      ),
    ).toBe(false);
    expect(loads(allowed('${SCHEME}://${HOST}/*'), 'a', remote('https://mcp.example.com/x'))).toBe(
      false,
    );
    expect(
      loads(
        allowed('https://mcp.example.com:${PORT}/*'),
        'a',
        remote('https://mcp.example.com:8443/x'),
      ),
    ).toBe(true);
    expect(
      loads(allowed('https://mcp.example.com/*'), 'a', remote('https://mcp.example.com/x')),
    ).toBe(true);
  });

  test('a denylist URL entry with an expansion in its scope still matches', () => {
    const env = { HOST: 'staging.example.com' };
    const denied = (url: string) =>
      policyOf([['managed', { deniedMcpServers: [{ serverUrl: url }] }]], env);
    expect(loads(denied('https://${HOST}/*'), 'a', remote('https://staging.example.com/x'))).toBe(
      false,
    );
    expect(loads(denied('https://${HOST}/*'), 'a', remote('https://prod.example.com/x'))).toBe(
      true,
    );
  });

  test('a denylist variable with no startup value and no default fills from settings files outside the repository', () => {
    const entry = { deniedMcpServers: [{ serverUrl: 'https://${HOST}/*' }] };
    const blocked = (scope: 'user' | 'managed' | 'project' | 'local') =>
      !loads(
        policyOf(
          [
            ['managed', entry],
            [scope, { env: { HOST: 'staging.example.com' } }],
          ],
          {},
        ),
        'a',
        remote('https://staging.example.com/x'),
      );
    expect(blocked('user')).toBe(true);
    expect(blocked('managed')).toBe(true);
    expect(blocked('project')).toBe(false);
    expect(blocked('local')).toBe(false);
  });

  test('a denylist variable with a default takes the default, not a settings value', () => {
    const policy = policyOf([
      ['managed', { deniedMcpServers: [{ serverUrl: 'https://${HOST:-staging.example.com}/*' }] }],
      ['user', { env: { HOST: 'prod.example.com' } }],
    ]);
    expect(loads(policy, 'a', remote('https://staging.example.com/x'))).toBe(false);
    expect(loads(policy, 'a', remote('https://prod.example.com/x'))).toBe(true);
  });

  test('a URL server value expands from the live environment before it is matched', () => {
    const policy = policyOf(
      [['managed', { allowedMcpServers: [{ serverUrl: 'https://mcp.example.com/*' }] }]],
      { HOST: 'mcp.example.com' },
    );
    expect(loads(policy, 'a', remote('https://${HOST}/mcp'))).toBe(true);
    expect(loads(policy, 'a', remote('https://${OTHER}/mcp'))).toBe(false);
  });
});
