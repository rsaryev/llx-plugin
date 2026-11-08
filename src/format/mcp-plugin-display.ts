import { mcpTransportOf, type McpTransport, type PluginMcpServer } from './mcp-config.ts';

/**
 * What `claude mcp get` and `claude mcp list` show of a plugin's servers (mcp.md, "Plugin-provided MCP
 * servers"): "`claude mcp get` hides the values configured for a plugin's stdio or WebSocket server,
 * because they can carry credentials". Pure data: the lines, not the terminal.
 */
export interface RedactedPluginServer {
  /** The lines `claude mcp get` prints for the command, the URL, the arguments and the variables. */
  readonly get: readonly string[];
  /** What `claude mcp list` shows in place of the command or URL; absent where the docs name none. */
  readonly list?: string;
}

const REDACTED = '[REDACTED]';

const redactedStdio = (server: PluginMcpServer): RedactedPluginServer | undefined =>
  'command' in server
    ? {
        // "It prints `Command: stdio`, an empty `Args:` line, and each environment variable as `NAME=[REDACTED]`."
        get: [
          'Command: stdio',
          'Args:',
          ...Object.keys(server.env ?? {}).map((name) => `${name}=${REDACTED}`),
        ],
      }
    : undefined;

const redactedWs = (server: PluginMcpServer): RedactedPluginServer | undefined =>
  'url' in server
    ? {
        // "It prints `URL: ws` and each header as `<name>: [REDACTED]`, and `claude mcp list` shows `ws`."
        get: [
          'URL: ws',
          ...Object.keys(server.headers ?? {}).map((name) => `${name}: ${REDACTED}`),
        ],
        list: 'ws',
      }
    : undefined;

const REDACTORS: {
  readonly [T in McpTransport]: (server: PluginMcpServer) => RedactedPluginServer | undefined;
} = {
  stdio: redactedStdio,
  ws: redactedWs,
  // The values of an http or sse server are not among those the docs say are hidden.
  http: () => undefined,
  sse: () => undefined,
};

/**
 * The redacted view of a plugin's stdio or WebSocket server, or `undefined` for an http or sse server,
 * whose values the docs do not say are hidden.
 */
export const redactPluginServer = (server: PluginMcpServer): RedactedPluginServer | undefined =>
  REDACTORS[mcpTransportOf(server)](server);
