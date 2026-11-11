import type { Settings } from '../protocol/official.ts';
import type { ManagedException } from './general/exceptions.ts';
import type { ScopeRule } from './key-spec.ts';
import type { Merge } from './merge.ts';

/**
 * What the kit knows about each policy key, one row per key, from its entry in settings-reference.md:
 * the files it may come from (the entry's **Scope** line), how files combine (**Scope** notes and
 * settings.md, "Lists merge instead of overriding"), and what to do with an invalid value
 * (managed-settings.md, "Keys that fail closed"). The resolvers of each area read their key through
 * the view and never repeat these facts.
 */
export interface ValueSpec<V> {
  readonly scopes: ScopeRule;
  /** Typed over the key's own value, so the view returns the key's type without a cast. */
  readonly merge: Merge<V>;
  /** The key's managed value is not an override: a restrictive value of a lower scope stays (settings.md). */
  readonly exception?: ManagedException<V>;
  /** How the admin tier holds the key; absent, every scope combines by `merge`. */
  readonly admin?: AdminTier;
  /** Where a key inside a block, or a key two spellings share, is read in a settings object; a top-level key needs none. */
  readonly read?: (settings: Settings) => V | undefined;
  /** The names down a block to a key inside it, so the merged settings carry the value this row decided. */
  readonly path?: readonly string[];
}

/**
 * How the admin tier holds a key (managed-settings.md, "Let an embedding host add policy"). The admin
 * tier is the highest managed source that sets the key, else the parent settings.
 */
interface AdminTier {
  /** A managed value blocks the parent's; the other scopes still combine (`allowedMcpServers`). */
  readonly blocksParent?: boolean;
  /** The admin tier's value applies alone when it sets one; no other scope adds to it (`availableModels`). */
  readonly owns?: boolean;
  /**
   * While it holds for the managed settings, only the admin tier counts, set or not: `allowedMcpServers`
   * under `allowManagedMcpServersOnly`, the sandbox allowlists under their `allowManaged*Only` locks,
   * `sandbox.filesystem.disabled` (sandboxing.md, "Which settings can disable it").
   */
  readonly pinnedWhen?: (managed: readonly Settings[]) => boolean;
}
