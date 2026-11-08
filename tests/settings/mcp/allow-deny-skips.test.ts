/**
 * managed-mcp.md § "Servers that skip the allowlist check" (the organization's own servers, built-in
 * servers, a Claude Tag session's Slack tools, and in-process `type: "sdk"` servers that skip all three
 * checks), § "How allowlists and denylists apply to the managed set" (a `managed-mcp.json` server is
 * checked when it uses `${VAR}` expansion in its command, arguments, URL, or headers).
 */
import { expect, test } from 'bun:test';
import { loads, policyOf, remote, stdio } from '../../support/mcp-policy.ts';
import { spec } from '../../support/spec.ts';

const SKIPS = 'mcpSettings.managed.Servers that skip the allowlist check';

spec(SKIPS, () => {
  const policy = policyOf([['managed', { allowedMcpServers: [{ serverName: 'listed' }] }]]);
  const search = remote('https://search.example.com/mcp');

  test('the organization own servers: every managedMcpServers entry skips the allowlist', () => {
    expect(loads(policy, 'search', search)).toBe(false);
    expect(loads(policy, 'search', search, 'managedSettings')).toBe(true);
  });

  test('a managed-mcp.json entry with no ${VAR} outside env skips the allowlist', () => {
    expect(loads(policy, 'a', stdio('node', 'server.js'), 'managedFile')).toBe(true);
    const onlyEnv = { command: 'node', env: { API_KEY: '${API_KEY}', HOME_DIR: '${HOME:-/tmp}' } };
    expect(loads(policy, 'a', onlyEnv, 'managedFile')).toBe(true);
    expect(
      loads(
        policy,
        'a',
        {
          type: 'http',
          url: search.type === 'http' ? search.url : '',
          headers: { 'X-Team': 'eng' },
        },
        'managedFile',
      ),
    ).toBe(true);
  });

  test('a managed-mcp.json server that uses ${VAR} in its command, arguments, URL, or headers is still checked', () => {
    const checked: Parameters<typeof loads>[2][] = [
      { command: '${HOME}/bin/server' },
      { command: 'node', args: ['--config', '${CONFIG:-/etc/x.json}'] },
      { type: 'http', url: 'https://${HOST}/mcp' },
      {
        type: 'sse',
        url: 'https://x.example.com/sse',
        headers: { Authorization: 'Bearer ${TOKEN}' },
      },
    ];
    for (const server of checked) expect(loads(policy, 'a', server, 'managedFile')).toBe(false);
  });

  test('a ${...} that is no variable reference does not make the server checked', () => {
    expect(loads(policy, 'a', stdio('echo', '${not a name}'), 'managedFile')).toBe(true);
  });

  test('built-in servers skip the allowlist: Claude in Chrome, the ide server, servers the CLI configures', () => {
    expect(loads(policy, 'claude-in-chrome', stdio('chrome-bridge'), 'builtIn')).toBe(true);
    expect(loads(policy, 'ide', remote('http://127.0.0.1:5000/mcp'), 'builtIn')).toBe(true);
  });

  test('a Claude Tag session Slack tools skip the allowlist', () => {
    expect(loads(policy, 'slack', remote('https://slack.example.com/mcp'), 'claudeTagSlack')).toBe(
      true,
    );
  });

  test('a server a user, a plugin or claude.ai adds, or --mcp-config passes, is checked', () => {
    expect(loads(policy, 'search', search, 'configured')).toBe(false);
    expect(loads(policy, 'search', search)).toBe(false);
  });

  test('the denylist still applies to every server that skips the allowlist', () => {
    const denied = policyOf([
      [
        'managed',
        {
          allowedMcpServers: [],
          deniedMcpServers: [{ serverUrl: 'https://search.example.com/*' }],
        },
      ],
    ]);
    for (const origin of ['managedSettings', 'managedFile', 'builtIn', 'claudeTagSlack'] as const) {
      expect([origin, loads(denied, 'search', search, origin)]).toEqual([origin, false]);
    }
  });

  test('in-process type "sdk" servers skip all three checks', () => {
    const closed = policyOf([
      ['managed', { allowedMcpServers: [], deniedMcpServers: [{ serverName: 'sdk-tools' }] }],
    ]);
    expect(loads(closed, 'sdk-tools', stdio('x'), 'inProcess')).toBe(true);
  });

  test('an empty allowlist admits no server apart from those that skip the check', () => {
    const empty = policyOf([['managed', { allowedMcpServers: [] }]]);
    expect(loads(empty, 'a', stdio('x'))).toBe(false);
    expect(loads(empty, 'a', stdio('x'), 'managedSettings')).toBe(true);
    expect(loads(empty, 'a', stdio('x'), 'managedFile')).toBe(true);
  });
});
