import { z } from 'zod';
import type {
  McpHttpServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../protocol/official.ts';
import { error, type PluginIssue } from './issues.ts';

/**
 * MCP server entries of a plugin (plugins/components.md, "MCP servers"; mcp.md, "Plugin-provided MCP
 * servers"): stdio, SSE, HTTP and WebSocket. The SDK types the first three and not two things the
 * docs give: the `ws` transport and `headersHelper` on the remote ones ("The `type: "ws"` entry
 * accepts the same `url`, `headers`, `headersHelper`, `timeout`, and `alwaysLoad` fields as
 * `http`"). The kit therefore owns `PluginMcpServer`: the official types, plus exactly those fields.
 */

/** A remote server's `headersHelper`: a command that prints headers (mcp.md, "dynamic headers"). */
interface WithHeadersHelper {
  readonly headersHelper?: string;
}

export type SseMcpServer = McpSSEServerConfig & WithHeadersHelper;
export type HttpMcpServer = McpHttpServerConfig & WithHeadersHelper;
/** `ws` takes the fields of `http` (mcp.md, "Option 4: Add a remote WebSocket server"). */
export type WsMcpServer = Omit<McpHttpServerConfig, 'type'> &
  WithHeadersHelper & { readonly type: 'ws' };
export type RemoteMcpServer = SseMcpServer | HttpMcpServer | WsMcpServer;
export type PluginMcpServer = McpStdioServerConfig | RemoteMcpServer;

/** The transport names of a server's `type`; a server without a `type` is stdio. */
export const MCP_TRANSPORTS = ['stdio', 'sse', 'http', 'ws'] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

const text = z.string();
const wrongText = { error: 'expected a string' };
const common = {
  timeout: z.number().exactOptional(),
  alwaysLoad: z.boolean().exactOptional(),
};
const remote = {
  url: text,
  headers: z.record(text, text).exactOptional(),
  headersHelper: text.exactOptional(),
  ...common,
};

/**
 * Judgment (spec/judgments.md): the schemas check the fields the docs name and keep every other
 * field untouched (`oauth`, `tools`, ...), since mcp.md documents more keys than any one table lists.
 * An empty command names nothing to run, like an empty hook command.
 */
const SCHEMAS = {
  stdio: z.looseObject({
    type: z.literal('stdio').exactOptional(),
    command: text.min(1, wrongText),
    args: z.array(text).exactOptional(),
    env: z.record(text, text).exactOptional(),
    ...common,
  }),
  sse: z.looseObject({ type: z.literal('sse'), ...remote }),
  http: z.looseObject({ type: z.literal('http'), ...remote }),
  ws: z.looseObject({ type: z.literal('ws'), ...remote }),
} satisfies {
  readonly [T in McpTransport]: z.ZodType<
    T extends 'stdio' ? McpStdioServerConfig : Extract<PluginMcpServer, { type: T }>
  >;
};

const isTransport = (value: unknown): value is McpTransport =>
  typeof value === 'string' && Object.hasOwn(SCHEMAS, value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Which transports are reached over a URL (`url`, `headers` and `headersHelper` apply to them). */
const REMOTE: { readonly [T in McpTransport]: boolean } = {
  stdio: false,
  sse: true,
  http: true,
  ws: true,
};

/**
 * True for a server whose transport is `sse`, `http` or `ws`. The transport decides, not the
 * presence of a `url`: a stdio entry may carry a `url` key (its `type` is then `stdio`) and stays stdio.
 */
export const isRemoteMcpServer = (server: PluginMcpServer): server is RemoteMcpServer =>
  REMOTE[server.type ?? 'stdio'];

/**
 * Another name of a transport (mcp.md, "Option 2": "the `type` field accepts `streamable-http` as an
 * alias for `http`"). Judgment: the entry is read as the transport it names, so the server the kit
 * returns carries `type: "http"`, the type the SDK knows.
 */
const ALIASES: Readonly<Record<string, McpTransport>> = { 'streamable-http': 'http' };

/** Types only an SDK host application can register (mcp.md, "Option 2"): the entry is skipped. */
const HOST_ONLY: Readonly<Record<string, true>> = { sdk: true };

const aliasOf = (value: unknown): McpTransport | undefined =>
  typeof value === 'string' && Object.hasOwn(ALIASES, value) ? ALIASES[value] : undefined;

const isHostOnly = (value: unknown): boolean =>
  typeof value === 'string' && Object.hasOwn(HOST_ONLY, value);

const reason = (failure: z.ZodError): string =>
  failure.issues
    .map((found) =>
      found.path.length > 0 ? `${found.path.join('.')}: ${found.message}` : found.message,
    )
    .join('; ');

const dropped = (name: string, origin: string, why: string): PluginIssue =>
  error(origin, `Invalid MCP server config for "${name}": ${why}`);

export interface McpServerRead {
  /** Undefined when Claude Code would drop the entry. */
  readonly server: PluginMcpServer | undefined;
  readonly issues: readonly PluginIssue[];
}

/**
 * The two entries mcp.md ("Option 2") says Claude Code skips with a quoted message: a `url` with no
 * `type` (read as stdio, so it fails) and a `type: "sdk"` entry.
 */
function refusalOf(name: string, raw: Record<string, unknown>): string | undefined {
  if (isHostOnly(raw.type)) {
    return `Skipped — MCP server "${name}" declares type "sdk", which only an SDK host application can register`;
  }
  return raw.type === undefined && 'url' in raw
    ? `MCP server "${name}" has a "url" but no "type"; add "type": "http" (or "sse" / "ws") to this entry`
    : undefined;
}

/**
 * Reads one entry. An entry Claude Code would drop is an error naming the server, in the form
 * plugins/troubleshooting.md quotes: `Invalid MCP server config for "<server>": <error>`. The text
 * after the colon is the kit's (the docs give no text for a malformed entry).
 */
export function readMcpServer(name: string, raw: unknown, origin: string): McpServerRead {
  if (!isRecord(raw)) {
    return { server: undefined, issues: [dropped(name, origin, 'expected an object')] };
  }
  const refusal = refusalOf(name, raw);
  if (refusal) return { server: undefined, issues: [error(origin, refusal)] };
  const alias = aliasOf(raw.type);
  const transport = alias ?? raw.type ?? 'stdio';
  if (!isTransport(transport)) {
    const names = [...MCP_TRANSPORTS, ...Object.keys(ALIASES)];
    const why = `"type" must be one of ${names.map((each) => `"${each}"`).join(', ')}`;
    return { server: undefined, issues: [dropped(name, origin, why)] };
  }
  const parsed = SCHEMAS[transport].safeParse(alias ? { ...raw, type: alias } : raw);
  return parsed.success
    ? { server: parsed.data, issues: [] }
    : { server: undefined, issues: [dropped(name, origin, reason(parsed.error))] };
}

/**
 * Whether an entry of the manifest's inline `mcpServers` keeps the plugin from loading (oracle
 * 2.1.319): the manifest is validated, so any entry that cannot be read fails it, `type: "sdk"`
 * excepted. The same entry in a `.mcp.json` is only dropped.
 */
export function rejectsManifest(raw: unknown): boolean {
  if (isRecord(raw) && isHostOnly(raw.type)) return false;
  return readMcpServer('', raw, '').server === undefined;
}

export interface McpConfigRead {
  readonly servers: Record<string, PluginMcpServer>;
  readonly issues: PluginIssue[];
  /** The plugin does not load: an inline manifest entry that cannot be read. */
  readonly rejectsPlugin?: boolean;
}

/**
 * The servers of a `.mcp.json` value (plugins/components.md: "You can also omit the `mcpServers`
 * wrapper and put `db` at the top level of the file"). Judgment: the wrapper is the key `mcpServers`
 * holding an object that is not itself a server (no `command`, no `url`), so a server a plugin
 * names `mcpServers` still reads as a bare map.
 */
const isWrapper = (raw: Record<string, unknown>): raw is { mcpServers: Record<string, unknown> } =>
  isRecord(raw.mcpServers) && !('command' in raw.mcpServers) && !('url' in raw.mcpServers);

export function readMcpConfig(raw: unknown, origin: string): McpConfigRead {
  if (!isRecord(raw)) {
    return {
      servers: {},
      issues: [error(origin, 'MCP servers must be a JSON object keyed by server name')],
    };
  }
  const entries = isWrapper(raw) ? raw.mcpServers : raw;
  const reads = Object.entries(entries).map(
    ([name, entry]) => [name, readMcpServer(name, entry, origin)] as const,
  );
  return {
    // `fromEntries` defines own properties, so a server called `__proto__` stays a plain entry.
    servers: Object.fromEntries(
      reads.flatMap(([name, { server }]) => (server ? [[name, server] as const] : [])),
    ),
    issues: reads.flatMap(([, { issues }]) => [...issues]),
  };
}
