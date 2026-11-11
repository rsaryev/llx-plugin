import type { PolicyView } from '../view.ts';
import { readMcpEntries, type McpEntry, type McpEntryKind } from './entries.ts';

/** The entries of an allowlist, by the key they use: a server is matched against the entries of its own kind. */
export type McpEntriesByKind = { readonly [K in McpEntryKind]: readonly McpEntry[] };

export interface McpLists {
  /** The denylist: every file's entries, "regardless" of any lock. */
  readonly denied: readonly McpEntry[];
  /** The allowlist in force; `undefined` when no source sets one, an empty one when it is set empty. */
  readonly allowed: McpEntriesByKind | undefined;
}

function groupByKind(entries: readonly McpEntry[]): McpEntriesByKind {
  const groups: Record<McpEntryKind, McpEntry[]> = {
    serverName: [],
    serverCommand: [],
    serverUrl: [],
  };
  for (const entry of entries) groups[entry.kind].push(entry);
  return groups;
}

/**
 * The two lists over the view. The allowlist in force is the key row's (`KEY_SPECS.allowedMcpServers`):
 * without `allowManagedMcpServersOnly` "allowlists from every settings scope merge", a managed list
 * blocking the parent's; under the lock only the list "from the highest-ranked admin source that sets
 * one" counts, else the parent's (managed-settings.md, "Let an embedding host add policy").
 */
export function readMcpLists(view: PolicyView): McpLists {
  const allowed = view.get('allowedMcpServers');
  return {
    denied: view
      .eachFromHighest('deniedMcpServers')
      .flatMap((each) => readMcpEntries(each.value, 'denied')),
    allowed: allowed === undefined ? undefined : groupByKind(readMcpEntries(allowed, 'allowed')),
  };
}
