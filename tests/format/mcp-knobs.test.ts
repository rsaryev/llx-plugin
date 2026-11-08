/**
 * env-vars.md § Variables for `MCP_TIMEOUT`, `MCP_TOOL_TIMEOUT`, `MCP_CONNECT_TIMEOUT_MS`,
 * `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`, `CLAUDE_CODE_MCP_ALLOWLIST_ENV`,
 * `ENABLE_CLAUDEAI_MCP_SERVERS` (and the on/off spellings its note gives), with mcp.md § Time limits on
 * MCP tool calls (the per-server `timeout`, the per-request timer), § Tool search for MCP server
 * authors (the 4,096 and 16,384 character limits) and § Option 3 (`CLAUDE_PROJECT_DIR` in the server's
 * environment). The safe baseline of `CLAUDE_CODE_MCP_ALLOWLIST_ENV`, the handling of a value that is
 * not a number and the kit's own names are judgments (spec/judgments.md), asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  claudeAiConnectorsFetched,
  cutMcpDescription,
  MCP_ENV_BASELINE,
  mcpConnectTimeoutMs,
  mcpDescriptionLimits,
  mcpStdioEnvironment,
  mcpTimeouts,
} from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const env =
  (variables: Record<string, string> = {}) =>
  (name: string) =>
    variables[name];

spec('environment.host.MCP_TIMEOUT', () => {
  test('"Timeout in milliseconds for MCP server startup (default: 30000, or 30 seconds)"', () => {
    expect(mcpTimeouts(env(), { transport: 'stdio' }).startupMs).toBe(30_000);
    expect(mcpTimeouts(env({ MCP_TIMEOUT: '45000' }), { transport: 'stdio' }).startupMs).toBe(
      45_000,
    );
  });
});

spec('environment.host.MCP_TOOL_TIMEOUT', () => {
  const tool = (variables: Record<string, string>, server: Parameters<typeof mcpTimeouts>[1]) =>
    mcpTimeouts(env(variables), server).toolMs;

  test('the default is 100000000 milliseconds, about 28 hours', () => {
    expect(tool({}, { transport: 'stdio' })).toBe(100_000_000);
  });

  test('the variable sets the timeout of MCP tool execution', () => {
    expect(tool({ MCP_TOOL_TIMEOUT: '120000' }, { transport: 'http' })).toBe(120_000);
  });

  test('for the variable, values below 1000 are floored to one second', () => {
    expect(tool({ MCP_TOOL_TIMEOUT: '250' }, { transport: 'stdio' })).toBe(1_000);
    expect(tool({ MCP_TOOL_TIMEOUT: '0' }, { transport: 'stdio' })).toBe(1_000);
    expect(tool({ MCP_TOOL_TIMEOUT: '1000' }, { transport: 'stdio' })).toBe(1_000);
  });

  test('a per-server timeout field overrides the variable for that server', () => {
    expect(tool({ MCP_TOOL_TIMEOUT: '120000' }, { transport: 'stdio', timeout: 5_000 })).toBe(
      5_000,
    );
    expect(tool({}, { transport: 'stdio', timeout: 5_000 })).toBe(5_000);
  });

  test('for the per-server field, values below 1000 are ignored and fall through to the variable or its default', () => {
    expect(tool({ MCP_TOOL_TIMEOUT: '120000' }, { transport: 'stdio', timeout: 999 })).toBe(
      120_000,
    );
    expect(tool({}, { transport: 'stdio', timeout: 999 })).toBe(100_000_000);
    expect(tool({}, { transport: 'stdio', timeout: 'soon' })).toBe(100_000_000);
  });

  test('an HTTP, SSE or connector server also times out each request after 60 seconds by default; stdio and WebSocket have no per-request timer', () => {
    for (const transport of ['http', 'sse', 'connector'] as const) {
      expect(mcpTimeouts(env(), { transport }).requestMs).toBe(60_000);
    }
    for (const transport of ['stdio', 'ws'] as const) {
      expect(mcpTimeouts(env(), { transport }).requestMs).toBeUndefined();
    }
  });

  test('setting the variable or the per-server timeout above 60000 raises the per-request limit', () => {
    expect(mcpTimeouts(env({ MCP_TOOL_TIMEOUT: '90000' }), { transport: 'http' }).requestMs).toBe(
      90_000,
    );
    expect(mcpTimeouts(env(), { transport: 'sse', timeout: 200_000 }).requestMs).toBe(200_000);
    expect(
      mcpTimeouts(env({ MCP_TOOL_TIMEOUT: '90000' }), { transport: 'http', timeout: 70_000 })
        .requestMs,
    ).toBe(70_000);
  });

  test('a lower value shortens the overall timeout but leaves the per-request limit at 60 seconds', () => {
    const limits = mcpTimeouts(env({ MCP_TOOL_TIMEOUT: '10000' }), { transport: 'http' });
    expect(limits.toolMs).toBe(10_000);
    expect(limits.requestMs).toBe(60_000);
  });

  test('the per-request timer is the greatest of 60 seconds, the tool timeout and MCP_TIMEOUT; the 28-hour default does not enter', () => {
    expect(mcpTimeouts(env({ MCP_TIMEOUT: '120000' }), { transport: 'http' }).requestMs).toBe(
      120_000,
    );
    expect(
      mcpTimeouts(env({ MCP_TIMEOUT: '120000', MCP_TOOL_TIMEOUT: '300000' }), { transport: 'http' })
        .requestMs,
    ).toBe(300_000);
    expect(mcpTimeouts(env(), { transport: 'http' }).requestMs).toBe(60_000);
  });
});

spec('environment.host.MCP_CONNECT_TIMEOUT_MS', () => {
  test('blocking MCP startup waits 5000 milliseconds by default for the connection batch', () => {
    expect(mcpConnectTimeoutMs(env())).toBe(5_000);
  });

  test('the variable sets it, and it is distinct from MCP_TIMEOUT', () => {
    expect(mcpConnectTimeoutMs(env({ MCP_CONNECT_TIMEOUT_MS: '8000' }))).toBe(8_000);
    expect(mcpConnectTimeoutMs(env({ MCP_TIMEOUT: '8000' }))).toBe(5_000);
    expect(
      mcpTimeouts(env({ MCP_CONNECT_TIMEOUT_MS: '8000' }), { transport: 'stdio' }).startupMs,
    ).toBe(30_000);
  });
});

spec('environment.host.CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH', () => {
  test('the defaults are 4096 characters, and 16384 for a tool loaded through tool search', () => {
    expect(mcpDescriptionLimits(env())).toEqual({
      upfront: 4_096,
      deferred: 16_384,
      instructions: 4_096,
    });
  });

  test('the value you set replaces both default limits: with 8192, the 4096 is raised and the 16384 is lowered', () => {
    expect(mcpDescriptionLimits(env({ CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH: '8192' }))).toEqual({
      upfront: 8_192,
      deferred: 8_192,
      instructions: 8_192,
    });
  });

  test('it accepts a positive whole number in plain digits; anything else is ignored and the defaults apply', () => {
    for (const value of ['0', '-1', '1.5', '1e3', ' 100', '100 ', '8k', '', 'abc', '+5', '0x10']) {
      expect(mcpDescriptionLimits(env({ CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH: value }))).toEqual({
        upfront: 4_096,
        deferred: 16_384,
        instructions: 4_096,
      });
    }
  });

  test('Claude sees only the text before the cut', () => {
    expect(cutMcpDescription('abcdef', 4)).toBe('abcd');
    expect(cutMcpDescription('abcdef', 6)).toBe('abcdef');
    expect(cutMcpDescription('abc', 10)).toBe('abc');
  });
});

spec('environment.host.CLAUDE_CODE_MCP_ALLOWLIST_ENV', () => {
  const shell = {
    PATH: '/usr/bin',
    HOME: '/home/me',
    AWS_PROFILE: 'work',
    EDITOR: 'vim',
    GITHUB_TOKEN: 'ghp_x',
  };

  test('unset, a stdio server inherits the shell environment plus its configured env', () => {
    const out = mcpStdioEnvironment({ snapshot: shell, configured: { API_KEY: 'k' } });
    expect(out).toMatchObject({ ...shell, API_KEY: 'k' });
  });

  test('set to 1, it gets only a safe baseline environment plus the configured env, not the shell environment', () => {
    const out = mcpStdioEnvironment({
      snapshot: { ...shell, CLAUDE_CODE_MCP_ALLOWLIST_ENV: '1' },
      configured: { API_KEY: 'k' },
    });
    expect(out).toEqual({ PATH: '/usr/bin', HOME: '/home/me', API_KEY: 'k' });
    expect(out.GITHUB_TOKEN).toBeUndefined();
    expect(out.AWS_PROFILE).toBeUndefined();
  });

  test('the configured env wins over the baseline and the shell', () => {
    const on = mcpStdioEnvironment({
      snapshot: { ...shell, CLAUDE_CODE_MCP_ALLOWLIST_ENV: '1' },
      configured: { PATH: '/opt/bin' },
    });
    expect(on.PATH).toBe('/opt/bin');
    expect(mcpStdioEnvironment({ snapshot: shell, configured: { EDITOR: 'nano' } }).EDITOR).toBe(
      'nano',
    );
  });

  test('the page on/off spellings turn it on: 1, true, yes, on in any casing; 0, false, no, off and empty do not', () => {
    for (const on of ['1', 'true', 'TRUE', 'Yes', 'on']) {
      const out = mcpStdioEnvironment({
        snapshot: { ...shell, CLAUDE_CODE_MCP_ALLOWLIST_ENV: on },
        configured: {},
      });
      expect(out.EDITOR).toBeUndefined();
    }
    for (const off of ['0', 'false', 'no', 'off', '']) {
      const out = mcpStdioEnvironment({
        snapshot: { ...shell, CLAUDE_CODE_MCP_ALLOWLIST_ENV: off },
        configured: {},
      });
      expect(out.EDITOR).toBe('vim');
    }
  });
});

spec('mcp.behavior.Option 3: Add a local stdio server', () => {
  test('CLAUDE_PROJECT_DIR is set in the spawned server environment to the project root, with or without the allowlist', () => {
    const shell = { PATH: '/usr/bin' };
    expect(
      mcpStdioEnvironment({ snapshot: shell, configured: {}, projectDir: '/work/app' }),
    ).toMatchObject({
      CLAUDE_PROJECT_DIR: '/work/app',
    });
    const allowlisted = mcpStdioEnvironment({
      snapshot: { ...shell, CLAUDE_CODE_MCP_ALLOWLIST_ENV: '1' },
      configured: {},
      projectDir: '/work/app',
    });
    expect(allowlisted.CLAUDE_PROJECT_DIR).toBe('/work/app');
  });

  test('it is set in the server environment, not in Claude Code own: the snapshot it was given is untouched', () => {
    const shell = Object.freeze({ PATH: '/usr/bin' });
    mcpStdioEnvironment({ snapshot: shell, configured: {}, projectDir: '/work/app' });
    expect(Object.hasOwn(shell, 'CLAUDE_PROJECT_DIR')).toBe(false);
  });
});

spec('environment.host.ENABLE_CLAUDEAI_MCP_SERVERS', () => {
  test('enabled by default for logged-in users', () => {
    expect(claudeAiConnectorsFetched(env(), { loggedIn: true })).toBe(true);
  });

  test('set to false it stops Claude Code from fetching claude.ai MCP servers', () => {
    for (const off of ['false', 'FALSE', '0', 'no', 'off']) {
      expect(
        claudeAiConnectorsFetched(env({ ENABLE_CLAUDEAI_MCP_SERVERS: off }), { loggedIn: true }),
      ).toBe(false);
    }
  });

  test('set to a value that turns it on it stays enabled; it is never enabled for a user who is not logged in', () => {
    for (const on of ['true', '1', 'yes', 'on']) {
      expect(
        claudeAiConnectorsFetched(env({ ENABLE_CLAUDEAI_MCP_SERVERS: on }), { loggedIn: true }),
      ).toBe(true);
      expect(
        claudeAiConnectorsFetched(env({ ENABLE_CLAUDEAI_MCP_SERVERS: on }), { loggedIn: false }),
      ).toBe(false);
    }
    expect(claudeAiConnectorsFetched(env(), { loggedIn: false })).toBe(false);
  });
});

describe('what the docs leave open', () => {
  test('a timeout variable that is not a positive whole number is ignored', () => {
    for (const value of ['', 'abc', '-5', '1.5', '10s']) {
      expect(mcpTimeouts(env({ MCP_TIMEOUT: value }), { transport: 'stdio' }).startupMs).toBe(
        30_000,
      );
      expect(mcpTimeouts(env({ MCP_TOOL_TIMEOUT: value }), { transport: 'stdio' }).toolMs).toBe(
        100_000_000,
      );
      expect(mcpConnectTimeoutMs(env({ MCP_CONNECT_TIMEOUT_MS: value }))).toBe(5_000);
    }
  });

  test('an unrecognised value of ENABLE_CLAUDEAI_MCP_SERVERS leaves the default', () => {
    expect(
      claudeAiConnectorsFetched(env({ ENABLE_CLAUDEAI_MCP_SERVERS: 'maybe' }), { loggedIn: true }),
    ).toBe(true);
  });

  test('the safe baseline is the host process names every server needs to start, and the host may pass its own', () => {
    expect(MCP_ENV_BASELINE).toContain('PATH');
    expect(MCP_ENV_BASELINE).toContain('HOME');
    expect(MCP_ENV_BASELINE).not.toContain('GITHUB_TOKEN');
    const out = mcpStdioEnvironment({
      snapshot: { CLAUDE_CODE_MCP_ALLOWLIST_ENV: '1', PATH: '/bin', LANG: 'C' },
      configured: {},
      baseline: ['LANG'],
    });
    expect(out).toEqual({ LANG: 'C' });
  });

  test('a cut never splits a surrogate pair', () => {
    expect(cutMcpDescription('ab😀cd', 3)).toBe('ab');
    expect(cutMcpDescription('ab😀cd', 4)).toBe('ab😀');
  });
});
