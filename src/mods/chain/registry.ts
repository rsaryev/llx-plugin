import type { PluginIssue } from '../../format/issues.ts';
import type { HookOrigin, ModTier } from '../../protocol/mods-events.ts';
import type { MatcherEngine } from '../ports.ts';
import type { ModPluginInfo, RegisteredHook, RegisterTier } from '../types.ts';
import type { CompiledMatcher } from './matcher.ts';
import { isAmong, type Only } from './only.ts';
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
  /** The mod's `position` when the host gave one: a mod without one runs after those with one. */
  readonly position: number;
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
  /** Whether a hook of the mods in `only` (every mod without it) handles `event`. */
  hears(event: string, only?: Only): boolean;
}

/** The matcher of a hook whose own failed to compile: never reached, because the module is refused first. */
const NEVER: CompiledMatcher = { test: () => Promise.resolve({ matched: false }) };

/** Where a registered mod stands in the order mods run in: its tier, then when it registered. */
interface Place {
  readonly rank: number;
  readonly position: number;
  readonly order: number;
}

/** Tier first, then the host's `position`, then when the mod registered (a mod with no position is last of its tier). */
const compare = (a: Place, b: Place): number =>
  a.rank - b.rank || a.position - b.position || a.order - b.order;

/**
 * Whether the hook of `entry` runs before the mod at `place`, or is that mod's own (a call by a
 * mod reaches the hooks of the mods before it and skips its own as a re-entry). A mod that is not
 * registered yet (one being built) is last of its tier.
 */
function reaches(entry: ChainEntry, caller: HookOrigin, place: Place | undefined): boolean {
  if (place === undefined) return entry.rank <= TIER_RANK[caller.tier];
  return compare(entry, place) <= 0;
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
      const position = plugin.position ?? Number.POSITIVE_INFINITY;
      places.set(plugin.name, { rank: TIER_RANK[tier], position, order: registrations });
      const added = hooks.map((hook, index): ChainEntry => ({
        plugin,
        tier,
        rank: TIER_RANK[tier],
        order: registrations,
        position,
        hook,
        matcher: matchers[index] ?? NEVER,
      }));
      // `toSorted` is stable, so hooks of one tier keep the order they were registered in.
      entries = [...entries, ...added].toSorted(compare);
      return [];
    },
    unregister,
    chainFor: (event, caller) =>
      entries.filter(
        (entry) =>
          handles(entry.hook.event, entry.hook.isGenerator, event) &&
          (caller === undefined || reaches(entry, caller, places.get(caller.plugin))),
      ),
    hears: (event, only) =>
      entries.some(
        (entry) =>
          handles(entry.hook.event, entry.hook.isGenerator, event) &&
          isAmong(only, entry.plugin.name),
      ),
  };
}
