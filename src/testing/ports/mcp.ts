import type {
  McpAvailability,
  McpCaller,
  McpToolCall,
  McpToolResult,
  PortFailure,
} from '../../ports/index.ts';

export interface FakeMcpOptions {
  /** Servers that are connected; any other is `unavailable`. */
  readonly connected?: readonly string[];
  /** Answers by `server/tool`; a call to an unlisted tool fails with `no-such-tool`. */
  readonly tools?: Readonly<Record<string, McpToolResult | PortFailure>>;
}

/** An `McpCaller` over fixed servers and tool results, recording every call in `calls`. */
export function fakeMcp(
  options: FakeMcpOptions = {},
): McpCaller & { readonly calls: McpToolCall[] } {
  const connected = new Set(options.connected ?? []);
  const calls: McpToolCall[] = [];
  return {
    calls,
    ensureConnected: (server): Promise<McpAvailability> =>
      Promise.resolve(connected.has(server) ? 'connected' : 'unavailable'),
    callTool: (call) => {
      calls.push(call);
      const answer = options.tools?.[`${call.server}/${call.tool}`];
      return Promise.resolve(
        answer ?? { failure: 'no-such-tool', message: `${call.server}/${call.tool}` },
      );
    },
  };
}
