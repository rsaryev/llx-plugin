import type { EnvLookup } from './mcp-env.ts';
import { mcpTimeouts, positiveWhole, switchOf } from './mcp-knobs.ts';

/**
 * The environment variables that decide how MCP servers connect at startup and how long a call runs
 * before it moves to the background (env-vars.md, "Variables"; mcp.md, "Automatic backgrounding of long
 * tool calls", "Server status detail", "MCP client runtimes"; agent-sdk/mcp.md, "Connection timing").
 * Pure over a lookup of the environment: connecting, the cache on disk and the clock are the host's.
 * What a value that is not plain digits does is a judgment (spec/judgments.md): it is ignored.
 */

/** "Maximum number of local MCP servers (stdio) to connect in parallel during startup (default: 3)". */
const DEFAULT_LOCAL_BATCH = 3;
/** "Maximum number of remote MCP servers (HTTP/SSE) to connect in parallel during startup (default: 20)". */
const DEFAULT_REMOTE_BATCH = 20;

export interface McpConnectionBatches {
  /** `MCP_SERVER_CONNECTION_BATCH_SIZE`: stdio servers connecting at once. */
  readonly local: number;
  /** `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE`: HTTP and SSE servers connecting at once. */
  readonly remote: number;
}

export const mcpConnectionBatches = (lookup: EnvLookup): McpConnectionBatches => ({
  local: positiveWhole(lookup('MCP_SERVER_CONNECTION_BATCH_SIZE')) ?? DEFAULT_LOCAL_BATCH,
  remote: positiveWhole(lookup('MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE')) ?? DEFAULT_REMOTE_BATCH,
});

/** "An MCP tool call in the main conversation that is still running after two minutes moves to a background task." */
const DEFAULT_BACKGROUND_MS = 120_000;

export interface McpBackgrounding {
  /** Milliseconds before a running call moves to a background task; `undefined` when that is off. */
  readonly afterMs: number | undefined;
  /** In an interactive session Claude waits for the result of an MCP task instead of working on. */
  readonly waitsForTasks: boolean;
}

/** A value of plain digits, `0` included; anything else is `undefined`. */
const wholeOrZero = (text: string | undefined): number | undefined =>
  text !== undefined && /^\d+$/.test(text) && Number.isSafeInteger(Number(text))
    ? Number(text)
    : undefined;

/**
 * `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`: "Set to `0` to turn automatic backgrounding off and, in an
 * interactive session, to make Claude wait for MCP tasks"; `CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND` set
 * to `1` makes Claude wait for them while backgrounding stays on.
 */
export function mcpBackgrounding(lookup: EnvLookup): McpBackgrounding {
  const written = wholeOrZero(lookup('CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS'));
  const off = written === 0;
  return {
    afterMs: off ? undefined : (written ?? DEFAULT_BACKGROUND_MS),
    waitsForTasks: off || switchOf(lookup('CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND')) === true,
  };
}

export interface McpStartupServer {
  /** `alwaysLoad: true`: "their tools must be present when the first prompt is built". */
  readonly alwaysLoad: boolean;
  /** Its tool list comes from a valid discovery-cache entry: it connects on its first tool call. */
  readonly cached: boolean;
}

export interface McpStartupRun {
  /** `claude -p` without `--input-format stream-json`. */
  readonly printMode: boolean;
}

/**
 * Whether startup waits for one server before the first query. "MCP startup is non-blocking by default";
 * `MCP_CONNECTION_NONBLOCKING=0` waits for every server. A server with `alwaysLoad: true` "still make[s]
 * startup wait regardless, except when served from the discovery cache", and `claude -p` "also waits for
 * still-pending servers before the first turn regardless of this variable". Judgment (spec/judgments.md):
 * a cached server is not connected at startup, so it is never waited for.
 */
export function mcpStartupWaitsFor(
  lookup: EnvLookup,
  server: McpStartupServer,
  run: McpStartupRun,
): boolean {
  if (server.cached) return false;
  const blocking = switchOf(lookup('MCP_CONNECTION_NONBLOCKING')) === false;
  return blocking || server.alwaysLoad || run.printMode;
}

/** What keeps its own first-turn wait in a non-interactive session. */
export type McpFirstTurnServer = 'permission-prompt' | 'sdk' | 'named' | 'other';

/** "A still-connecting named server: at least up to 2 seconds, so a value below 2000 doesn't shorten its wait." */
const NAMED_SERVER_FLOOR_MS = 2_000;

/**
 * `CLAUDE_CODE_MCP_STARTUP_WAIT_MS`: how long the first turn waits for a server that is still
 * connecting, in place of the default wait (`undefined` when the variable is unset: the host's default
 * applies). `0` skips the wait. "Three waits apply whatever value you set, including `0`": the
 * `permissionPromptToolName` server and an in-process SDK server wait up to `MCP_TIMEOUT`, a named one
 * at least 2 seconds.
 */
export function mcpFirstTurnWaitMs(
  lookup: EnvLookup,
  server: McpFirstTurnServer,
): number | undefined {
  const written = wholeOrZero(lookup('CLAUDE_CODE_MCP_STARTUP_WAIT_MS'));
  if (written === undefined) return undefined;
  if (server === 'permission-prompt' || server === 'sdk') {
    return mcpTimeouts(lookup, { transport: 'stdio' }).startupMs;
  }
  return server === 'named' ? Math.max(written, NAMED_SERVER_FLOOR_MS) : written;
}

/** "Seconds for which Claude Code uses a discovery-cache entry without refreshing it (default: 900)". */
const DEFAULT_TTL_S = 900;
/** "Maximum age, in seconds, of a discovery-cache entry (default: 14400, or 4 hours)". */
const DEFAULT_MAX_STALE_S = 14_400;
/** "Claude Code caps the value at 7 days." */
const MAX_STALE_CEILING_S = 7 * 24 * 3_600;
/** "How many refreshes in a row can fail before Claude Code discards the entry ... (default: 1)". */
const DEFAULT_STRIKES = 1;

export interface McpDiscoveryCache {
  /** Whether the cache is on for this session. */
  readonly enabled: boolean;
  /** `MCP_DISCOVERY_CACHE_TTL_S`: seconds an entry is used without a refresh. */
  readonly ttlSeconds: number;
  /** `MCP_DISCOVERY_CACHE_MAX_STALE_S`: seconds after which an entry is discarded. */
  readonly maxStaleSeconds: number;
  /** `MCP_DISCOVERY_CACHE_STRIKES`: failed refreshes in a row that discard an entry. */
  readonly strikes: number;
}

/**
 * The discovery cache's settings. "The cache is off by default unless a gradual rollout has enabled it
 * for your account. Set to `1` to turn it on, or `0` to keep it off even when the rollout has enabled
 * it." The maximum age is capped at 7 days and the TTL at the maximum age. The releases before v2.1.238,
 * where the cache was on by default and nothing was capped, are not modelled: the kit follows the
 * release it is pinned to.
 */
export function mcpDiscoveryCache(
  lookup: EnvLookup,
  session: { readonly rolledOut: boolean },
): McpDiscoveryCache {
  const maxStaleSeconds = Math.min(
    positiveWhole(lookup('MCP_DISCOVERY_CACHE_MAX_STALE_S')) ?? DEFAULT_MAX_STALE_S,
    MAX_STALE_CEILING_S,
  );
  return {
    enabled: switchOf(lookup('MCP_DISCOVERY_CACHE')) ?? session.rolledOut,
    ttlSeconds: Math.min(
      positiveWhole(lookup('MCP_DISCOVERY_CACHE_TTL_S')) ?? DEFAULT_TTL_S,
      maxStaleSeconds,
    ),
    maxStaleSeconds,
    strikes: positiveWhole(lookup('MCP_DISCOVERY_CACHE_STRIKES')) ?? DEFAULT_STRIKES,
  };
}

/** What a start does with a cache entry of a given age. */
export type McpCacheUse = 'use' | 'use-and-refresh' | 'discard';

/**
 * "At a start where the entry is older than [the TTL], Claude Code still uses it but refreshes it in the
 * background. Once the entry is older than [the maximum age], Claude Code discards it" and connects the
 * server at startup. Judgment (spec/judgments.md): an entry exactly as old as a limit is not older.
 */
export function mcpCacheEntryUse(cache: McpDiscoveryCache, ageSeconds: number): McpCacheUse {
  if (ageSeconds > cache.maxStaleSeconds) return 'discard';
  return ageSeconds > cache.ttlSeconds ? 'use-and-refresh' : 'use';
}

/** Whether the entry is discarded once `failures` background refreshes in a row have failed. */
export const mcpCacheDiscardedAfterFailures = (
  cache: McpDiscoveryCache,
  failures: number,
): boolean => failures >= cache.strikes;

export type McpClientRuntime = 'v1' | 'v2';
export type McpProtocolNegotiation = 'legacy' | 'auto' | 'default';

export interface McpClientSettings {
  readonly runtime: McpClientRuntime;
  /**
   * `MCP_PROTOCOL_NEGOTIATION`, which applies "on the v2 MCP client runtime only": `legacy` keeps every
   * server on the earlier handshake, `auto` probes the kinds that support revision 2026-07-28, and
   * `default` (unset) probes them but may skip some. `undefined` on v1.
   */
  readonly negotiation: McpProtocolNegotiation | undefined;
  /** The v2 runtime "checks the issuer an MCP OAuth server returns in its authorization response". */
  readonly checksIssuer: boolean;
  /** For the debug log: "any other value is ignored with a warning". The wording is the kit's. */
  readonly warnings: readonly string[];
}

const RUNTIMES: Readonly<Record<string, McpClientRuntime>> = { v1: 'v1', v2: 'v2' };
const NEGOTIATIONS: Readonly<Record<string, McpProtocolNegotiation>> = {
  legacy: 'legacy',
  auto: 'auto',
};

/** The negotiation variable and the issuer check belong to the v2 runtime only. */
const IS_V2: { readonly [T in McpClientRuntime]: boolean } = { v1: false, v2: true };

/** The value the table names, or the default with the warning for a value it does not name. */
function choice<T>(
  table: Readonly<Record<string, T>>,
  variable: { readonly name: string; readonly text: string | undefined; readonly fallback: T },
): { readonly value: T; readonly warnings: readonly string[] } {
  const { name, text, fallback } = variable;
  if (text === undefined) return { value: fallback, warnings: [] };
  const named = Object.hasOwn(table, text) ? table[text] : undefined;
  if (named !== undefined) return { value: named, warnings: [] };
  return { value: fallback, warnings: [`${name}="${text}" is not a value it takes: ignored`] };
}

/**
 * `MCP_SDK_GENERATION` pins the client runtime (`v1`, or `v2`, the default; "if you set an unrecognized
 * value, Claude Code ignores it and writes a warning to the debug log") and `MCP_PROTOCOL_NEGOTIATION`
 * decides whether the v2 runtime probes servers for the newer revision.
 */
export function mcpClientSettings(lookup: EnvLookup): McpClientSettings {
  const runtime = choice<McpClientRuntime>(RUNTIMES, {
    name: 'MCP_SDK_GENERATION',
    text: lookup('MCP_SDK_GENERATION'),
    fallback: 'v2',
  });
  const v2 = IS_V2[runtime.value];
  const negotiation = choice<McpProtocolNegotiation>(NEGOTIATIONS, {
    name: 'MCP_PROTOCOL_NEGOTIATION',
    text: lookup('MCP_PROTOCOL_NEGOTIATION'),
    fallback: 'default',
  });
  return {
    runtime: runtime.value,
    negotiation: v2 ? negotiation.value : undefined,
    checksIssuer: v2,
    warnings: [...runtime.warnings, ...(v2 ? negotiation.warnings : [])],
  };
}
