/**
 * env-vars.md § Variables for `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, with mcp.md § Time limits on MCP tool
 * calls (the idle window per kind of server, and the per-server `timeout` as its floor). A value that is
 * not plain digits is ignored: a judgment (spec/judgments.md), asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { mcpTimeouts, type McpTimeoutServer } from '../../src/entry/format.ts';
import { spec } from '../support/spec.ts';

const MINUTE = 60_000;
const idle = (variables: Record<string, string>, server: McpTimeoutServer) =>
  mcpTimeouts((name) => variables[name], server).idleMs;

spec('environment.host.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT', () => {
  test('the defaults are 5 minutes for HTTP, SSE, WebSocket and connector servers and 30 minutes for stdio', () => {
    for (const transport of ['http', 'sse', 'ws', 'connector'] as const) {
      expect(idle({}, { transport })).toBe(5 * MINUTE);
    }
    expect(idle({}, { transport: 'stdio' })).toBe(30 * MINUTE);
  });

  test('the variable overrides the default of every kind of server that has one', () => {
    const variables = { CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '90000' };
    for (const transport of ['http', 'sse', 'ws', 'connector', 'stdio'] as const) {
      expect(idle(variables, { transport })).toBe(90_000);
    }
  });

  test('0 disables the idle check', () => {
    expect(
      idle({ CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '0' }, { transport: 'stdio' }),
    ).toBeUndefined();
  });

  test('values below 1000 are raised to one second', () => {
    expect(idle({ CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '10' }, { transport: 'http' })).toBe(1_000);
  });

  test('the value is capped at the effective MCP_TOOL_TIMEOUT', () => {
    const variables = { CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '600000', MCP_TOOL_TIMEOUT: '120000' };
    expect(idle(variables, { transport: 'http' })).toBe(120_000);
  });

  test('a per-server timeout of at least 1000 raises that server idle window to at least the timeout', () => {
    expect(idle({}, { transport: 'http', timeout: 600_000 })).toBe(600_000);
    expect(idle({}, { transport: 'http', timeout: 60_000 })).toBe(5 * MINUTE);
    const short = { CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '2000' };
    expect(idle(short, { transport: 'stdio', timeout: 45_000 })).toBe(45_000);
  });

  test('a per-server timeout below 1000 is no floor', () => {
    const short = { CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '2000' };
    expect(idle(short, { transport: 'stdio', timeout: 999 })).toBe(2_000);
  });

  test('it does not apply to IDE servers or SDK in-process servers', () => {
    const variables = { CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '5000' };
    expect(idle(variables, { transport: 'ide' })).toBeUndefined();
    expect(idle(variables, { transport: 'sdk' })).toBeUndefined();
  });
});

describe('what the docs leave open', () => {
  test('a value that is not plain digits is ignored', () => {
    for (const text of ['', 'soon', '-5', '1.5', ' 7']) {
      expect(idle({ CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: text }, { transport: 'http' })).toBe(
        5 * MINUTE,
      );
    }
  });
});
