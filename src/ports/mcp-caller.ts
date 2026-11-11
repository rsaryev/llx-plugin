import type { PortFailure } from './failure.ts';

export type McpAvailability = 'connected' | 'unavailable';

export interface McpToolCall {
  readonly server: string;
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly timeoutMs?: number;
  readonly signal: AbortSignal;
}

/** One content block of a tool's result as MCP returns it (text, image, resource, resource_link, ...). */
export interface McpContentBlock {
  readonly type: string;
  readonly text?: string;
  readonly mimeType?: string;
  readonly uri?: string;
  readonly [field: string]: unknown;
}

export interface McpToolResult {
  readonly isError: boolean;
  /** The text blocks of the tool's result, joined. */
  readonly text: string;
  /**
   * The result's content blocks, in order, as MCP returns them; `$.mcp.call` answers them
   * (claude-code/index.d.ts:2862). Without them it answers one text block of `text`.
   */
  readonly content?: readonly McpContentBlock[];
  /** The server's structured result, when its tool declares an output schema. */
  readonly structuredContent?: unknown;
}

/** The host's MCP client: the kit resolves server configs, the host connects and calls. */
export interface McpCaller {
  /** Wait up to `waitMs` for a server (a plugin's own server may still be starting). */
  ensureConnected(server: string, waitMs: number, signal: AbortSignal): Promise<McpAvailability>;
  callTool(call: McpToolCall): Promise<McpToolResult | PortFailure>;
}
