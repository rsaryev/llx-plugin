import { z } from 'zod';
import type { ModsNamespaceApi } from '../types.ts';
import { call, parse, type Deps } from './call.ts';

/**
 * `$.mcp.call` takes `{ server, tool, input }`. Judgment: the docs say "`call` a tool on a connected
 * MCP server" and give no signature; the object mirrors `$.tool.call({ tool, ...arguments })`.
 */
const request = z.looseObject({
  server: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
});
const connect = z.looseObject({ server: z.string() });

/** Judgment: how long `$.mcp.connect` waits for a server that is still starting; the docs give none. */
const CONNECT_WAIT_MS = 30_000;

async function callTool(deps: Deps, e: unknown): Promise<unknown> {
  const { server, tool, input } = parse('$.mcp.call', request, e);
  const { mcp } = deps.ports;
  if ((await mcp.ensureConnected(server, 0, deps.signal)) === 'unavailable') {
    throw new Error(`$.mcp.call: MCP server "${server}" is not connected`);
  }
  const result = await mcp.callTool({ server, tool, input, signal: deps.signal });
  if ('failure' in result) throw new Error(`$.mcp.call: ${result.message}`);
  return result;
}

/** `connect(server)` connects an MCP server that the plugin's own manifest lists (reference.md, "Mods API methods"). */
async function connectOwn(deps: Deps, e: unknown): Promise<unknown> {
  const { server } = parse('$.mcp.connect', connect, e);
  if (!deps.ownMcpServers.includes(server)) {
    throw new Error(`$.mcp.connect: "${server}" is not an MCP server of the plugin ${deps.plugin}`);
  }
  const availability = await deps.ports.mcp.ensureConnected(server, CONNECT_WAIT_MS, deps.signal);
  return { isConnected: availability === 'connected' };
}

export const mcpApi = (deps: Deps): ModsNamespaceApi<'mcp'> => ({
  call: async (...args) =>
    call(deps, 'mcp.call', parse('$.mcp.call', request, args[0]), (e) => callTool(deps, e)),
  connect: async (...args) =>
    call(deps, 'mcp.connect', { server: parse('$.mcp.connect', z.string(), args[0]) }, (e) =>
      connectOwn(deps, e),
    ),
});
