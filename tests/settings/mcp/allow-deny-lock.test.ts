/**
 * managed-mcp.md § "Restrict the allowlist to managed settings only"; settings-reference.md §
 * `allowManagedMcpServersOnly`; managed-settings.md § "Keys read from every admin source" ("a `true` in
 * any admin source turns the MCP allowlist lock on. While the lock is on, the managed
 * `allowedMcpServers` list comes from the highest-ranked admin source that sets one") and § "Keys that
 * fail closed" (an unreadable lock reads as `true`; the text "true" or "false" reads as that Boolean).
 */
import { expect, test } from 'bun:test';
import { KEY_SPECS } from '../../../src/settings/index.ts';
import { resolved } from '../../support/policy-context.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { loads, policyOf, remote, stdio } from '../../support/mcp-policy.ts';
import { spec } from '../../support/spec.ts';

const RESTRICT = 'mcpSettings.managed.Restrict the allowlist to managed settings only';

const lock = { allowManagedMcpServersOnly: true };
const github = { serverUrl: 'https://api.githubcopilot.com/*' };
const internal = { serverUrl: 'https://*.internal.example.com/*' };

spec(RESTRICT, () => {
  test('the docs example: allowlists from user, project and local settings are ignored', () => {
    const managed = { ...lock, allowedMcpServers: [github, internal] };
    const policy = policyOf([
      ['managed', managed],
      ['user', { allowedMcpServers: [{ serverUrl: 'https://user.example.org/*' }] }],
      ['project', { allowedMcpServers: [{ serverUrl: 'https://project.example.org/*' }] }],
      ['local', { allowedMcpServers: [{ serverUrl: 'https://local.example.org/*' }] }],
    ]);
    expect(loads(policy, 'a', remote('https://api.githubcopilot.com/mcp'))).toBe(true);
    expect(loads(policy, 'a', remote('https://x.internal.example.com/mcp'))).toBe(true);
    for (const host of ['user', 'project', 'local']) {
      expect(loads(policy, 'a', remote(`https://${host}.example.org/mcp`))).toBe(false);
    }
  });

  test('the denylist still merges from every settings scope, so users can block servers for themselves', () => {
    const policy = policyOf([
      ['managed', { ...lock, allowedMcpServers: [github] }],
      ['user', { deniedMcpServers: [{ serverName: 'mine' }] }],
    ]);
    expect(loads(policy, 'mine', remote('https://api.githubcopilot.com/mcp'))).toBe(false);
    expect(loads(policy, 'other', remote('https://api.githubcopilot.com/mcp'))).toBe(true);
  });
});

spec('mcpSettings.key.allowManagedMcpServersOnly', () => {
  test('is read from managed settings only, as a Boolean, default false', () => {
    expect(KEY_SPECS.allowManagedMcpServersOnly.scopes).toBe('managed');
    expect(layerOf('managed', lock).settings).toEqual(lock);
    for (const scope of ['user', 'project', 'local', 'flag'] as const) {
      expect(layerOf(scope, lock).settings).toEqual({});
      const found = issuesOf(scope, lock);
      expect(found).toHaveLength(1);
      expect(found[0]?.severity).toBe('warning');
    }
    const unset = policyOf([
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
      ['managed', { allowedMcpServers: [{ serverName: 'm' }] }],
    ]);
    expect(loads(unset, 'u', stdio('x'))).toBe(true);
  });

  test('false: allowlists from every settings scope merge', () => {
    const policy = policyOf([
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
      ['managed', { allowManagedMcpServersOnly: false, allowedMcpServers: [{ serverName: 'm' }] }],
    ]);
    expect(loads(policy, 'u', stdio('x'))).toBe(true);
    expect(loads(policy, 'm', stdio('x'))).toBe(true);
  });

  test('true: only managed allowedMcpServers are respected, a user list is ignored', () => {
    const policy = policyOf([
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
      ['managed', { ...lock, allowedMcpServers: [{ serverName: 'm' }] }],
    ]);
    expect(loads(policy, 'u', stdio('x'))).toBe(false);
    expect(loads(policy, 'm', stdio('x'))).toBe(true);
  });

  test('the docs example: only the server named github is allowed, and users can still add servers of their own', () => {
    const policy = policyOf([
      ['managed', { ...lock, allowedMcpServers: [{ serverName: 'github' }] }],
    ]);
    expect(loads(policy, 'github', stdio('x'))).toBe(true);
    expect(loads(policy, 'mine', stdio('x'))).toBe(false);
  });

  test('with the lock and no managed allowlist anywhere, every server that passes the denylist loads', () => {
    const policy = policyOf([
      ['managed', lock],
      [
        'user',
        { allowedMcpServers: [{ serverName: 'u' }], deniedMcpServers: [{ serverName: 'bad' }] },
      ],
    ]);
    expect(loads(policy, 'anything', stdio('x'))).toBe(true);
    expect(loads(policy, 'bad', stdio('x'))).toBe(false);
  });

  test('an unreadable lock in managed settings fails closed: it reads as true, with a warning', () => {
    const raw = { allowManagedMcpServersOnly: 'yes', allowedMcpServers: [{ serverName: 'm' }] };
    expect(layerOf('managed', raw).settings.allowManagedMcpServersOnly).toBe(true);
    expect(issuesOf('managed', raw)[0]?.message).toContain('was present but invalid');
    const policy = policyOf([
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
      ['managed', raw],
    ]);
    expect(loads(policy, 'u', stdio('x'))).toBe(false);
  });

  test('the text "true" or "false" reads as that Boolean, with a notice to drop the quotes', () => {
    expect(layerOf('managed', { allowManagedMcpServersOnly: 'true' }).settings).toEqual(lock);
    expect(layerOf('managed', { allowManagedMcpServersOnly: 'false' }).settings).toEqual({
      allowManagedMcpServersOnly: false,
    });
    expect(issuesOf('managed', { allowManagedMcpServersOnly: 'true' })[0]?.message).toContain(
      'quotes',
    );
  });

  test('a true in any admin source turns the lock on; the list comes from the highest-ranked source that sets one', () => {
    const high = { allowedMcpServers: [{ serverName: 'high' }] };
    const low = { allowManagedMcpServersOnly: true, allowedMcpServers: [{ serverName: 'low' }] };
    const policy = policyOf([
      ['managed', high],
      ['managed', low],
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
    ]);
    expect(loads(policy, 'high', stdio('x'))).toBe(true);
    expect(loads(policy, 'low', stdio('x'))).toBe(false);
    expect(loads(policy, 'u', stdio('x'))).toBe(false);
  });

  test('a lock in a lower admin source applies although the higher source sets no list: that source list is used', () => {
    const policy = policyOf([
      ['managed', { deniedMcpServers: [{ serverName: 'bad' }] }],
      ['managed', { ...lock, allowedMcpServers: [{ serverName: 'low' }] }],
    ]);
    expect(loads(policy, 'low', stdio('x'))).toBe(true);
    expect(loads(policy, 'other', stdio('x'))).toBe(false);
  });

  test('the policy over the resolved sources reads the lock the same way', () => {
    const policy = resolved([
      ['user', { allowedMcpServers: [{ serverName: 'u' }] }],
      ['managed', { ...lock, allowedMcpServers: [{ serverName: 'm' }] }],
    ]).mcp.serverPolicy();
    expect(loads(policy, 'u', stdio('x'))).toBe(false);
    expect(loads(policy, 'm', stdio('x'))).toBe(true);
  });
});
