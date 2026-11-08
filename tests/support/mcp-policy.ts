/** Helpers for the MCP allow and deny tests: a server policy over sources, and servers to ask about. */
import type { PluginMcpServer } from '../../src/format/mcp-config.ts';
import {
  createMcpServerPolicy,
  type McpServerOrigin,
  type McpServerPolicy,
  type McpServerVerdict,
} from '../../src/settings/mcp/index.ts';
import { viewOf, type Source } from './plugin-settings.ts';

type Env = Readonly<Record<string, string | undefined>>;

/** The policy of the sources; `env` is the environment Claude Code started with and runs in. */
export const policyOf = (sources: readonly Source[], env: Env = {}): McpServerPolicy =>
  createMcpServerPolicy(viewOf(...sources), { startup: env, live: env });

/** A remote server, as `.mcp.json` writes it. */
export const remote = (url: string, type: 'http' | 'sse' = 'http'): PluginMcpServer => ({
  type,
  url,
});

/** A stdio server running `command` with `args`. */
export const stdio = (command: string, ...args: readonly string[]): PluginMcpServer => ({
  command,
  args: [...args],
});

/** The verdict for a server called `name`. */
export const verdictOf = (
  policy: McpServerPolicy,
  name: string,
  server: PluginMcpServer,
  origin?: McpServerOrigin,
): McpServerVerdict =>
  policy.check(origin === undefined ? { name, server } : { name, server, origin });

/** Whether the server may load. */
export const loads = (
  policy: McpServerPolicy,
  name: string,
  server: PluginMcpServer,
  origin?: McpServerOrigin,
): boolean => verdictOf(policy, name, server, origin).allowed;
