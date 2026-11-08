import type { PortFailure } from './failure.ts';

export type McpAvailability = 'connected' | 'unavailable';

export interface McpToolCall {
  readonly server: string;
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly timeoutMs?: number;
  readonly signal: AbortSignal;
}

export interface McpToolResult {
  readonly isError: boolean;
  /** The text blocks of the tool's result, joined. */
  readonly text: string;
}

/** The host's MCP client: the kit resolves server configs, the host connects and calls. */
export interface McpCaller {
  /** Wait up to `waitMs` for a server (a plugin's own server may still be starting). */
  ensureConnected(server: string, waitMs: number, signal: AbortSignal): Promise<McpAvailability>;
  callTool(call: McpToolCall): Promise<McpToolResult | PortFailure>;
}
