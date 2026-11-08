/**
 * managed-mcp.md § "How `serverCommand` entries match": "A `serverCommand` entry holds the command and
 * its arguments as one array, as in `{ "serverCommand": ["npx", "-y", "server"] }`. Claude Code
 * compares that array with the command and arguments in the server's configuration: commands match
 * exactly, every argument, in order. `["npx", "-y", "server"]` does not match `["npx", "server"]` or
 * `["npx", "-y", "server", "--flag"]`. The `env` block isn't compared." And § "Environment variables
 * in `serverCommand` and `serverUrl` entries": "an entry written as `["${HOME}/bin/server"]` matches a
 * server config that uses either the same reference or the expanded path."
 */
import { describe, expect, test } from 'bun:test';
import { commandMatches } from '../../../src/settings/mcp/command-match.ts';
import { loads, policyOf, stdio } from '../../support/mcp-policy.ts';
import { spec } from '../../support/spec.ts';

const keep = (text: string): string => text;
const expandHome = (text: string): string => text.replace('${HOME}', '/home/ada');

spec('mcpSettings.managed.How serverCommand entries match', () => {
  test('every argument, in order: the docs examples', () => {
    const entry = ['npx', '-y', 'server'];
    expect(commandMatches(entry, ['npx', '-y', 'server'], keep)).toBe(true);
    expect(commandMatches(entry, ['npx', 'server'], keep)).toBe(false);
    expect(commandMatches(entry, ['npx', '-y', 'server', '--flag'], keep)).toBe(false);
    expect(commandMatches(entry, ['-y', 'npx', 'server'], keep)).toBe(false);
  });

  test('a server is compared as its command followed by its arguments', () => {
    const policy = policyOf([
      ['managed', { allowedMcpServers: [{ serverCommand: ['npx', '-y', 'server'] }] }],
    ]);
    expect(loads(policy, 'a', stdio('npx', '-y', 'server'))).toBe(true);
    expect(loads(policy, 'a', stdio('npx', 'server'))).toBe(false);
    expect(loads(policy, 'a', stdio('npx', '-y', 'server', '--flag'))).toBe(false);
    expect(loads(policy, 'a', stdio('npx'))).toBe(false);
  });

  test('the env block is not compared: any env values match', () => {
    const policy = policyOf([
      ['managed', { allowedMcpServers: [{ serverCommand: ['node', 'server.js'] }] }],
    ]);
    const withEnv = {
      command: 'node',
      args: ['server.js'],
      env: { NODE_OPTIONS: '--require x.js' },
    };
    expect(loads(policy, 'a', withEnv)).toBe(true);
    expect(loads(policy, 'a', { command: 'node', args: ['server.js'] })).toBe(true);
  });

  test('a command entry never matches a remote server', () => {
    const policy = policyOf([
      ['managed', { deniedMcpServers: [{ serverCommand: ['https://x.example.com/mcp'] }] }],
    ]);
    expect(loads(policy, 'a', { type: 'http', url: 'https://x.example.com/mcp' })).toBe(true);
  });
});

describe('the entry side of the comparison', () => {
  spec('mcpSettings.managed.Environment variables in serverCommand and serverUrl entries', () => {
    test('both sides expand before they are compared', () => {
      expect(commandMatches(['${HOME}/bin/server'], ['/home/ada/bin/server'], expandHome)).toBe(
        true,
      );
      expect(commandMatches(['${HOME}/bin/server'], ['/home/bob/bin/server'], expandHome)).toBe(
        false,
      );
    });
  });
});
