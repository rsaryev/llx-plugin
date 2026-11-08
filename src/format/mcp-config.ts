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

/** True for a server reached over a URL: `url`, `headers` and `headersHelper` apply to it. */
export const isRemoteMcpServer = (server: PluginMcpServer): server is RemoteMcpServer =>
  'url' in server;

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
 * Reads one entry. An entry Claude Code would drop is an error naming the server, in the form
 * plugins/troubleshooting.md quotes: `Invalid MCP server config for "<server>": <error>`. The text
 * after the colon is the kit's (the docs give no text for a malformed entry).
 */
export function readMcpServer(name: string, raw: unknown, origin: string): McpServerRead {
  if (!isRecord(raw)) {
    return { server: undefined, issues: [dropped(name, origin, 'expected an object')] };
  }
  const transport = raw.type ?? 'stdio';
  if (!isTransport(transport)) {
    const why = `"type" must be one of ${MCP_TRANSPORTS.map((each) => `"${each}"`).join(', ')}`;
    return { server: undefined, issues: [dropped(name, origin, why)] };
  }
  const parsed = SCHEMAS[transport].safeParse(raw);
  return parsed.success
    ? { server: parsed.data, issues: [] }
    : { server: undefined, issues: [dropped(name, origin, reason(parsed.error))] };
}

export interface McpConfigRead {
  readonly servers: Record<string, PluginMcpServer>;
  readonly issues: PluginIssue[];
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
