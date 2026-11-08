import { warning, type PluginIssue } from '../../format/issues.ts';
import type { PolicyLayer, PolicyScope } from '../layers.ts';
import { isRecord } from '../record.ts';

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

export interface ManagedServerEntries {
  /** Entries by server name, as written, for the entry validation to read. */
  readonly entries: Readonly<Record<string, unknown>>;
  readonly issues: readonly PluginIssue[];
}

/**
 * The servers the organization provides: `managedMcpServers` of the managed layers only. The layers
 * are the managed sources the host selected, highest rank first; "when two sources define the same
 * name, the higher-ranked source's entry applies whole". Any other layer that carries the key has it
 * dropped with a warning.
 */
export function managedServerEntries(layers: readonly PolicyLayer[]): ManagedServerEntries {
  const entries = new Map<string, unknown>();
  const issues: PluginIssue[] = [];
  for (const layer of layers) {
    const value = layer.settings[KEY];
    if (value === undefined) continue;
    if (!READ_FROM[layer.scope]) {
      issues.push(
        warning(
          `${layer.scope}:${KEY}`,
          `"${KEY}" is read from managed settings only; the key is dropped`,
        ),
      );
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
