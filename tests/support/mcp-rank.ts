/** Helpers for the MCP scope tests: servers and candidates written the way the docs write them. */
import type { McpCandidate, McpScope } from '../../src/settings/mcp/index.ts';
import type { PluginMcpServer } from '../../src/format/mcp-config.ts';

export const http = (url: string): PluginMcpServer => ({ type: 'http', url });
export const stdio = (command: string, ...args: string[]): PluginMcpServer => ({ command, args });

export const candidate = (
  scope: McpScope,
  name: string,
  server: PluginMcpServer,
  enabled?: boolean,
): McpCandidate =>
  enabled === undefined ? { scope, name, server } : { scope, name, server, enabled };

/** `scope:name` of each candidate, to compare two lists at a glance. */
export const labels = (list: readonly McpCandidate[]): readonly string[] =>
  list.map((each) => `${each.scope}:${each.name}`);
