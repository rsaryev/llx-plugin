/**
 * env-vars.md § Variables for `MCP_SERVER_CONNECTION_BATCH_SIZE`, `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE`,
 * `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, `MCP_CONNECTION_NONBLOCKING`, `CLAUDE_CODE_MCP_STARTUP_WAIT_MS`,
 * `MCP_DISCOVERY_CACHE` and its `_TTL_S`, `_MAX_STALE_S` and `_STRIKES`, `MCP_SDK_GENERATION` and
 * `MCP_PROTOCOL_NEGOTIATION`, with mcp.md § Automatic backgrounding of long tool calls, § Server status
 * detail and § MCP client runtimes, and agent-sdk/mcp.md § Connection timing. A value that is not plain
 * digits, the age exactly at a limit and the wording of a warning are judgments (spec/judgments.md),
 * asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  mcpBackgrounding,
  mcpCacheDiscardedAfterFailures,
  mcpCacheEntryUse,
  mcpClientSettings,
  mcpConnectionBatches,
  mcpDiscoveryCache,
  mcpFirstTurnWaitMs,
  mcpStartupWaitsFor,
} from '../../src/entry/format.ts';
import { spec } from '../support/spec.ts';

const env =
  (variables: Record<string, string> = {}) =>
  (name: string) =>
    variables[name];

spec('environment.host.MCP_SERVER_CONNECTION_BATCH_SIZE', () => {
  test('up to 3 local servers connect in parallel by default, and the variable changes it', () => {
    expect(mcpConnectionBatches(env()).local).toBe(3);
    expect(mcpConnectionBatches(env({ MCP_SERVER_CONNECTION_BATCH_SIZE: '8' })).local).toBe(8);
  });
});

spec('environment.host.MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE', () => {
  test('up to 20 remote servers connect in parallel by default, and the variable changes it', () => {
    expect(mcpConnectionBatches(env()).remote).toBe(20);
    expect(mcpConnectionBatches(env({ MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE: '5' })).remote).toBe(
      5,
    );
  });

  test('the two sizes are independent', () => {
    expect(mcpConnectionBatches(env({ MCP_SERVER_CONNECTION_BATCH_SIZE: '1' })).remote).toBe(20);
  });
});

spec('environment.host.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS', () => {
  test('a call moves to a background task after 120000 milliseconds by default', () => {
    expect(mcpBackgrounding(env())).toEqual({ afterMs: 120_000, waitsForTasks: false });
  });

  test('the variable changes the threshold', () => {
    expect(mcpBackgrounding(env({ CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '30000' })).afterMs).toBe(
      30_000,
    );
  });

  test('0 turns automatic backgrounding off and makes Claude wait for MCP tasks', () => {
    expect(mcpBackgrounding(env({ CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0' }))).toEqual({
      afterMs: undefined,
      waitsForTasks: true,
    });
  });
});

spec('environment.host.CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND', () => {
  test('1 makes Claude wait for an MCP task while automatic backgrounding stays on', () => {
    expect(mcpBackgrounding(env({ CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND: '1' }))).toEqual({
      afterMs: 120_000,
      waitsForTasks: true,
    });
  });
});

spec('environment.host.MCP_CONNECTION_NONBLOCKING', () => {
  const plain = { alwaysLoad: false, cached: false };
  const interactive = { printMode: false };

  test('startup is non-blocking by default', () => {
    expect(mcpStartupWaitsFor(env(), plain, interactive)).toBe(false);
  });

  test('0 makes startup wait for servers to connect before the first query', () => {
    const variables = env({ MCP_CONNECTION_NONBLOCKING: '0' });
    expect(mcpStartupWaitsFor(variables, plain, interactive)).toBe(true);
    expect(mcpStartupWaitsFor(env({ MCP_CONNECTION_NONBLOCKING: '1' }), plain, interactive)).toBe(
      false,
    );
  });

  test('a server with alwaysLoad: true makes startup wait regardless, except when served from the cache', () => {
    expect(mcpStartupWaitsFor(env(), { alwaysLoad: true, cached: false }, interactive)).toBe(true);
    expect(mcpStartupWaitsFor(env(), { alwaysLoad: true, cached: true }, interactive)).toBe(false);
  });

  test('claude -p waits for pending servers before the first turn regardless of the variable', () => {
    expect(mcpStartupWaitsFor(env(), plain, { printMode: true })).toBe(true);
  });
});

spec('environment.host.CLAUDE_CODE_MCP_STARTUP_WAIT_MS', () => {
  test('without the variable the default first-turn wait applies', () => {
    expect(mcpFirstTurnWaitMs(env(), 'other')).toBeUndefined();
  });

  test('the value replaces the wait, and 0 skips it', () => {
    expect(mcpFirstTurnWaitMs(env({ CLAUDE_CODE_MCP_STARTUP_WAIT_MS: '5000' }), 'other')).toBe(
      5_000,
    );
    expect(mcpFirstTurnWaitMs(env({ CLAUDE_CODE_MCP_STARTUP_WAIT_MS: '0' }), 'other')).toBe(0);
  });

  test('three waits apply whatever the value: the permission prompt server and an SDK server wait up to MCP_TIMEOUT, a named server at least 2 seconds', () => {
    const variables = env({ CLAUDE_CODE_MCP_STARTUP_WAIT_MS: '0', MCP_TIMEOUT: '45000' });
    expect(mcpFirstTurnWaitMs(variables, 'permission-prompt')).toBe(45_000);
    expect(mcpFirstTurnWaitMs(variables, 'sdk')).toBe(45_000);
    expect(mcpFirstTurnWaitMs(variables, 'named')).toBe(2_000);
    expect(mcpFirstTurnWaitMs(env({ CLAUDE_CODE_MCP_STARTUP_WAIT_MS: '9000' }), 'named')).toBe(
      9_000,
    );
  });
});

spec('environment.host.MCP_DISCOVERY_CACHE', () => {
  test('the cache is off unless a gradual rollout has enabled it', () => {
    expect(mcpDiscoveryCache(env(), { rolledOut: false }).enabled).toBe(false);
    expect(mcpDiscoveryCache(env(), { rolledOut: true }).enabled).toBe(true);
  });

  test('1 turns it on, and 0 keeps it off even when the rollout has enabled it', () => {
    expect(mcpDiscoveryCache(env({ MCP_DISCOVERY_CACHE: '1' }), { rolledOut: false }).enabled).toBe(
      true,
    );
    expect(mcpDiscoveryCache(env({ MCP_DISCOVERY_CACHE: '0' }), { rolledOut: true }).enabled).toBe(
      false,
    );
  });
});

spec('environment.host.MCP_DISCOVERY_CACHE_TTL_S', () => {
  const cache = (variables: Record<string, string>) =>
    mcpDiscoveryCache(env(variables), { rolledOut: true });

  test('an entry is used without a refresh for 900 seconds by default', () => {
    expect(cache({}).ttlSeconds).toBe(900);
    expect(cache({ MCP_DISCOVERY_CACHE_TTL_S: '60' }).ttlSeconds).toBe(60);
  });

  test('an entry older than the TTL is still used but refreshed in the background', () => {
    expect(mcpCacheEntryUse(cache({}), 901)).toBe('use-and-refresh');
    expect(mcpCacheEntryUse(cache({}), 10)).toBe('use');
  });

  test('the value is capped at MCP_DISCOVERY_CACHE_MAX_STALE_S, 4 hours by default', () => {
    expect(cache({ MCP_DISCOVERY_CACHE_TTL_S: '999999' }).ttlSeconds).toBe(14_400);
    const both = { MCP_DISCOVERY_CACHE_TTL_S: '999999', MCP_DISCOVERY_CACHE_MAX_STALE_S: '2000' };
    expect(cache(both).ttlSeconds).toBe(2_000);
  });
});

spec('environment.host.MCP_DISCOVERY_CACHE_MAX_STALE_S', () => {
  const cache = (variables: Record<string, string>) =>
    mcpDiscoveryCache(env(variables), { rolledOut: true });

  test('the default is 14400 seconds, and the variable changes it', () => {
    expect(cache({}).maxStaleSeconds).toBe(14_400);
    expect(cache({ MCP_DISCOVERY_CACHE_MAX_STALE_S: '3600' }).maxStaleSeconds).toBe(3_600);
  });

  test('an entry older than that is discarded and the server connects at startup', () => {
    expect(mcpCacheEntryUse(cache({}), 14_401)).toBe('discard');
    expect(mcpCacheEntryUse(cache({}), 14_000)).toBe('use-and-refresh');
  });

  test('Claude Code caps the value at 7 days', () => {
    expect(cache({ MCP_DISCOVERY_CACHE_MAX_STALE_S: '99999999' }).maxStaleSeconds).toBe(604_800);
  });
});

spec('environment.host.MCP_DISCOVERY_CACHE_STRIKES', () => {
  test('one failed refresh discards the entry by default', () => {
    const cache = mcpDiscoveryCache(env(), { rolledOut: true });
    expect(cache.strikes).toBe(1);
    expect(mcpCacheDiscardedAfterFailures(cache, 1)).toBe(true);
  });

  test('raising it lets that many refreshes in a row fail before the entry is discarded', () => {
    const cache = mcpDiscoveryCache(env({ MCP_DISCOVERY_CACHE_STRIKES: '3' }), { rolledOut: true });
    expect(mcpCacheDiscardedAfterFailures(cache, 2)).toBe(false);
    expect(mcpCacheDiscardedAfterFailures(cache, 3)).toBe(true);
  });
});

spec('environment.host.MCP_SDK_GENERATION', () => {
  test('without the variable the v2 runtime is used', () => {
    expect(mcpClientSettings(env()).runtime).toBe('v2');
  });

  test('v1 and v2 pin the runtime', () => {
    expect(mcpClientSettings(env({ MCP_SDK_GENERATION: 'v1' })).runtime).toBe('v1');
    expect(mcpClientSettings(env({ MCP_SDK_GENERATION: 'v2' })).runtime).toBe('v2');
  });

  test('an unrecognized value is ignored with a warning for the debug log', () => {
    const settings = mcpClientSettings(env({ MCP_SDK_GENERATION: 'v3' }));
    expect(settings.runtime).toBe('v2');
    expect(settings.warnings).toHaveLength(1);
  });

  test('only the v2 runtime checks the issuer of an OAuth authorization response', () => {
    expect(mcpClientSettings(env()).checksIssuer).toBe(true);
    expect(mcpClientSettings(env({ MCP_SDK_GENERATION: 'v1' })).checksIssuer).toBe(false);
  });
});

spec('environment.host.MCP_PROTOCOL_NEGOTIATION', () => {
  const negotiation = (variables: Record<string, string>) =>
    mcpClientSettings(env(variables)).negotiation;

  test('unset, Claude Code probes servers but can skip some', () => {
    expect(negotiation({})).toBe('default');
  });

  test('legacy keeps every server on the earlier handshake and auto probes the kinds that support it', () => {
    expect(negotiation({ MCP_PROTOCOL_NEGOTIATION: 'legacy' })).toBe('legacy');
    expect(negotiation({ MCP_PROTOCOL_NEGOTIATION: 'auto' })).toBe('auto');
  });

  test('any other value is ignored with a warning in the debug log', () => {
    const settings = mcpClientSettings(env({ MCP_PROTOCOL_NEGOTIATION: 'always' }));
    expect(settings.negotiation).toBe('default');
    expect(settings.warnings).toHaveLength(1);
  });

  test('it applies on the v2 runtime only', () => {
    expect(
      negotiation({ MCP_SDK_GENERATION: 'v1', MCP_PROTOCOL_NEGOTIATION: 'auto' }),
    ).toBeUndefined();
  });
});

describe('what the docs leave open', () => {
  test('a value that is not plain digits is ignored', () => {
    for (const text of ['', 'many', '-1', '2.5', '0x10']) {
      const variables = env({
        MCP_SERVER_CONNECTION_BATCH_SIZE: text,
        MCP_DISCOVERY_CACHE_TTL_S: text,
        CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: text,
        CLAUDE_CODE_MCP_STARTUP_WAIT_MS: text,
      });
      expect(mcpConnectionBatches(variables).local).toBe(3);
      expect(mcpDiscoveryCache(variables, { rolledOut: true }).ttlSeconds).toBe(900);
      expect(mcpBackgrounding(variables).afterMs).toBe(120_000);
      expect(mcpFirstTurnWaitMs(variables, 'other')).toBeUndefined();
    }
  });

  test('a batch size, a TTL and a strike count of 0 are ignored: a zero batch could never connect', () => {
    const variables = env({
      MCP_SERVER_CONNECTION_BATCH_SIZE: '0',
      MCP_DISCOVERY_CACHE_TTL_S: '0',
      MCP_DISCOVERY_CACHE_STRIKES: '0',
    });
    expect(mcpConnectionBatches(variables).local).toBe(3);
    expect(mcpDiscoveryCache(variables, { rolledOut: true })).toMatchObject({
      ttlSeconds: 900,
      strikes: 1,
    });
  });

  test('an entry exactly as old as a limit is not older than it', () => {
    const cache = mcpDiscoveryCache(env(), { rolledOut: true });
    expect(mcpCacheEntryUse(cache, 900)).toBe('use');
    expect(mcpCacheEntryUse(cache, 14_400)).toBe('use-and-refresh');
  });

  test('a cached server is never waited for at startup, even with MCP_CONNECTION_NONBLOCKING=0', () => {
    const variables = env({ MCP_CONNECTION_NONBLOCKING: '0' });
    expect(
      mcpStartupWaitsFor(variables, { alwaysLoad: false, cached: true }, { printMode: true }),
    ).toBe(false);
  });

  test('a variable that does not name a setting is a warning only on the runtime it belongs to', () => {
    const settings = mcpClientSettings(
      env({ MCP_SDK_GENERATION: 'v1', MCP_PROTOCOL_NEGOTIATION: 'always' }),
    );
    expect(settings.warnings).toEqual([]);
  });
});
