/**
 * Judgments of spec/judgments.md about the allow and deny lists, and the messages of managed-mcp.md §
 * "How restrictions appear to users". Not under spec(): the docs are silent on the judgments, and the
 * messages belong to the display of a blocked server.
 */
import { expect, test, describe } from 'bun:test';
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
