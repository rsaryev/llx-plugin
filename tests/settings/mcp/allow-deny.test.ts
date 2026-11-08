/**
 * managed-mcp.md § "Policy-based control with allowlists and denylists" (unset, empty and populated
 * lists; "Without `allowManagedMcpServersOnly`, allowlists from every settings scope merge ...
 * Denylists merge from every scope regardless"), § "How a server is evaluated" (merge, check the
 * denylist, check the allowlist; remote servers by `serverUrl`, stdio by `serverCommand`, a
 * `serverName` match only when the list has no entry of that kind), § "Servers that skip the allowlist
 * check", § "How allowlists and denylists apply to the managed set", § "Environment variables in
 * `serverCommand` and `serverUrl` entries", § "Restrict the allowlist to managed settings only";
 * settings-reference.md § `allowedMcpServers`, `deniedMcpServers`, `allowManagedMcpServersOnly`;
 * managed-settings.md § "Keys read from every admin source" (the lock and the managed list across
 * admin sources). "How a server is evaluated" has no requirement id of its own: the evaluation tests
 * below prove it through the two ids that point at it, "Policy-based control ..." and "How allowlists
 * and denylists apply to the managed set".
 */
import { describe, expect, test } from 'bun:test';
import { MCP_SERVER_ORIGINS } from '../../../src/settings/mcp/index.ts';
import { loads, policyOf, remote, stdio, verdictOf } from '../../support/mcp-policy.ts';
import { spec } from '../../support/spec.ts';

const POLICY = 'mcpSettings.managed.Policy-based control with allowlists and denylists';
const MANAGED_SET = 'mcpSettings.managed.How allowlists and denylists apply to the managed set';

const approved = { serverCommand: ['npx', '-y', 'approved-package'] };

spec([POLICY, MANAGED_SET], () => {
  describe('the docs example configuration', () => {
    const policy = policyOf([
      [
        'managed',
        {
          allowedMcpServers: [
            { serverUrl: 'https://api.githubcopilot.com/*' },
            { serverUrl: 'https://mcp.sentry.dev/*' },
            { serverCommand: ['npx', '-y', '@modelcontextprotocol/server-filesystem', '.'] },
            { serverCommand: ['python', '/usr/local/bin/approved-server.py'] },
            { serverUrl: 'https://mcp.example.com/*' },
            { serverUrl: 'https://*.internal.example.com/*' },
          ],
          deniedMcpServers: [
            { serverName: 'dangerous-server' },
            { serverCommand: ['npx', '-y', 'unapproved-package'] },
            { serverUrl: 'https://*.untrusted.example.com/*' },
          ],
        },
      ],
    ]);

    test('a user cannot get an unlisted remote server through by giving it an allowed name', () => {
      expect(loads(policy, 'github', remote('https://unlisted.example.org/mcp'))).toBe(false);
      expect(loads(policy, 'github', remote('https://api.githubcopilot.com/mcp'))).toBe(true);
    });

    test('every local server must match a listed command exactly', () => {
      expect(
        loads(policy, 'fs', stdio('npx', '-y', '@modelcontextprotocol/server-filesystem', '.')),
      ).toBe(true);
      expect(
        loads(policy, 'fs', stdio('npx', '-y', '@modelcontextprotocol/server-filesystem')),
      ).toBe(false);
      expect(loads(policy, 'approved-server', stdio('python', 'other.py'))).toBe(false);
    });

    test('denylist entries always apply, whatever the URL or command', () => {
      expect(loads(policy, 'dangerous-server', remote('https://mcp.example.com/api'))).toBe(false);
      expect(
        loads(policy, 'dangerous-server', stdio('python', '/usr/local/bin/approved-server.py')),
      ).toBe(false);
      expect(loads(policy, 'x', remote('https://a.untrusted.example.com/mcp'))).toBe(false);
    });
  });

  describe('the docs accordions', () => {
    test('URL-only allowlist', () => {
      const policy = policyOf([
        [
          'managed',
          {
            allowedMcpServers: [
              { serverUrl: 'https://mcp.example.com/*' },
              { serverUrl: 'https://*.internal.example.com/*' },
            ],
          },
        ],
      ]);
      expect(loads(policy, 'a', remote('https://mcp.example.com/api'))).toBe(true);
      expect(loads(policy, 'a', remote('https://api.internal.example.com/mcp'))).toBe(true);
      expect(loads(policy, 'a', remote('https://external.example.com/mcp'))).toBe(false);
      expect(loads(policy, 'a', stdio('anything'))).toBe(false);
    });

    test('command-only allowlist', () => {
      const policy = policyOf([['managed', { allowedMcpServers: [approved] }]]);
      expect(loads(policy, 'a', stdio('npx', '-y', 'approved-package'))).toBe(true);
      expect(loads(policy, 'a', stdio('node', 'server.js'))).toBe(false);
      expect(loads(policy, 'my-api', remote('https://api.example.com/mcp'))).toBe(false);
    });

    test('mixed name and command allowlist', () => {
      const policy = policyOf([
        ['managed', { allowedMcpServers: [{ serverName: 'github' }, approved] }],
      ]);
      expect(loads(policy, 'local-tool', stdio('npx', '-y', 'approved-package'))).toBe(true);
      expect(loads(policy, 'local-tool', stdio('node', 'server.js'))).toBe(false);
      expect(loads(policy, 'github', stdio('node', 'server.js'))).toBe(false);
      expect(loads(policy, 'github', remote('https://api.example.com/mcp'))).toBe(true);
      expect(loads(policy, 'other-api', remote('https://api.example.com/mcp'))).toBe(false);
    });

    test('name-only allowlist', () => {
      const policy = policyOf([
        [
          'managed',
          { allowedMcpServers: [{ serverName: 'github' }, { serverName: 'internal-tool' }] },
        ],
      ]);
      expect(loads(policy, 'github', stdio('any'))).toBe(true);
      expect(loads(policy, 'internal-tool', stdio('any'))).toBe(true);
      expect(loads(policy, 'github', remote('https://api.example.com/mcp'))).toBe(true);
      expect(loads(policy, 'other', stdio('any'))).toBe(false);
      expect(loads(policy, 'other', remote('https://api.example.com/mcp'))).toBe(false);
    });

    test('allowlist with denylist override', () => {
      const policy = policyOf([
        [
          'managed',
          {
            allowedMcpServers: [{ serverUrl: 'https://*.example.com/*' }],
            deniedMcpServers: [{ serverUrl: 'https://staging.example.com/*' }],
          },
        ],
      ]);
      expect(loads(policy, 'a', remote('https://mcp.example.com/api'))).toBe(true);
      expect(loads(policy, 'a', remote('https://staging.example.com/api'))).toBe(false);
      expect(loads(policy, 'a', remote('https://staging.example.com:8443/api'))).toBe(true);
      expect(loads(policy, 'a', remote('https://other.com/mcp'))).toBe(false);
    });
  });

  test('an SSE server is remote too', () => {
    const policy = policyOf([
      ['managed', { allowedMcpServers: [{ serverUrl: 'https://mcp.example.com/*' }] }],
    ]);
    expect(loads(policy, 'a', remote('https://mcp.example.com/sse', 'sse'))).toBe(true);
    expect(loads(policy, 'a', remote('https://other.example.com/sse', 'sse'))).toBe(false);
  });

  test('a server is blocked by the denylist before the allowlist is asked', () => {
    const policy = policyOf([
      [
        'managed',
        {
          allowedMcpServers: [{ serverName: 'filesystem' }],
          deniedMcpServers: [{ serverName: 'filesystem' }],
        },
      ],
    ]);
    const verdict = verdictOf(policy, 'filesystem', stdio('x'));
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed ? undefined : verdict.blockedBy).toBe('denylist');
    const other = verdictOf(policy, 'other', stdio('x'));
    expect(other.allowed ? undefined : other.blockedBy).toBe('allowlist');
  });

  test('allowedMcpServers unset: every server that passed the denylist loads; empty: none is allowed; populated: only matches', () => {
    expect(loads(policyOf([['managed', {}]]), 'a', stdio('x'))).toBe(true);
    expect(loads(policyOf([['managed', { allowedMcpServers: [] }]]), 'a', stdio('x'))).toBe(false);
    expect(
      loads(
        policyOf([['managed', { allowedMcpServers: [] }]]),
        'a',
        remote('https://a.example.com'),
      ),
    ).toBe(false);
    const populated = policyOf([['managed', { allowedMcpServers: [{ serverName: 'a' }] }]]);
    expect(loads(populated, 'a', stdio('x'))).toBe(true);
    expect(loads(populated, 'b', stdio('x'))).toBe(false);
  });

  test('deniedMcpServers unset or empty blocks nothing; populated blocks matches', () => {
    expect(loads(policyOf([['managed', {}]]), 'a', stdio('x'))).toBe(true);
    expect(loads(policyOf([['managed', { deniedMcpServers: [] }]]), 'a', stdio('x'))).toBe(true);
    const populated = policyOf([['managed', { deniedMcpServers: [{ serverName: 'a' }] }]]);
    expect(loads(populated, 'a', stdio('x'))).toBe(false);
    expect(loads(populated, 'b', stdio('x'))).toBe(true);
  });

  test('an empty allowlist set in a user file also admits no server', () => {
    expect(loads(policyOf([['user', { allowedMcpServers: [] }]]), 'a', stdio('x'))).toBe(false);
  });

  test('without the lock, allowlists from every settings scope merge, so a user can broaden the managed one', () => {
    const managed = { allowedMcpServers: [{ serverUrl: 'https://mcp.example.com/*' }] };
    const user = { allowedMcpServers: [{ serverUrl: 'https://mine.example.org/*' }] };
    expect(loads(policyOf([['managed', managed]]), 'a', remote('https://mine.example.org/x'))).toBe(
      false,
    );
    const both = policyOf([
      ['managed', managed],
      ['user', user],
    ]);
    expect(loads(both, 'a', remote('https://mine.example.org/x'))).toBe(true);
    expect(loads(both, 'a', remote('https://mcp.example.com/x'))).toBe(true);
    const everyScope = policyOf([
      ['project', { allowedMcpServers: [{ serverName: 'p' }] }],
      ['local', { allowedMcpServers: [{ serverName: 'l' }] }],
      ['flag', { allowedMcpServers: [{ serverName: 'f' }] }],
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
    ]);
    for (const name of ['p', 'l', 'f', 'u']) expect(loads(everyScope, name, stdio('x'))).toBe(true);
    expect(loads(everyScope, 'z', stdio('x'))).toBe(false);
  });

  test('denylists merge from every scope regardless, and a user can block a managed server for themselves', () => {
    const policy = policyOf([
      ['user', { deniedMcpServers: [{ serverName: 'records' }] }],
      ['project', { deniedMcpServers: [{ serverName: 'from-project' }] }],
      ['managed', { deniedMcpServers: [{ serverName: 'from-managed' }] }],
    ]);
    for (const name of ['records', 'from-project', 'from-managed']) {
      expect(loads(policy, name, remote('https://x.example.com/mcp'), 'managedSettings')).toBe(
        false,
      );
    }
    expect(loads(policy, 'other', remote('https://x.example.com/mcp'), 'managedSettings')).toBe(
      true,
    );
  });

  test('the denylist applies to a managed server whatever its origin, apart from in-process servers', () => {
    const policy = policyOf([['managed', { deniedMcpServers: [{ serverName: 'search' }] }]]);
    for (const origin of MCP_SERVER_ORIGINS) {
      const expected = origin === 'inProcess';
      expect([
        origin,
        loads(policy, 'search', remote('https://s.example.com/mcp'), origin),
      ]).toEqual([origin, expected]);
    }
  });

  test('the check runs on every evaluation: a server blocked later is blocked again on reconnect', () => {
    const before = policyOf([['user', {}]]);
    const after = policyOf([['user', { deniedMcpServers: [{ serverName: 'late' }] }]]);
    expect(loads(before, 'late', stdio('x'))).toBe(true);
    expect(loads(after, 'late', stdio('x'))).toBe(false);
  });
});
