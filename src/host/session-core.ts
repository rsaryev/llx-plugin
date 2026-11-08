import { createHookRegistry, type HookRegistry } from '../hooks/index.ts';
import { hookSessionGates, type HookSessionGates } from '../settings/hooks/index.ts';
import { NO_HOOKS_YET, type HookUsage } from '../skills/index.ts';
import { createBackgroundQueue, type BackgroundQueue } from './background-queue.ts';
import { declaredEntries, initialRegistry, isScoped, survives } from './session-registry.ts';
import type { HostState, HostStateCell } from './state.ts';

/** One value a session keeps and its views read and replace. */
export interface Cell<T> {
  get(): T;
  set(value: T): void;
}

const cellOf = <T>(initial: T): Cell<T> => {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
};

/** What one skill's hooks used: its own counts, and where they count and whose they are. */
export interface CountedHooks extends HookUsage {
  /** The source of skills it counts under (`hookSourceOf`). */
  readonly source: string;
  /** The plugin the skill belongs to; the counts go when the plugin stops running. */
  readonly pluginId: string;
}

/**
 * What a skill's hooks have used of the limits of hooks.md, "Limits on skill hooks": per source of
 * skills (`used`), and per skill (`counted`) so that invoking a skill again counts its hooks once.
 * `used` is always the sum of `counted` by source; an update rebuilds it from the survivors.
 */
export interface SkillHookLedger {
  readonly used: Map<string, HookUsage>;
  readonly counted: Map<string, CountedHooks>;
}

/** The state a session last took up, with the gates its settings give. */
export interface Seen {
  readonly state: HostState;
  readonly gates: HookSessionGates;
}

/**
 * The state of a session that must outlive a turn, made once by `openSession` and shared by every
 * view `withTurn` makes: the hooks registered so far, with the skills' (a `once` hook that ran is
 * gone from the cell for every later turn), what skill hooks have used of their limits, what each
 * prefix of `addHooks` registered, the dynamic watch list and the background queue. The turn view
 * holds nothing of its own beyond the options of the turn. It also holds the host's state cell: a
 * view asks `currentOf` for the state at each use, so `host.update` reaches an open session.
 */
export interface SessionCore {
  readonly cell: HostStateCell;
  /** The state and gates the registry and the ledger were last made for. */
  readonly seen: Cell<Seen>;
  readonly registry: Cell<HookRegistry>;
  readonly skillHooks: SkillHookLedger;
  /** What each prefix registered through `addHooks` or a skill: the ids to remove, by prefix. */
  readonly registrations: Map<string, { readonly ids: readonly string[] }>;
  /** The dynamic part of the FileChanged watch list: the last `watchPaths` an output returned. */
  readonly watchPaths: Cell<readonly string[]>;
  /** The background deliveries of every dispatch of the session, for `takeBackground`. */
  readonly background: BackgroundQueue;
}

export function createSessionCore(cell: HostStateCell): SessionCore {
  const state = cell.current();
  const gates = hookSessionGates(state.view, state.parent);
  return {
    cell,
    seen: cellOf({ state, gates }),
    registry: cellOf(initialRegistry(state, gates)),
    skillHooks: { used: new Map(), counted: new Map() },
    registrations: new Map(),
    watchPaths: cellOf<readonly string[]>([]),
    background: createBackgroundQueue(),
  };
}

/** The registrations without the ids an update dropped; one left with none is forgotten. */
function settleRegistrations(core: SessionCore, lost: ReadonlySet<string>): void {
  for (const [prefix, registration] of core.registrations) {
    const ids = registration.ids.filter((id) => !lost.has(id));
    if (ids.length === registration.ids.length) continue;
    if (ids.length === 0) core.registrations.delete(prefix);
    else core.registrations.set(prefix, { ids });
  }
}

/**
 * The ledger after an update: the counts of skills whose plugin no longer runs go, and `used` is
 * summed again from the counts that stay, so the 1,024-hook limit is what the survivors used.
 * Judgment (spec/judgments.md): a skill whose `once` hook ran still counts, as it was registered.
 */
function settleLedger(core: SessionCore, state: HostState): void {
  const { used, counted } = core.skillHooks;
  for (const [prefix, own] of counted) {
    if (!state.active.some((plugin) => plugin.id === own.pluginId)) counted.delete(prefix);
  }
  used.clear();
  for (const own of counted.values()) {
    const before = used.get(own.source) ?? NO_HOOKS_YET;
    used.set(own.source, {
      hooks: before.hooks + own.hooks,
      matcherChars: before.matcherChars + own.matcherChars,
    });
  }
}

/**
 * Brings a session over to a new state (docs/API.md, "Updating"): the handlers of kind `plugin` and
 * `settings` are rebuilt from it; those a session registered since it opened (skill, agent,
 * session) stay unless their plugin no longer runs or the new plugin-only lock silences them; the
 * registrations and the skill-hook ledger follow what stayed. A consumed `once` key stays consumed
 * (its handler is not in the registry to come back), and the dynamic watch list is kept.
 */
function refresh(core: SessionCore, state: HostState): void {
  const gates = hookSessionGates(state.view, state.parent);
  const scoped = core.registry.get().entries.filter(isScoped);
  const kept = scoped.filter((entry) => survives(entry, state, gates));
  const stays = new Set(kept);
  const lost = new Set(scoped.filter((entry) => !stays.has(entry)).map((entry) => entry.id));
  core.registry.set(createHookRegistry([...declaredEntries(state, gates), ...kept]));
  settleRegistrations(core, lost);
  settleLedger(core, state);
  core.seen.set({ state, gates });
}

/**
 * The state and gates a view reads at one use. A state the session has not taken up yet (the host
 * was updated since) is taken up first, so views made before an update read the new one; updates
 * made before the session is used again count as one.
 */
export function currentOf(core: SessionCore): Seen {
  const state = core.cell.current();
  if (core.seen.get().state !== state) refresh(core, state);
  return core.seen.get();
}
