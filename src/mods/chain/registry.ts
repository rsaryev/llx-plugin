import type { PluginIssue } from '../../format/issues.ts';
import type { HookOrigin, ModTier } from '../../protocol/mods-events.ts';
import type { MatcherEngine } from '../ports.ts';
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
  /** When the mod registered: mods of one tier run in this order. */
  readonly order: number;
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
  chainFor(event: string, caller?: HookOrigin): readonly ChainEntry[];
}

/** The matcher of a hook whose own failed to compile: never reached, because the module is refused first. */
const NEVER: CompiledMatcher = { test: () => Promise.resolve({ matched: false }) };

/** Where a registered mod stands in the order mods run in: its tier, then when it registered. */
interface Place {
  readonly rank: number;
  readonly order: number;
}

/**
 * Whether the hook of `entry` runs before the mod at `place`, or is that mod's own (a call by a
 * mod reaches the hooks of the mods before it and skips its own as a re-entry). A mod that is not
 * registered yet (one being built) is last of its tier.
 */
function reaches(entry: ChainEntry, caller: HookOrigin, place: Place | undefined): boolean {
  if (place === undefined) return entry.rank <= TIER_RANK[caller.tier];
  return entry.rank < place.rank || (entry.rank === place.rank && entry.order <= place.order);
}

export function createRegistry(engine?: MatcherEngine): Registry {
  let entries: readonly ChainEntry[] = [];
  let registrations = 0;
  // Every registered mod, also one with no hook: a call by it still has a place in the order.
  const places = new Map<string, Place>();
  const unregister = (plugin: string): void => {
    entries = entries.filter((entry) => entry.plugin.name !== plugin);
    places.delete(plugin);
  };
  return {
    register(plugin, tier, hooks) {
      const { issues, matchers } = checkHooks(hooks, tier, engine);
      if (issues.length > 0) return issues;
      unregister(plugin.name);
      registrations += 1;
      places.set(plugin.name, { rank: TIER_RANK[tier], order: registrations });
      const added = hooks.map((hook, index): ChainEntry => ({
        plugin,
        tier,
        rank: TIER_RANK[tier],
        order: registrations,
        hook,
        matcher: matchers[index] ?? NEVER,
      }));
      // `toSorted` is stable, so hooks of one tier keep the order they were registered in.
      entries = [...entries, ...added].toSorted((a, b) => a.rank - b.rank);
      return [];
    },
    unregister,
    chainFor: (event, caller) =>
      entries.filter(
        (entry) =>
          handles(entry.hook.event, entry.hook.isGenerator, event) &&
          (caller === undefined || reaches(entry, caller, places.get(caller.plugin))),
      ),
  };
}
