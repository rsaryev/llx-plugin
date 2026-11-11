import { z } from 'zod';
import type { McpToolResult } from '../../ports/index.ts';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

/**
 * `$.mcp.call(server, tool, args?)`, positional (claude-code/index.d.ts:2868, "Positional, not the
 * `{ tool: "mcp__server__tool", ... }` shape a `tool.call` hook sees"): its event carries
 * `{ server, tool, args }` (:7339), `args` `{}` when absent ("none when absent").
 */
const request = z.looseObject({
  server: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});
const connect = z.looseObject({ server: z.string() });

/** Judgment: how long `$.mcp.connect` waits for a server that is still starting; the docs give none. */
const CONNECT_WAIT_MS = 30_000;

/**
 * The tool's result as MCP returns it, `content` blocks and `isError` (:2862): the blocks the host
 * gave, or one text block of the joined text when it gave only that.
 */
const asReturned = (result: McpToolResult): unknown => ({
  content: result.content ?? [{ type: 'text', text: result.text }],
  isError: result.isError,
  ...(result.structuredContent === undefined
    ? {}
    : { structuredContent: result.structuredContent }),
});

async function callTool(deps: Deps, e: unknown): Promise<unknown> {
  const { server, tool, args } = parse('$.mcp.call', request, e);
  const { mcp } = deps.ports;
  if ((await mcp.ensureConnected(server, 0, deps.signal)) === 'unavailable') {
    throw new Error(`$.mcp.call: MCP server "${server}" is not connected`);
  }
  const result = await mcp.callTool({ server, tool, input: args, signal: deps.signal });
  if ('failure' in result) throw new Error(`$.mcp.call: ${result.message}`);
  return asReturned(result);
}

/**
 * `connect(server)` connects an MCP server that the plugin's own manifest lists (reference.md, "Mods
 * API methods"); "a refusal resolves with `reason`, `message`" (:2877): `unlisted` for a server the
 * manifest does not list, `failed` for one that did not connect. Connected, it answers the name
 * `call` takes, the one the kit asked the host for.
 */
async function connectOwn(deps: Deps, e: unknown): Promise<unknown> {
  const { server } = parse('$.mcp.connect', connect, e);
  if (!deps.ownMcpServers.includes(server)) {
    return {
      isConnected: false,
      reason: 'unlisted',
      message: `"${server}" is not an MCP server of the plugin ${deps.plugin}`,
    };
  }
  const availability = await deps.ports.mcp.ensureConnected(server, CONNECT_WAIT_MS, deps.signal);
  if (availability === 'connected') return { isConnected: true, server };
  return {
    isConnected: false,
    reason: 'failed',
    message: `MCP server "${server}" did not connect`,
  };
}

export const mcpApi = (deps: Deps): ModsNamespaceApi<'mcp'> => ({
  call: async (...args) => {
    const given = { server: args[0], tool: args[1], args: args[2] ?? {} };
    return call(deps, 'mcp.call', parse('$.mcp.call', request, given), (e) => callTool(deps, e));
  },
  connect: async (...args) =>
    call(deps, 'mcp.connect', { server: parse('$.mcp.connect', z.string(), args[0]) }, (e) =>
      connectOwn(deps, e),
    ),
});
