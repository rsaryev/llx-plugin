import { GUARD_ID } from '../../protocol/mods-settings.ts';
import type { RegisterTier } from '../types.ts';
import {
  countsAsOrganizations,
  decideModLoad,
  guardLoads,
  isGuardId,
  type ModCandidate,
} from './policy.ts';
import { listSetting, type ModsPolicyInput } from './policy-input.ts';

/**
 * The order hooks modules run in, and which load at all (plugins/mods/events.md, "The order mods
 * run in"; admin.md, "Install your organization's mods and set the order"): the built-in guard,
 * the mods in `prependPlugins`, the other mods that count as the organization's, the mods users
 * install (each before the mods it lists under `dependencies`), `appendPlugins`, then the other
 * built-in mods.
 */

/** The built-in guard as a candidate: the host never lists it. */
export const GUARD_CANDIDATE: ModCandidate = {
  id: GUARD_ID,
  name: 'cc-plugin-sec-default',
  isBuiltin: true,
  dependencies: [],
};

export interface OrderedMod {
  readonly candidate: ModCandidate;
  readonly tier: RegisterTier;
}

export interface SkippedMod {
  readonly candidate: ModCandidate;
  /** What the debug log gives after `hooks module <id> not loaded:`. */
  readonly reason: string;
}

export interface ModOrder {
  /** Hooks modules to load, in the order their hooks run. */
  readonly ordered: readonly OrderedMod[];
  readonly skipped: readonly SkippedMod[];
  /** Debug lines about a list that named something it cannot. */
  readonly notes: readonly string[];
}

/** Dependents before dependencies, otherwise the given order (a cycle keeps the rest as given). */
function dependentsFirst(mods: readonly OrderedMod[]): readonly OrderedMod[] {
  const rest = [...mods];
  const placed: OrderedMod[] = [];
  while (rest.length > 0) {
    const index = rest.findIndex((mod) =>
      rest.every(
        (other) => other === mod || !other.candidate.dependencies.includes(mod.candidate.name),
      ),
    );
    const [next] = rest.splice(Math.max(index, 0), 1);
    if (next) placed.push(next);
  }
  return placed;
}

const holdsName = (policy: ModsPolicyInput, candidate: ModCandidate): boolean =>
  candidate.managed?.isEnabled === true || countsAsOrganizations(candidate, policy.platform);

/**
 * One plugin per name loads a hooks module; "when your organization's managed settings turn on one
 * of the copies, that copy holds the name. Otherwise the copy Claude Code loads first holds it"
 * (loading.md, "Hooks when two enabled plugins share a name").
 */
function nameHolders(policy: ModsPolicyInput, candidates: readonly ModCandidate[]) {
  const holders = new Map<string, ModCandidate>();
  for (const candidate of candidates) {
    const held = holders.get(candidate.name);
    if (!held || (!holdsName(policy, held) && holdsName(policy, candidate))) {
      holders.set(candidate.name, candidate);
    }
  }
  return holders;
}

/** The mods the policy lets load, with the tier each runs in, in running order. */
export function orderMods(policy: ModsPolicyInput, plugins: readonly ModCandidate[]): ModOrder {
  const skipped: SkippedMod[] = [];
  const notes: string[] = [];
  const holders = nameHolders(policy, plugins);
  const decided = plugins.flatMap((candidate): OrderedMod[] => {
    if (holders.get(candidate.name) !== candidate) {
      skipped.push({ candidate, reason: 'another plugin of that name loads first' });
      return [];
    }
    const decision = decideModLoad(policy, candidate);
    if (decision.load) return [{ candidate, tier: decision.tier }];
    skipped.push({ candidate, reason: decision.reason ?? 'not loaded' });
    return [];
  });
  const byId = new Map(decided.map((mod) => [mod.candidate.id, mod]));
  const guard: OrderedMod[] = guardLoads(policy)
    ? [{ candidate: GUARD_CANDIDATE, tier: 'prepend' }]
    : [];
  const prepend = listSetting(policy, 'prependPlugins');
  const listed = (prepend?.ids ?? []).flatMap((id): OrderedMod[] => {
    if (isGuardId(id)) return guard;
    const mod = byId.get(id);
    if (mod && mod.tier === 'prepend') return [mod];
    notes.push(
      `prependPlugins names ${id}, which is not an enabled managed plugin with a hooks module; skipped`,
    );
    return [];
  });
  const isListed = new Set(listed.map((mod) => mod.candidate.id));
  const tail = (tier: RegisterTier) =>
    decided.filter((mod) => mod.tier === tier && !isListed.has(mod.candidate.id));
  const listedAppend = listSetting(policy, 'appendPlugins')?.ids ?? [];
  const appended = tail('append').toSorted(
    (a, b) => listedAppend.indexOf(a.candidate.id) - listedAppend.indexOf(b.candidate.id),
  );
  // A list places the guard where it names it (and drops it where it does not); with none it is first.
  const head = prepend === undefined ? guard : listed;
  return {
    ordered: [
      ...head,
      ...tail('prepend'),
      ...dependentsFirst(tail('user')),
      ...appended,
      ...tail('builtin'),
    ],
    skipped,
    notes,
  };
}

/** What ordering a single plugin against the mods already loaded came to (`ModsHost.loadMod`). */
export interface OrderedOne {
  /** Where the plugin loads, or nothing when policy keeps it out. */
  readonly mod?: OrderedMod;
  readonly skipped?: SkippedMod;
  /** Ids of the loaded plugins the new one takes the place of: its own earlier copy, or the other copy of its name that it now holds. */
  readonly replaces: readonly string[];
  /** A debug line when the policy would have put the plugin before a mod that is already loaded. */
  readonly note?: string;
}

const LISTS: { readonly [T in RegisterTier]?: string } = {
  prepend: 'prependPlugins lists',
  append: 'appendPlugins lists',
};

/** The line for a plugin the policy places before mods already loaded: the registry runs a mod loaded later after them. */
function lateNote(tier: RegisterTier, mod: ModCandidate, later: ModCandidate): string {
  const subject = LISTS[tier] ?? 'the order puts';
  return `${subject} ${mod.id} before ${later.id}, which is already loaded: ${mod.name} runs after it`;
}

/**
 * Where one plugin goes among the mods `loaded` already holds (judgment, spec/judgments.md): its tier
 * and whether it may load come from the policy over the whole set, as `orderMods` gives them; a mod
 * added after the others runs last in its tier, because the chain runs a tier in the order its mods
 * registered, and a note says when the policy would have put it earlier. A copy of the same plugin
 * that is loaded is replaced; another copy of the name holds it or loses it as `orderMods` decides.
 */
export function orderOne(
  policy: ModsPolicyInput,
  loaded: readonly ModCandidate[],
  candidate: ModCandidate,
): OrderedOne {
  const others = loaded.filter((other) => other.id !== candidate.id);
  const order = orderMods(policy, [...others, candidate]);
  const skipped = order.skipped.find((skip) => skip.candidate === candidate);
  if (skipped) return { skipped, replaces: [] };
  const mod = order.ordered.find((placed) => placed.candidate === candidate);
  const lost = order.skipped
    .filter((skip) => skip.candidate.name === candidate.name)
    .map((skip) => skip.candidate.id);
  const replaces = loaded.filter((other) => other.id === candidate.id || lost.includes(other.id));
  const later = mod
    ? order.ordered
        .slice(order.ordered.indexOf(mod) + 1)
        .find((placed) => placed.tier === mod.tier && others.includes(placed.candidate))
    : undefined;
  return {
    ...(mod ? { mod } : {}),
    replaces: replaces.map((other) => other.id),
    ...(mod && later ? { note: lateNote(mod.tier, candidate, later.candidate) } : {}),
  };
}
