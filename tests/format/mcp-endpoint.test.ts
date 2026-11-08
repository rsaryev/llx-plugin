/**
 * mcp.md § Scope hierarchy and precedence: "Two URL spellings count as the same endpoint when they
 * differ only in the letter case of the scheme or host, the scheme's default port, such as `:443` on
 * `https`, or a trailing slash. A different path, query string, userinfo, or non-default port makes
 * two servers." It "matches plugins and connectors by endpoint, so one that points at the same URL or
 * command as an enabled server above counts as a duplicate."
 */
import { describe, expect, test } from 'bun:test';
import { mcpEndpointKey } from '../../src/format/mcp-endpoint.ts';
import type { PluginMcpServer } from '../../src/format/mcp-config.ts';

const http = (url: string): PluginMcpServer => ({ type: 'http', url });
const same = (a: string, b: string): boolean => mcpEndpointKey(http(a)) === mcpEndpointKey(http(b));

describe('mcp.md § Scope hierarchy and precedence: URL endpoints', () => {
  test('letter case of the scheme and host does not make two', () => {
    expect(same('https://API.Example.com/mcp', 'HTTPS://api.example.com/mcp')).toBe(true);
  });

  test("the scheme's default port does not make two", () => {
    expect(same('https://api.example.com:443/mcp', 'https://api.example.com/mcp')).toBe(true);
    expect(same('http://api.example.com:80/mcp', 'http://api.example.com/mcp')).toBe(true);
    expect(same('wss://api.example.com:443/mcp', 'wss://api.example.com/mcp')).toBe(true);
  });

  test('a trailing slash does not make two', () => {
    expect(same('https://api.example.com/mcp/', 'https://api.example.com/mcp')).toBe(true);
    expect(same('https://api.example.com/', 'https://api.example.com')).toBe(true);
    expect(same('https://api.example.com/mcp/?a=1', 'https://api.example.com/mcp?a=1')).toBe(true);
  });

  test('the three spellings together are one endpoint', () => {
    expect(same('HTTPS://API.example.com:443/mcp/', 'https://api.example.com/mcp')).toBe(true);
  });

  test('a different path makes two', () => {
    expect(same('https://api.example.com/mcp', 'https://api.example.com/other')).toBe(false);
    expect(same('https://api.example.com/mcp', 'https://api.example.com/mcp/v2')).toBe(false);
  });

  test('the case of the path matters', () => {
    expect(same('https://api.example.com/MCP', 'https://api.example.com/mcp')).toBe(false);
  });

  test('a different query string makes two', () => {
    expect(same('https://api.example.com/mcp?a=1', 'https://api.example.com/mcp?a=2')).toBe(false);
    expect(same('https://api.example.com/mcp?a=1', 'https://api.example.com/mcp')).toBe(false);
  });

  test('userinfo makes two', () => {
    expect(same('https://u:p@api.example.com/mcp', 'https://api.example.com/mcp')).toBe(false);
    expect(same('https://u:p@api.example.com/mcp', 'https://u:q@api.example.com/mcp')).toBe(false);
  });

  test('a non-default port makes two', () => {
    expect(same('https://api.example.com:8443/mcp', 'https://api.example.com/mcp')).toBe(false);
    // 80 is the default of http, not of https
    expect(same('https://api.example.com:80/mcp', 'https://api.example.com/mcp')).toBe(false);
  });

  test('a different scheme makes two', () => {
    expect(same('http://api.example.com/mcp', 'https://api.example.com/mcp')).toBe(false);
  });

  test('the transport type does not matter, the endpoint does', () => {
    const sse: PluginMcpServer = { type: 'sse', url: 'https://api.example.com/mcp' };
    expect(mcpEndpointKey(sse)).toBe(mcpEndpointKey(http('https://api.example.com/mcp')));
  });
});

describe('mcp.md § Scope hierarchy and precedence: command endpoints', () => {
  test('the same command and arguments are one endpoint', () => {
    const a: PluginMcpServer = { command: 'npx', args: ['-y', 'pkg'] };
    const b: PluginMcpServer = {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'pkg'],
      env: { A: '1' },
    };
    expect(mcpEndpointKey(a)).toBe(mcpEndpointKey(b));
  });

  test('another command or other arguments make two', () => {
    const base: PluginMcpServer = { command: 'npx', args: ['-y', 'pkg'] };
    expect(mcpEndpointKey(base)).not.toBe(mcpEndpointKey({ command: 'bunx', args: ['-y', 'pkg'] }));
    expect(mcpEndpointKey(base)).not.toBe(mcpEndpointKey({ command: 'npx', args: ['pkg', '-y'] }));
    expect(mcpEndpointKey(base)).not.toBe(mcpEndpointKey({ command: 'npx' }));
  });
});

describe('endpoint key (judgments)', () => {
  test('a command and arguments never collide with another split of the same words', () => {
    // Judgment: arguments are not joined by a space, so `a b` + [] and `a` + [`b`] stay two.
    expect(mcpEndpointKey({ command: 'a b' })).not.toBe(
      mcpEndpointKey({ command: 'a', args: ['b'] }),
    );
  });

  test('a URL and a command never share a key', () => {
    expect(mcpEndpointKey(http('https://x.example/'))).not.toBe(
      mcpEndpointKey({ command: 'https://x.example/' }),
    );
  });

  test('a fragment is kept: only the spellings the docs list are merged', () => {
    expect(same('https://api.example.com/mcp#a', 'https://api.example.com/mcp')).toBe(false);
  });

  test('a URL that does not parse is its own endpoint by its text', () => {
    expect(same('not a url', 'not a url')).toBe(true);
    expect(same('not a url', 'not a url/')).toBe(false);
  });

  test('a stdio entry that carries a url key stays a command endpoint', () => {
    const odd = { type: 'stdio', command: 'srv', url: 'https://x.example/' } as const;
    expect(mcpEndpointKey(odd)).toBe(mcpEndpointKey({ command: 'srv' }));
  });
});
