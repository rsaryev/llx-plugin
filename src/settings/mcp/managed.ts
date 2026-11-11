import { warning, type PluginIssue } from '../../format/issues.ts';
import type { PolicyLayer, PolicyScope } from '../layers.ts';
import { isRecord } from '../../protocol/is-record.ts';

/** The key itself; the entry validation of what a provided server may contain is not read here. */
const KEY = 'managedMcpServers';

/** Which sources `managedMcpServers` is read from (managed-mcp.md, "Where `managedMcpServers` applies"). */
const READ_FROM: { readonly [S in PolicyScope]: boolean } = {
  managed: true,
  parent: false,
  flag: false,
  local: false,
  project: false,
  user: false,
  addDir: false,
};

const DESKTOP_REASON: { readonly [D in DesktopManaged]: string } = {
  'third-party': 'is not read in the Claude Desktop Code tab on a third-party deployment',
  cowork: 'is not read in Claude Desktop Cowork sessions',
};

/** Why a layer's key is not read, or `undefined` when it is. */
function droppedReason(scope: PolicyScope, options: ManagedServerOptions): string | undefined {
  if (!READ_FROM[scope]) return 'is read from managed settings only';
  return options.desktopManaged === undefined ? undefined : DESKTOP_REASON[options.desktopManaged];
}

export interface ManagedServerEntries {
  /** Entries by server name, as written, for the entry validation to read. */
  readonly entries: Readonly<Record<string, unknown>>;
  readonly issues: readonly PluginIssue[];
}

/**
 * Sessions of the Claude Desktop app where Claude Code does not read the key: "the Claude Desktop
 * app's Code tab on a third-party deployment or ... the app's Cowork sessions, because Claude Desktop
 * supplies and locks those sessions' MCP servers itself".
 */
export type DesktopManaged = 'third-party' | 'cowork';

export interface ManagedServerOptions {
  /** The session is one of these Desktop sessions: no managed entry is read and a managed layer that carries the key is reported. */
  readonly desktopManaged?: DesktopManaged;
}

/**
 * The servers the organization provides: `managedMcpServers` of the managed layers only. The layers
 * are the managed sources the host selected, highest rank first; "when two sources define the same
 * name, the higher-ranked source's entry applies whole". Any other layer that carries the key has it
 * dropped with a warning. In a Desktop session that supplies its own servers (`desktopManaged`) no
 * entry is read; `/status` and `claude doctor` "say so when your managed settings carry the key
 * there", which this reports as a warning for each managed layer that carries it.
 */
export function managedServerEntries(
  layers: readonly PolicyLayer[],
  options: ManagedServerOptions = {},
): ManagedServerEntries {
  const entries = new Map<string, unknown>();
  const issues: PluginIssue[] = [];
  for (const layer of layers) {
    const value = layer.settings[KEY];
    if (value === undefined) continue;
    const dropped = droppedReason(layer.scope, options);
    if (dropped !== undefined) {
      issues.push(warning(`${layer.scope}:${KEY}`, `"${KEY}" ${dropped}; the key is dropped`));
      continue;
    }
    if (!isRecord(value)) continue;
    for (const [name, entry] of Object.entries(value)) {
      if (!entries.has(name)) entries.set(name, entry);
    }
  }
  // `Object.fromEntries` defines own properties, so a server called `__proto__` stays a name.
  return { entries: Object.fromEntries(entries), issues };
}
