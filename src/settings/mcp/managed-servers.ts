import { warning, type PluginIssue } from '../../format/issues.ts';
import type { PluginMcpServer } from '../../format/mcp-config.ts';
import { displayHeaders, displayReference } from '../../format/mcp-env.ts';
import type { PolicyLayer } from '../layers.ts';
import { readManagedEntry } from './managed-entry.ts';
import { managedServerEntries, type ManagedServerOptions } from './managed.ts';
import type { McpCandidate } from './scope.ts';
import { isRecord } from '../../protocol/is-record.ts';

export interface ProvidedServers {
  /** The servers the organization provides, as managed-scope candidates, in the order the sources define them. */
  readonly servers: readonly McpCandidate[];
  /** Why an entry was not loaded: the notices `/status` shows. */
  readonly issues: readonly PluginIssue[];
}

const KEY = 'managedMcpServers';

const notLoaded = (name: string, reason: string): PluginIssue =>
  warning(`${KEY}.${name}`, `Managed MCP server "${name}" was not loaded: ${reason}`);

/**
 * A managed layer whose value is no object: Claude Desktop's setting of the same name is an array of
 * another entry shape, and Claude Code "doesn't accept the array form and records a notice instead of
 * loading it" (managed-mcp.md, "What an entry can contain").
 */
const wrongShape = (layers: readonly PolicyLayer[], options: ManagedServerOptions): PluginIssue[] =>
  options.desktopManaged !== undefined
    ? []
    : layers
        .filter((layer) => layer.scope === 'managed')
        .map((layer) => layer.settings[KEY])
        .filter((value) => value !== undefined && !isRecord(value))
        .map(() =>
          warning(
            `managed:${KEY}`,
            `"${KEY}" must be an object keyed by server name; the array form of Claude Desktop is not accepted and no server was loaded from it`,
          ),
        );

/**
 * The servers the organization provides through `managedMcpServers` (managed-mcp.md, "Provide servers
 * through managed settings"; v2.1.259): the managed layers' entries (`managedServerEntries`: managed
 * sources only, names across sources union, the higher source's entry whole), each kept only when it
 * passes every check of "What an entry can contain"; one that fails is dropped with a notice and the
 * others still load. Hand the result to `mcpLoadPlan`; it ranks above every other scope.
 */
export function readManagedMcpServers(
  layers: readonly PolicyLayer[],
  options: ManagedServerOptions = {},
): ProvidedServers {
  const { entries, issues } = managedServerEntries(layers, options);
  const reads = Object.entries(entries).map(([name, raw]) => ({
    name,
    ...readManagedEntry(name, raw),
  }));
  return {
    servers: reads.flatMap(({ name, server }) =>
      server === undefined ? [] : [{ scope: 'managed' as const, name, server }],
    ),
    issues: [
      ...issues,
      ...wrongShape(layers, options),
      ...reads.flatMap(({ name, reason }) =>
        reason === undefined ? [] : [notLoaded(name, reason)],
      ),
    ],
  };
}

/** `/mcp` "lists provided servers under **Managed MCPs**". */
export const MANAGED_MCP_GROUP = 'Managed MCPs';

export interface ManagedServerDescription {
  readonly group: typeof MANAGED_MCP_GROUP;
  /** "the URL's host only, for example `https://mcp.example.com/…`". */
  readonly url: string;
  /** "its header names without their values". */
  readonly headerNames: readonly string[];
}

/** What `claude mcp get` and `/mcp` show of a provided server (managed-mcp.md, "What users can see and change"). */
export function describeManagedServer(server: PluginMcpServer): ManagedServerDescription {
  return {
    group: MANAGED_MCP_GROUP,
    url: displayReference(server, 'managed'),
    headerNames: displayHeaders(server, 'managed').map((header) => header.name),
  };
}

/** What `claude mcp remove` reports for a provided server (managed-mcp.md, "How restrictions appear to users"). */
export const managedServerRemoval = (name: string): string =>
  `MCP server "${name}" is provided by your organization (managed settings) and cannot be removed locally.`;
