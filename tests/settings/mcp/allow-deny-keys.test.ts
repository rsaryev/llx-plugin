/**
 * settings-reference.md § `allowedMcpServers` ("Scope: Any file. Entries from every file merge into one
 * allowlist"; "Once the list contains any `serverCommand` entry, a stdio server must match a
 * `serverCommand` entry, and once it contains any `serverUrl` entry, a remote server must match a
 * `serverUrl` entry") and § `deniedMcpServers` ("Entries from every file merge into one denylist"; "a
 * server on both lists is blocked").
 */
import { expect, test } from 'bun:test';
import { KEY_SPECS } from '../../../src/settings/index.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { loads, policyOf, remote, stdio } from '../../support/mcp-policy.ts';
import { spec } from '../../support/spec.ts';

spec('mcpSettings.key.allowedMcpServers', () => {
  test('is read from any file, merged into one allowlist', () => {
    expect(KEY_SPECS.allowedMcpServers.scopes).toBe('anyAndParent');
    for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
      expect(layerOf(scope, { allowedMcpServers: [{ serverName: 'a' }] }).settings).toEqual({
        allowedMcpServers: [{ serverName: 'a' }],
      });
    }
  });

  test('the docs example: only the stdio server the listed npx command starts', () => {
    const policy = policyOf([
      [
        'user',
        {
          allowedMcpServers: [
            { serverCommand: ['npx', '-y', '@modelcontextprotocol/server-filesystem'] },
          ],
        },
      ],
    ]);
    expect(loads(policy, 'fs', stdio('npx', '-y', '@modelcontextprotocol/server-filesystem'))).toBe(
      true,
    );
    expect(loads(policy, 'other', stdio('node', 'x.js'))).toBe(false);
  });

  test('once the list has a serverCommand entry a stdio server must match one, once it has a serverUrl entry a remote one must', () => {
    const policy = policyOf([
      [
        'user',
        {
          allowedMcpServers: [
            { serverName: 'named' },
            { serverCommand: ['node', 'ok.js'] },
            { serverUrl: 'https://ok.example.com/*' },
          ],
        },
      ],
    ]);
    expect(loads(policy, 'named', stdio('node', 'other.js'))).toBe(false);
    expect(loads(policy, 'named', remote('https://other.example.com/mcp'))).toBe(false);
    expect(loads(policy, 'x', stdio('node', 'ok.js'))).toBe(true);
    expect(loads(policy, 'x', remote('https://ok.example.com/mcp'))).toBe(true);
  });

  test('an allowlist entry with a serverName of a kind that already has stricter entries never matches anything', () => {
    const policy = policyOf([
      [
        'managed',
        {
          allowedMcpServers: [
            { serverName: 'github' },
            { serverUrl: 'https://a.example.com/*' },
            { serverCommand: ['x'] },
          ],
        },
      ],
    ]);
    expect(loads(policy, 'github', stdio('y'))).toBe(false);
    expect(loads(policy, 'github', remote('https://b.example.com/mcp'))).toBe(false);
  });

  test('a claude.ai connector is allowed by its serverUrl', () => {
    const policy = policyOf([
      ['managed', { allowedMcpServers: [{ serverUrl: 'https://mcp.slack.com/*' }] }],
    ]);
    expect(loads(policy, 'claude.ai Slack', remote('https://mcp.slack.com/mcp'))).toBe(true);
    expect(loads(policy, 'claude.ai Notion', remote('https://mcp.notion.com/mcp'))).toBe(false);
  });
});

spec('mcpSettings.key.deniedMcpServers', () => {
  test('is read from any file; entries from every file merge into one denylist', () => {
    expect(KEY_SPECS.deniedMcpServers.scopes).toBe('anyAndParent');
    const policy = policyOf([
      ['user', { deniedMcpServers: [{ serverName: 'filesystem' }] }],
      ['project', { deniedMcpServers: [{ serverCommand: ['npx', 'bad'] }] }],
      ['managed', { deniedMcpServers: [{ serverUrl: 'https://bad.example.com/*' }] }],
    ]);
    expect(loads(policy, 'filesystem', stdio('x'))).toBe(false);
    expect(loads(policy, 'a', stdio('npx', 'bad'))).toBe(false);
    expect(loads(policy, 'a', remote('https://bad.example.com/mcp'))).toBe(false);
    expect(loads(policy, 'a', remote('https://good.example.com/mcp'))).toBe(true);
  });

  test('a server on both lists is blocked', () => {
    const policy = policyOf([
      [
        'user',
        {
          allowedMcpServers: [{ serverName: 'filesystem' }],
          deniedMcpServers: [{ serverName: 'filesystem' }],
        },
      ],
    ]);
    expect(loads(policy, 'filesystem', stdio('x'))).toBe(false);
  });

  test('a serverUrl entry never blocks a stdio server and a serverCommand entry never a remote one', () => {
    const byUrl = policyOf([['user', { deniedMcpServers: [{ serverUrl: '*://*' }] }]]);
    expect(loads(byUrl, 'a', stdio('https://a.example.com/mcp'))).toBe(true);
    expect(loads(byUrl, 'a', remote('https://a.example.com/mcp'))).toBe(false);
    const byCommand = policyOf([
      ['user', { deniedMcpServers: [{ serverCommand: ['https://a.example.com/mcp'] }] }],
    ]);
    expect(loads(byCommand, 'a', remote('https://a.example.com/mcp'))).toBe(true);
    expect(loads(byCommand, 'a', stdio('https://a.example.com/mcp'))).toBe(false);
  });
});
