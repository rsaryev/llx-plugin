import type { PluginIssue } from '../../format/issues.ts';
import type { ModTier } from '../../protocol/mods-events.ts';
import type { ModPluginInfo, RegisteredHook, RegisterTier } from '../types.ts';
import type { CompiledMatcher } from './matcher.ts';
import { TIER_RANK } from './tiers.ts';
import { checkHooks } from './validate.ts';
import { handles } from './wildcard.ts';

/** One registered hook, with where it stands in the chain. */
export interface ChainEntry {
  readonly plugin: ModPluginInfo;
  readonly tier: ModTier;
  readonly rank: number;
  readonly hook: RegisteredHook;
  readonly matcher: CompiledMatcher;
}

export interface Registry {
  /** Adds a module's hooks, or none of them when it has an issue. A mod registered again replaces its earlier hooks (judgment). */
  register(
    plugin: ModPluginInfo,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
  ): readonly PluginIssue[];
  unregister(plugin: string): void;
  /** The hooks that handle `event` in the order they run: by tier, then as registered (events.md, "The order mods run in"). */
  chainFor(event: string): readonly ChainEntry[];
}

export function createRegistry(): Registry {
  let entries: readonly ChainEntry[] = [];
  const unregister = (plugin: string): void => {
    entries = entries.filter((entry) => entry.plugin.name !== plugin);
  };
  return {
    register(plugin, tier, hooks) {
      const { issues, matchers } = checkHooks(hooks, tier);
      if (issues.length > 0) return issues;
      unregister(plugin.name);
      const added = hooks.map((hook, index): ChainEntry => ({
        plugin,
        tier,
        rank: TIER_RANK[tier],
        hook,
        matcher: matchers[index] ?? { test: () => false },
      }));
      // `toSorted` is stable, so hooks of one tier keep the order they were registered in.
      entries = [...entries, ...added].toSorted((a, b) => a.rank - b.rank);
      return [];
    },
    unregister,
    chainFor: (event) =>
      entries.filter((entry) => handles(entry.hook.event, entry.hook.isGenerator, event)),
  };
}
