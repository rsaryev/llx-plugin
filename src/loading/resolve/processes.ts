import type { PluginIssue } from '../../format/issues.ts';
import type { Plugin } from '../plugin-model.ts';
import { resolveLspServer, type ResolvedLspServer } from './lsp.ts';
import { resolveMcpServer, type ResolvedMcpServer } from './mcp.ts';
import { resolveMonitor, type ResolvedMonitor } from './monitor.ts';
import type { SubstitutionScope } from './scope.ts';

/**
 * The long-running processes a plugin declares, resolved for this host: MCP servers, language
 * servers and monitors. The kit never spawns any of them: the host starts each and reads the issues
 * for the ones that must not start (a `${user_config.*}` in a shell field, an unparseable URL).
 * An entry that does not start is left out and its issue is reported; the others are unaffected.
 */
export interface ResolvedProcesses {
  /** By the name the plugin wrote; each carries the `plugin:<plugin>:<server>` key `/mcp` shows. */
  readonly mcpServers: Readonly<Record<string, ResolvedMcpServer>>;
  /** By the name the plugin wrote; qualify it as `plugin:server` when registering across plugins. */
  readonly lspServers: Readonly<Record<string, ResolvedLspServer>>;
  /** In declaration order; `monitorsToStart` decides when each starts. */
  readonly monitors: readonly ResolvedMonitor[];
  readonly issues: readonly PluginIssue[];
}

/** Resolves every entry of a record with one resolver; entries that do not start are left out. */
async function resolveEach<V, R>(
  entries: Readonly<Record<string, V>>,
  resolve: (
    name: string,
    value: V,
  ) => Promise<{ readonly resolved: R | undefined; readonly issues: readonly PluginIssue[] }>,
): Promise<{ readonly resolved: Record<string, R>; readonly issues: PluginIssue[] }> {
  const done = await Promise.all(
    Object.entries(entries).map(async ([name, value]) => ({
      name,
      ...(await resolve(name, value)),
    })),
  );
  return {
    // `fromEntries` defines own properties, so a server called `__proto__` stays a plain entry.
    resolved: Object.fromEntries(
      done.flatMap((one) =>
        one.resolved === undefined ? [] : [[one.name, one.resolved] as const],
      ),
    ),
    issues: done.flatMap((one) => [...one.issues]),
  };
}

export async function resolveProcesses(
  plugin: Pick<Plugin, 'mcpServers' | 'lspServers' | 'monitors'>,
  scope: SubstitutionScope,
): Promise<ResolvedProcesses> {
  const [mcp, lsp, monitors] = await Promise.all([
    resolveEach(plugin.mcpServers, (name, server) => resolveMcpServer(name, server, scope)),
    resolveEach(plugin.lspServers, async (name, server) => ({
      ...(await resolveLspServer(name, server, scope)),
    })),
    Promise.all(plugin.monitors.map((monitor) => resolveMonitor(monitor, scope))),
  ]);
  return {
    mcpServers: mcp.resolved,
    lspServers: lsp.resolved,
    monitors: monitors.flatMap((one) => (one.resolved ? [one.resolved] : [])),
    issues: [...mcp.issues, ...lsp.issues, ...monitors.flatMap((one) => [...one.issues])],
  };
}
