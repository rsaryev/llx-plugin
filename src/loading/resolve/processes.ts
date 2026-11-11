import type { PluginIssue } from '../../format/issues.ts';
import type { Plugin } from '../plugin-model.ts';
import { resolvePluginServer } from './channel.ts';
import { resolveLspServer, type ResolvedLspServer } from './lsp.ts';
import type { ResolvedMcpServer } from './mcp.ts';
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
  /** By the name the plugin wrote; each carries its `pluginId`, to key it by across plugins. */
  readonly lspServers: Readonly<Record<string, ResolvedLspServer>>;
  /** In declaration order; `monitorsToStart` decides when each starts. */
  readonly monitors: readonly ResolvedMonitor[];
  readonly issues: readonly PluginIssue[];
}

/** One kind of process: what starts, by name for servers, and why the others do not. */
export interface ResolvedKind<R> {
  readonly resolved: R;
  readonly issues: readonly PluginIssue[];
}

interface One<R> {
  readonly resolved: R | undefined;
  readonly issues: readonly PluginIssue[];
}

/** Resolves every entry of a record with one resolver; entries that do not start are left out. */
async function resolveEach<V, R>(
  entries: Readonly<Record<string, V>>,
  resolve: (name: string, value: V) => Promise<One<R>>,
): Promise<ResolvedKind<Record<string, R>>> {
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

/**
 * The plugin's MCP servers. A bundled server resolves with its bundle's own settings; a server a channel binds to resolves with the channel's options
 * (manifest-reference.md, "Channels": "Saved values substitute into `${user_config.KEY}`
 * references in the server's `env`").
 */
export const resolveMcpServers = (
  plugin: Pick<Plugin, 'mcpServers' | 'mcpBundles' | 'manifest'>,
  scope: SubstitutionScope,
): Promise<ResolvedKind<Record<string, ResolvedMcpServer>>> =>
  resolveEach(plugin.mcpServers, (name, server) =>
    resolvePluginServer(
      plugin,
      { name, server },
      plugin.manifest?.channels?.find((one) => one.server === name),
      scope,
    ),
  );

export const resolveLspServers = (
  plugin: Pick<Plugin, 'lspServers'>,
  scope: SubstitutionScope,
): Promise<ResolvedKind<Record<string, ResolvedLspServer>>> =>
  resolveEach(plugin.lspServers, (name, server) => resolveLspServer(name, server, scope));

export async function resolveMonitors(
  plugin: Pick<Plugin, 'monitors'>,
  scope: SubstitutionScope,
): Promise<ResolvedKind<ResolvedMonitor[]>> {
  const done = await Promise.all(plugin.monitors.map((monitor) => resolveMonitor(monitor, scope)));
  return {
    resolved: done.flatMap((one) => (one.resolved ? [one.resolved] : [])),
    issues: done.flatMap((one) => [...one.issues]),
  };
}

export async function resolveProcesses(
  plugin: Pick<Plugin, 'mcpServers' | 'mcpBundles' | 'lspServers' | 'monitors' | 'manifest'>,
  scope: SubstitutionScope,
): Promise<ResolvedProcesses> {
  const [mcp, lsp, monitors] = await Promise.all([
    resolveMcpServers(plugin, scope),
    resolveLspServers(plugin, scope),
    resolveMonitors(plugin, scope),
  ]);
  return {
    mcpServers: mcp.resolved,
    lspServers: lsp.resolved,
    monitors: monitors.resolved,
    issues: [...mcp.issues, ...lsp.issues, ...monitors.issues],
  };
}
