/**
 * managed-mcp.md § "Match servers by URL, command, or name" (each entry "an object with a single key"),
 * § "How `serverName` entries match" (the two lists validate the name differently), settings-reference.md
 * § `allowedMcpServers`, `deniedMcpServers`, and managed-settings.md § "Keys that fail closed" (for
 * `allowedMcpServers`: "Enforced as an empty allowlist until the value is fixed, so no MCP servers that
 * users add are admitted ... An individual invalid entry is stripped and the valid subset is
 * enforced"; for `deniedMcpServers`: "An individual invalid entry is stripped and the valid subset is
 * enforced. A wholly invalid value is dropped with a warning, since denying every server would block
 * servers the policy never named").
 */
import { describe, expect, test } from 'bun:test';
import { readMcpEntries, readMcpEntry } from '../../../src/settings/mcp/entries.ts';
import { loads, policyOf, remote, stdio } from '../../support/mcp-policy.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const ALLOWED = 'mcpSettings.key.allowedMcpServers';
const DENIED = 'mcpSettings.key.deniedMcpServers';

describe('an entry is an object with exactly one key', () => {
  test('each of the three keys is an entry', () => {
    expect(readMcpEntry({ serverName: 'github' }, 'allowed')).toEqual({
      kind: 'serverName',
      value: 'github',
    });
    expect(readMcpEntry({ serverCommand: ['npx', '-y', 'server'] }, 'allowed')).toEqual({
      kind: 'serverCommand',
      value: ['npx', '-y', 'server'],
    });
    expect(readMcpEntry({ serverUrl: 'https://mcp.example.com/*' }, 'denied')).toEqual({
      kind: 'serverUrl',
      value: 'https://mcp.example.com/*',
    });
  });

  test('two keys, no key, an unknown key, a non-object and a wrong value are no entry', () => {
    const bad: unknown[] = [
      { serverName: 'a', serverUrl: 'https://a.example.com/*' },
      {},
      { server: 'a' },
      'github',
      null,
      ['serverName'],
      { serverName: 3 },
      { serverCommand: [] },
      { serverCommand: 'npx' },
      { serverCommand: ['npx', 3] },
      { serverUrl: ['https://a.example.com/*'] },
    ];
    for (const entry of bad) {
      expect([entry, readMcpEntry(entry, 'allowed')]).toEqual([entry, undefined]);
      expect([entry, readMcpEntry(entry, 'denied')]).toEqual([entry, undefined]);
    }
  });

  test('the entries of a value that is no list are none', () => {
    expect(readMcpEntries('github', 'allowed')).toEqual([]);
    expect(readMcpEntries(undefined, 'denied')).toEqual([]);
  });
});

spec('mcpSettings.managed.How serverName entries match', () => {
  test('in the denylist a name is any non-empty text without leading or trailing whitespace', () => {
    for (const name of ['claude.ai Slack', 'filesystem', 'a b', 'My Server (2)']) {
      expect(readMcpEntry({ serverName: name }, 'denied')).toBeDefined();
    }
    for (const name of ['', ' x', 'x ', '\tx', 'x\n']) {
      expect(readMcpEntry({ serverName: name }, 'denied')).toBeUndefined();
    }
  });

  test('in the allowlist a name is letters, numbers, hyphens and underscores', () => {
    for (const name of ['github', 'My_Server-2', 'A1']) {
      expect(readMcpEntry({ serverName: name }, 'allowed')).toBeDefined();
    }
    for (const name of ['', 'claude.ai Slack', 'a b', 'a.b', 'a/b', 'a*', ' github']) {
      expect(readMcpEntry({ serverName: name }, 'allowed')).toBeUndefined();
    }
  });

  test('the docs example: a serverName entry in the denylist blocks the Slack connector by its display name', () => {
    const policy = policyOf([['user', { deniedMcpServers: [{ serverName: 'claude.ai Slack' }] }]]);
    expect(loads(policy, 'claude.ai Slack', remote('https://mcp.slack.com/mcp'))).toBe(false);
    expect(loads(policy, 'claude.ai Slack (2)', remote('https://mcp.slack.com/mcp'))).toBe(true);
  });

  test('an allowlist entry with a name outside the allowed characters is stripped from a managed layer', () => {
    const found = issuesOf('managed', {
      allowedMcpServers: [{ serverName: 'claude.ai Slack' }, { serverName: 'github' }],
    });
    expect(
      layerOf('managed', {
        allowedMcpServers: [{ serverName: 'claude.ai Slack' }, { serverName: 'github' }],
      }).settings.allowedMcpServers,
    ).toEqual([{ serverName: 'github' }]);
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('warning');
    expect(found[0]?.path).toBe('managed:allowedMcpServers[0]');
  });
});

spec(ALLOWED, () => {
  test('an invalid entry is stripped with a warning and the valid subset is enforced', () => {
    const raw = {
      allowedMcpServers: [
        { serverUrl: 'https://mcp.example.com/*' },
        { serverName: 'a', serverUrl: 'https://b.example.com/*' },
        { serverCommand: [] },
        { serverName: 'github' },
      ],
    };
    expect(layerOf('managed', raw).settings.allowedMcpServers).toEqual([
      { serverUrl: 'https://mcp.example.com/*' },
      { serverName: 'github' },
    ]);
    const found = issuesOf('managed', raw);
    expect(found.map((one) => one.path)).toEqual([
      'managed:allowedMcpServers[1]',
      'managed:allowedMcpServers[2]',
    ]);
  });

  test('a value that is no list in managed settings is enforced as an empty allowlist', () => {
    for (const value of ['github', { serverName: 'github' }, 3, true]) {
      const raw = { allowedMcpServers: value };
      expect(layerOf('managed', raw).settings.allowedMcpServers).toEqual([]);
      const found = issuesOf('managed', raw);
      expect(found).toHaveLength(1);
      expect(found[0]?.message).toContain('was present but invalid');
      const policy = policyOf([['managed', raw]]);
      expect(loads(policy, 'github', stdio('npx', 'github'))).toBe(false);
      expect(loads(policy, 'a', remote('https://mcp.example.com/mcp'))).toBe(false);
    }
  });

  test('the same value in a user file is dropped with a warning: no allowlist is set', () => {
    const raw = { allowedMcpServers: 'github' };
    expect(layerOf('user', raw).settings).toEqual({});
    expect(issuesOf('user', raw)).toHaveLength(1);
    expect(loads(policyOf([['user', raw]]), 'a', stdio('npx'))).toBe(true);
  });

  test('a null removes the key', () => {
    expect(layerOf('managed', { allowedMcpServers: null }).settings).toEqual({});
    expect(issuesOf('managed', { allowedMcpServers: null })).toEqual([]);
  });
});

spec(DENIED, () => {
  test('an invalid entry is stripped with a warning and the valid subset is enforced', () => {
    const raw = { deniedMcpServers: [{ serverName: 'filesystem' }, { serverUrl: 3 }, 'x'] };
    expect(layerOf('managed', raw).settings.deniedMcpServers).toEqual([
      { serverName: 'filesystem' },
    ]);
    expect(issuesOf('managed', raw).map((one) => one.path)).toEqual([
      'managed:deniedMcpServers[1]',
      'managed:deniedMcpServers[2]',
    ]);
    const policy = policyOf([['managed', raw]]);
    expect(loads(policy, 'filesystem', stdio('x'))).toBe(false);
    expect(loads(policy, 'other', stdio('x'))).toBe(true);
  });

  test('a wholly invalid value is dropped with a warning: denying every server would block servers the policy never named', () => {
    for (const scope of ['managed', 'user'] as const) {
      const raw = { deniedMcpServers: 'filesystem' };
      expect(layerOf(scope, raw).settings).toEqual({});
      const found = issuesOf(scope, raw);
      expect(found).toHaveLength(1);
      expect(found[0]?.severity).toBe('warning');
      expect(loads(policyOf([[scope, raw]]), 'filesystem', stdio('x'))).toBe(true);
    }
  });
});
