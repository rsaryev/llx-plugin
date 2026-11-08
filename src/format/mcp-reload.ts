import { isRemoteMcpServer, type PluginMcpServer } from './mcp-config.ts';

/**
 * How a plugin's MCP servers follow a reload (mcp.md, "Plugin-provided MCP servers", "Automatic
 * lifecycle"; plugins/components.md, "Server names, tool names, and reloads"): "when the user runs
 * `/reload-plugins` ... a server whose configuration is unchanged keeps its connection. A server whose
 * configuration changed reconnects, and one you removed disconnects"; the same holds when the session
 * moves with `/cd` to a directory whose settings enable other plugins. Pure over the resolved configs;
 * connecting is the host's.
 */
export interface McpReloadPlan {
  /** In both lists with the same configuration: the live connection stays. */
  readonly keep: readonly string[];
  /** In both with a changed configuration. */
  readonly reconnect: readonly string[];
  /** Only in the new list: a plugin was enabled, or a server added. */
  readonly connect: readonly string[];
  /** Only in the old list: a plugin was disabled, or a server removed. */
  readonly disconnect: readonly string[];
}

/** The text of a value with its object keys sorted, so two configs are equal exactly when their data is. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .toSorted(([left], [right]) => (left < right ? -1 : 1));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Whether two server configurations are the same data (key order and absent fields do not count). */
export const sameMcpConfiguration = (left: PluginMcpServer, right: PluginMcpServer): boolean =>
  canonical(left) === canonical(right);

/**
 * What a reload does to each server, by the name the host registers it under. Names appear in the
 * lists in the order of the new map, then of the old one for `disconnect`.
 */
export function planMcpReload(
  previous: Readonly<Record<string, PluginMcpServer>>,
  next: Readonly<Record<string, PluginMcpServer>>,
): McpReloadPlan {
  const entries = Object.entries(next);
  const status = (name: string, server: PluginMcpServer): 'keep' | 'reconnect' | 'connect' => {
    const old = Object.hasOwn(previous, name) ? previous[name] : undefined;
    if (old === undefined) return 'connect';
    return sameMcpConfiguration(old, server) ? 'keep' : 'reconnect';
  };
  const named = (wanted: 'keep' | 'reconnect' | 'connect'): string[] =>
    entries.filter(([name, server]) => status(name, server) === wanted).map(([name]) => name);
  return {
    keep: named('keep'),
    reconnect: named('reconnect'),
    connect: named('connect'),
    disconnect: Object.keys(previous).filter((name) => !Object.hasOwn(next, name)),
  };
}

/** "A connection to that server failed less than 15 minutes earlier." */
export const MCP_FAILURE_SKIP_MS = 15 * 60_000;

/** errors.md quotes it as the status of a server that was not started. */
export const SKIPPING_CONNECTION =
  'Skipping connection (recent failure cached; retries automatically in 15 min, or edit the plugin config to retry now)';

export interface McpConnectionFailure {
  readonly atMs: number;
  /** The configuration the failed connection used. */
  readonly server: PluginMcpServer;
}

/**
 * Whether Claude Code skips connecting a plugin's server: it is a stdio server whose connection failed
 * "less than 15 minutes earlier", with the configuration it has now ("or edit the plugin config to
 * retry now"). A remote server is not cached this way. Judgment (spec/judgments.md): a failure exactly
 * 15 minutes old is old enough, and one dated in the future does not count.
 */
export function skipsStdioConnection(
  server: PluginMcpServer,
  failure: McpConnectionFailure | undefined,
  nowMs: number,
): boolean {
  if (failure === undefined || isRemoteMcpServer(server)) return false;
  const age = nowMs - failure.atMs;
  return age >= 0 && age < MCP_FAILURE_SKIP_MS && sameMcpConfiguration(server, failure.server);
}
