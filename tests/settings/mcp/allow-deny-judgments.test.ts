/**
 * Judgments of spec/judgments.md about the allow and deny lists, and the messages of managed-mcp.md §
 * "How restrictions appear to users". Not under spec(): the docs are silent on the judgments, and the
 * messages belong to the display of a blocked server.
 */
import { expect, test, describe } from 'bun:test';
import type { PolicyScope } from '../../../src/settings/index.ts';
import { loads, policyOf, remote, stdio, verdictOf } from '../../support/mcp-policy.ts';

const lock = { allowManagedMcpServersOnly: true };

// Judgments (spec/judgments.md) and the messages of "How restrictions appear to users".
describe('judgments and messages', () => {
  test('an allowlist URL entry that is ignored still counts as a serverUrl entry: a name entry does not admit a remote server', () => {
    const policy = policyOf(
      [
        [
          'managed',
          { allowedMcpServers: [{ serverUrl: 'https://${HOST}/*' }, { serverName: 'github' }] },
        ],
      ],
      { HOST: 'mcp.example.com' },
    );
    expect(loads(policy, 'github', remote('https://mcp.example.com/x'))).toBe(false);
    expect(loads(policy, 'github', stdio('x'))).toBe(true);
  });

  test('a parent allowlist applies only where no managed source sets one', () => {
    const parent = { allowedMcpServers: [{ serverName: 'p' }] };
    expect(loads(policyOf([['parent', parent]]), 'p', stdio('x'))).toBe(true);
    expect(loads(policyOf([['parent', parent]]), 'q', stdio('x'))).toBe(false);
    const withManaged = policyOf([
      ['managed', { allowedMcpServers: [{ serverName: 'm' }] }],
      ['parent', parent],
    ]);
    expect(loads(withManaged, 'p', stdio('x'))).toBe(false);
    expect(loads(withManaged, 'm', stdio('x'))).toBe(true);
  });

  test('a parent allowlist is the one in force under the lock when no managed source sets one', () => {
    const policy = policyOf([
      ['managed', lock],
      ['parent', { allowedMcpServers: [{ serverName: 'p' }] }],
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
    ]);
    expect(loads(policy, 'p', stdio('x'))).toBe(true);
    expect(loads(policy, 'u', stdio('x'))).toBe(false);
  });

  test('a parent denylist unions with the managed one', () => {
    const policy = policyOf([
      ['managed', { deniedMcpServers: [{ serverName: 'm' }] }],
      ['parent', { deniedMcpServers: [{ serverName: 'p' }] }],
    ]);
    expect(loads(policy, 'm', stdio('x'))).toBe(false);
    expect(loads(policy, 'p', stdio('x'))).toBe(false);
  });

  test('a server whose URL is not a URL after expansion matches no URL entry but can match a name', () => {
    const policy = policyOf([['managed', { deniedMcpServers: [{ serverName: 'broken' }] }]]);
    expect(loads(policy, 'broken', remote('not a url'))).toBe(false);
    expect(loads(policy, 'fine', remote('not a url'))).toBe(true);
  });

  test('the highest layer that sets a variable wins when a denylist entry is filled', () => {
    const entry = { deniedMcpServers: [{ serverUrl: 'https://${HOST}/*' }] };
    const filledBy = (...layers: readonly (readonly [PolicyScope, string])[]) => {
      const policy = policyOf([
        ['managed', entry],
        ...layers.map(([scope, host]) => [scope, { env: { HOST: host } }] as const),
      ]);
      return ['a', 'b'].filter(
        (host) => !loads(policy, 'x', remote(`https://${host}.example.com/`)),
      );
    };
    expect(filledBy(['user', 'a.example.com'], ['flag', 'b.example.com'])).toEqual(['b']);
    expect(filledBy(['flag', 'b.example.com'], ['user', 'a.example.com'])).toEqual(['b']);
    expect(filledBy(['flag', 'a.example.com'], ['parent', 'b.example.com'])).toEqual(['b']);
  });

  test('the parent and --settings layers fill a denylist variable, --add-dir files do not', () => {
    const entry = { deniedMcpServers: [{ serverUrl: 'https://${HOST}/*' }] };
    const blocked = (scope: PolicyScope) =>
      !loads(
        policyOf([
          ['managed', entry],
          [scope, { env: { HOST: 'staging.example.com' } }],
        ]),
        'a',
        remote('https://staging.example.com/x'),
      );
    expect(blocked('parent')).toBe(true);
    expect(blocked('flag')).toBe(true);
    expect(blocked('addDir')).toBe(false);
  });

  test('headersHelper is not a checked value of a managed-mcp.json server', () => {
    const policy = policyOf([['managed', { allowedMcpServers: [{ serverName: 'listed' }] }]]);
    const server = {
      type: 'http',
      url: 'https://x.example.com/mcp',
      headersHelper: '${X}',
    } as const;
    expect(loads(policy, 'a', server, 'managedFile')).toBe(true);
    expect(loads(policy, 'a', server)).toBe(false);
  });

  test('an empty serverUrl entry matches nothing on either list', () => {
    const policy = policyOf([
      [
        'managed',
        { allowedMcpServers: [{ serverUrl: '' }], deniedMcpServers: [{ serverUrl: '' }] },
      ],
    ]);
    expect(verdictOf(policy, 'a', remote('https://x.example.com/mcp'))).toMatchObject({
      allowed: false,
      blockedBy: 'allowlist',
    });
    const denyOnly = policyOf([['managed', { deniedMcpServers: [{ serverUrl: '' }] }]]);
    expect(loads(denyOnly, 'a', remote('https://x.example.com/mcp'))).toBe(true);
  });

  test('the serverName rule of each list applies in a user and a project file too', () => {
    for (const scope of ['user', 'project'] as const) {
      const allowed = policyOf([
        [scope, { allowedMcpServers: [{ serverName: 'two words' }, { serverName: 'ok' }] }],
      ]);
      expect([scope, loads(allowed, 'two words', stdio('x'))]).toEqual([scope, false]);
      expect([scope, loads(allowed, 'ok', stdio('x'))]).toEqual([scope, true]);
      const denied = policyOf([[scope, { deniedMcpServers: [{ serverName: 'two words' }] }]]);
      expect([scope, loads(denied, 'two words', stdio('x'))]).toEqual([scope, false]);
    }
  });

  test('an empty managed allowlist under the lock replaces a lower, non-empty one', () => {
    const policy = policyOf([
      ['managed', { ...lock, allowedMcpServers: [] }],
      ['parent', { allowedMcpServers: [{ serverName: 'p' }] }],
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
    ]);
    expect(loads(policy, 'p', stdio('x'))).toBe(false);
    expect(loads(policy, 'u', stdio('x'))).toBe(false);
  });

  test('the messages users see', () => {
    const policy = policyOf([
      [
        'managed',
        { allowedMcpServers: [{ serverName: 'ok' }], deniedMcpServers: [{ serverName: 'bad' }] },
      ],
    ]);
    const denied = verdictOf(policy, 'bad', stdio('x'));
    const notListed = verdictOf(policy, 'other', stdio('x'));
    expect(denied.allowed ? '' : denied.status).toBe('Blocked by enterprise managed policy');
    expect(denied.allowed ? '' : denied.addError).toBe(
      'Cannot add MCP server "bad": server is explicitly blocked by enterprise policy',
    );
    expect(denied.allowed ? '' : denied.reconnectError).toBe(
      'MCP server bad is blocked by enterprise managed policy',
    );
    expect(notListed.allowed ? '' : notListed.addError).toBe(
      'Cannot add MCP server "other": not allowed by enterprise policy',
    );
  });

  test('a prototype name is a name, and a variable called constructor is unset', () => {
    const policy = policyOf([
      ['managed', { deniedMcpServers: [{ serverCommand: ['${constructor}'] }] }],
    ]);
    expect(loads(policy, 'a', stdio('${constructor}'))).toBe(false);
    expect(loads(policy, 'a', stdio('function Object() { [native code] }'))).toBe(true);
  });
});
