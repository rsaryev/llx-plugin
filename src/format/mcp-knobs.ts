import type { McpTransport } from './mcp-config.ts';
import type { EnvLookup } from './mcp-env.ts';

/**
 * The environment variables that tune MCP servers and what each decides (env-vars.md, "Variables";
 * mcp.md, "Time limits on MCP tool calls", "Tool search for MCP server authors", "Option 3: Add a
 * local stdio server"). Pure over a lookup of the environment: reading the real one, and starting
 * anything, are the host's. The typed registry of every host variable lives with the environment
 * module; these are the semantics of the MCP rows.
 */

/** A positive whole number in plain digits; anything else is `undefined` (judgment, spec/judgments.md, for the timeouts). */
export function positiveWhole(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** "Timeout in milliseconds for MCP server startup (default: 30000, or 30 seconds)". */
const DEFAULT_STARTUP_MS = 30_000;
/** "Timeout in milliseconds for MCP tool execution (default: 100000000, about 28 hours)". */
const DEFAULT_TOOL_MS = 100_000_000;
/** "Each request also times out after 60 seconds by default". */
const REQUEST_FLOOR_MS = 60_000;
/** "Values below 1000 are floored to one second" (the variable) and "ignored" (the per-server field). */
const MIN_TOOL_MS = 1_000;
/** "Overrides the per-transport defaults of 300000 (5 minutes) for network servers and 1800000 (30 minutes) for stdio servers." */
const NETWORK_IDLE_MS = 300_000;
const STDIO_IDLE_MS = 1_800_000;
/** "How long blocking MCP startup waits, in milliseconds, for the connection batch ... (default: 5000)". */
const DEFAULT_CONNECT_MS = 5_000;

export interface McpTimeouts {
  /** `MCP_TIMEOUT`: one server's connect attempt. */
  readonly startupMs: number;
  /** The wall-clock limit of one tool call. */
  readonly toolMs: number;
  /** The per-request timer of an HTTP, SSE or connector server; none for stdio and WebSocket. */
  readonly requestMs: number | undefined;
  /**
   * How long a call may go with no response and no progress notification before it aborts; `undefined`
   * when there is no idle check (`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` is `0`, or an IDE or SDK server).
   */
  readonly idleMs: number | undefined;
}

export interface McpTimeoutServer {
  /** `connector` is a claude.ai connector; `ide` and `sdk` are an IDE's server and an in-process SDK server. */
  readonly transport: McpTransport | 'connector' | 'ide' | 'sdk';
  /** The per-server `timeout` as written; anything but a number of at least 1000 is ignored. */
  readonly timeout?: unknown;
}

/** Which servers have the second, per-request timer: "Stdio and WebSocket servers have no per-request timer." */
const HAS_REQUEST_TIMER: { readonly [T in McpServerKind]: boolean } = {
  http: true,
  sse: true,
  connector: true,
  stdio: false,
  ws: false,
  ide: false,
  sdk: false,
};

/** The idle window of each kind of server; "doesn't apply to IDE servers or SDK in-process servers". */
const DEFAULT_IDLE_MS: { readonly [T in McpServerKind]: number | undefined } = {
  http: NETWORK_IDLE_MS,
  sse: NETWORK_IDLE_MS,
  ws: NETWORK_IDLE_MS,
  connector: NETWORK_IDLE_MS,
  stdio: STDIO_IDLE_MS,
  ide: undefined,
  sdk: undefined,
};
type McpServerKind = McpTimeoutServer['transport'];

/**
 * The idle window of one server. `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` replaces the default of its kind:
 * `0` turns the check off, "values below 1000 are raised to one second, and the value is capped at the
 * effective `MCP_TOOL_TIMEOUT`"; "a per-server `timeout` of at least 1000 raises that server's idle
 * window to at least the `timeout` value". A value that is not plain digits is ignored (judgment,
 * spec/judgments.md).
 */
function idleWindow(
  lookup: EnvLookup,
  transport: McpServerKind,
  limits: { readonly toolMs: number; readonly own: number | undefined },
): number | undefined {
  const fallback = DEFAULT_IDLE_MS[transport];
  if (fallback === undefined) return undefined;
  const text = lookup('CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT');
  const written = /^\d+$/.test(text ?? '') ? Number(text) : undefined;
  if (written === 0) return undefined;
  const set =
    written === undefined ? fallback : Math.min(Math.max(written, MIN_TOOL_MS), limits.toolMs);
  return Math.max(set, limits.own ?? 0);
}

/**
 * `MCP_TIMEOUT`, `MCP_TOOL_TIMEOUT` and the server's own `timeout`. The tool timeout is the per-server
 * `timeout` (of at least 1000), else `MCP_TOOL_TIMEOUT` (below 1000 floored to 1000), else the default.
 * The per-request timer is "the greatest of three values: 60 seconds, the tool timeout that applies to
 * the server, and `MCP_TIMEOUT`", where an unset `MCP_TOOL_TIMEOUT` does not count its default.
 */
export function mcpTimeouts(lookup: EnvLookup, server: McpTimeoutServer): McpTimeouts {
  const startupMs = positiveWhole(lookup('MCP_TIMEOUT')) ?? DEFAULT_STARTUP_MS;
  const text = lookup('MCP_TOOL_TIMEOUT');
  const fromVariable = /^\d+$/.test(text ?? '') ? Math.max(Number(text), MIN_TOOL_MS) : undefined;
  const own =
    typeof server.timeout === 'number' && server.timeout >= MIN_TOOL_MS
      ? server.timeout
      : undefined;
  const applies = own ?? fromVariable;
  const toolMs = applies ?? DEFAULT_TOOL_MS;
  return {
    startupMs,
    toolMs,
    idleMs: idleWindow(lookup, server.transport, { toolMs, own }),
    requestMs: HAS_REQUEST_TIMER[server.transport]
      ? Math.max(REQUEST_FLOOR_MS, applies ?? 0, startupMs)
      : undefined,
  };
}

export const mcpConnectTimeoutMs = (lookup: EnvLookup): number =>
  positiveWhole(lookup('MCP_CONNECT_TIMEOUT_MS')) ?? DEFAULT_CONNECT_MS;

export interface McpDescriptionLimits {
  /** A tool description that loads upfront. */
  readonly upfront: number;
  /** A tool description loaded through tool search. */
  readonly deferred: number;
  readonly instructions: number;
}

/** "Server instructions, and the description of a tool that loads upfront: 4,096 characters"; "through tool search: 16,384". */
const DEFAULT_DESCRIPTION_LIMITS: McpDescriptionLimits = {
  upfront: 4_096,
  deferred: 16_384,
  instructions: 4_096,
};

/** `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`: "Claude Code uses that number for both limits"; anything but plain digits is ignored. */
export function mcpDescriptionLimits(lookup: EnvLookup): McpDescriptionLimits {
  const value = positiveWhole(lookup('CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH'));
  return value === undefined
    ? DEFAULT_DESCRIPTION_LIMITS
    : { upfront: value, deferred: value, instructions: value };
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/** "Claude sees only the text before the cut"; the cut keeps a surrogate pair whole (judgment, spec/judgments.md). */
export function cutMcpDescription(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const end = isHighSurrogate(text.charCodeAt(limit - 1)) ? limit - 1 : limit;
  return text.slice(0, end);
}

/** "For variables that turn a behavior on or off, set `1`, `true`, `yes`, or `on` ... `0`, `false`, `no`, or `off`, in any casing." */
const SWITCHES: Readonly<Record<string, boolean>> = {
  '1': true,
  true: true,
  yes: true,
  on: true,
  '0': false,
  false: false,
  no: false,
  off: false,
};

/** `true`, `false`, or `undefined` for an unset, empty or unrecognised value. */
export function switchOf(text: string | undefined): boolean | undefined {
  const key = text?.toLowerCase();
  return key !== undefined && Object.hasOwn(SWITCHES, key) ? SWITCHES[key] : undefined;
}

/**
 * Judgment (spec/judgments.md): the docs say "a safe baseline environment" and do not list it. These are
 * the variables a process needs to find programs, its home and its locale, and none holds a credential;
 * the host passes its own list when it knows better.
 */
export const MCP_ENV_BASELINE: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'TERM',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'USERPROFILE',
];

export interface McpStdioEnvironmentInput {
  /** The environment Claude Code runs in. */
  readonly snapshot: Readonly<Record<string, string>>;
  /** The server's configured `env`, after expansion. */
  readonly configured: Readonly<Record<string, string>>;
  /** "The project root": set as `CLAUDE_PROJECT_DIR` in the server's environment only. */
  readonly projectDir?: string;
  readonly baseline?: readonly string[];
}

/**
 * The environment a stdio server is spawned with. "`CLAUDE_CODE_MCP_ALLOWLIST_ENV` set to `1` spawns stdio
 * MCP servers with only a safe baseline environment plus the server's configured `env`, instead of
 * inheriting your shell environment"; `CLAUDE_PROJECT_DIR` is "set in the server's environment, not in
 * Claude Code's own environment".
 */
export function mcpStdioEnvironment(input: McpStdioEnvironmentInput): Record<string, string> {
  const allowlist = switchOf(input.snapshot.CLAUDE_CODE_MCP_ALLOWLIST_ENV) === true;
  const names = new Set(input.baseline ?? MCP_ENV_BASELINE);
  const inherited = allowlist
    ? Object.entries(input.snapshot).filter(([name]) => names.has(name))
    : Object.entries(input.snapshot);
  return {
    ...Object.fromEntries(inherited),
    ...(input.projectDir === undefined ? {} : { CLAUDE_PROJECT_DIR: input.projectDir }),
    ...input.configured,
  };
}

/**
 * `ENABLE_CLAUDEAI_MCP_SERVERS`: "Set to `false` to stop Claude Code from fetching claude.ai MCP servers.
 * Enabled by default for logged-in users." A value that is not an on/off spelling leaves the default.
 */
export function claudeAiConnectorsFetched(
  lookup: EnvLookup,
  session: { readonly loggedIn: boolean },
): boolean {
  return session.loggedIn && switchOf(lookup('ENABLE_CLAUDEAI_MCP_SERVERS')) !== false;
}
