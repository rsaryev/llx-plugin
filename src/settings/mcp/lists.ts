import type { KeyHolder } from '../layers.ts';
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

const isManaged = (holder: KeyHolder<'allowedMcpServers'>): boolean => holder.scope === 'managed';
const isParent = (holder: KeyHolder<'allowedMcpServers'>): boolean => holder.scope === 'parent';

/**
 * The allowlists that count. Without the lock "allowlists from every settings scope merge". Under
 * `allowManagedMcpServersOnly` only the managed one counts, "from the highest-ranked admin source that
 * sets one", which "replaces a lower source's list rather than combining with it"; with none, "every
 * server that passes the denylist loads, unless parent settings supply a list" (managed-settings.md).
 * Judgment (spec/judgments.md): without the lock, a parent list takes part only where no managed
 * source sets one (the SDK's `managedSettings` note: "apply only where the admin tier sets none").
 */
function holdersInForce(
  holders: readonly KeyHolder<'allowedMcpServers'>[],
  locked: boolean,
): readonly KeyHolder<'allowedMcpServers'>[] {
  const managed = holders.filter(isManaged);
  if (locked) return managed.length > 0 ? managed.slice(0, 1) : holders.filter(isParent);
  return managed.length > 0 ? holders.filter((holder) => !isParent(holder)) : holders;
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

/** The two lists over the view: the lock is "a `true` in any admin source". */
export function readMcpLists(view: PolicyView): McpLists {
  const locked = view.eachFromHighest('allowManagedMcpServersOnly').some((each) => each.value);
  const inForce = holdersInForce(view.eachFromHighest('allowedMcpServers'), locked);
  return {
    denied: view
      .eachFromHighest('deniedMcpServers')
      .flatMap((each) => readMcpEntries(each.value, 'denied')),
    allowed:
      inForce.length === 0
        ? undefined
        : groupByKind(inForce.flatMap((each) => readMcpEntries(each.value, 'allowed'))),
  };
}
