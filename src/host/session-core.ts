import {
  createOnceClaims,
  createStopBlockCap,
  type HookEngine,
  type HookRegistry,
  type OnceClaims,
  type StopBlockCap,
} from '../hooks/index.ts';
import type { InvokedSkill } from '../loading/index.ts';

import { type HookUsage } from '../skills/index.ts';
import { createBackgroundQueue, type BackgroundQueue } from './background-queue.ts';
import { initialRegistry, refreshRegistry } from './session-registry.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostState, HostStateSource } from './state.ts';
import type { HookSessionGates } from '../settings/hooks/session-gates.ts';
import { NO_HOOKS_YET } from '../skills/hook-limits.ts';

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
  readonly pluginId?: string;
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

/** What the engine of a session was built over; another state or turn input builds it again. */
export interface EngineInputs {
  readonly state: HostState;
  readonly ports: SessionOptions['ports'];
  readonly cwd: string;
  readonly additionalDirectories: SessionOptions['additionalDirectories'];
  readonly trusted: SessionOptions['trusted'];
}

/** The session's engine and what it was built over (`engineFor`). */
export interface BuiltEngine {
  readonly inputs: EngineInputs;
  readonly engine: HookEngine;
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
  readonly cell: HostStateSource;
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
  /** The session's engine, built again only when the state or the turn's ports or paths change. */
  readonly engine: Cell<BuiltEngine | undefined>;
  /** The consecutive Stop blocks of the session: every engine it builds counts in this one. */
  readonly stopCap: StopBlockCap;
  /** The `once` handlers its dispatches hold and spent: every engine it builds reads this one. */
  readonly onceClaims: OnceClaims;
  /** The skills that ran and the monitors started in this session (`session.monitorsToStart`). */
  readonly monitors: MonitorLedger;
}

/** What decides a session's monitors: the skills that ran, and the monitors it started, by key. */
export interface MonitorLedger {
  readonly invoked: InvokedSkill[];
  readonly started: Map<string, MonitorId>;
}

/**
 * A session's `MonitorLedger` as plain data (`session.monitorLedger()`): a session opened with it
 * (`SessionOptions.monitorLedger`) continues from it, so reopening a chat's session neither starts a
 * monitor again nor forgets a skill that ran. Judgment (spec/judgments.md).
 */
export interface MonitorLedgerState {
  readonly invoked: readonly InvokedSkill[];
  readonly started: readonly MonitorId[];
}

/** A monitor a session started: its plugin's id and its name, unique within the plugin. */
export interface MonitorId {
  readonly pluginId: string;
  readonly name: string;
}

export const monitorKey = (id: MonitorId): string => `${id.pluginId}\u0000${id.name}`;

/** The live ledger a session starts from: empty, or a copy of the state it continues. */
const ledgerOf = (from: MonitorLedgerState | undefined): MonitorLedger => ({
  invoked: [...(from?.invoked ?? [])],
  started: new Map((from?.started ?? []).map((id) => [monitorKey(id), id])),
});

/** The live ledger of each session the kit opened, for a subagent's session to share (`SessionOptions.parentSession`). */
const LEDGERS = new WeakMap<object, MonitorLedger>();

/** Remembers `session`'s live ledger, so a subagent's session opened in it shares the ledger. */
export const rememberLedger = (session: object, ledger: MonitorLedger): void =>
  void LEDGERS.set(session, ledger);

/**
 * The live ledger a session starts from: its chat session's own when it is a subagent's, else its
 * own, empty or continuing a saved one (`SessionOptions.monitorLedger`).
 */
export function monitorLedgerFor(
  parent: object | undefined,
  saved: MonitorLedgerState | undefined,
): MonitorLedger {
  if (parent === undefined) return ledgerOf(saved);
  const shared = LEDGERS.get(parent);
  if (shared === undefined) throw new Error('parentSession: not a session this host opened');
  return shared;
}

export function createSessionCore(cell: HostStateSource, monitors: MonitorLedger): SessionCore {
  const state = cell.current();
  const { gates } = state;
  return {
    cell,
    seen: cellOf({ state, gates }),
    registry: cellOf(initialRegistry(state, gates)),
    skillHooks: { used: new Map(), counted: new Map() },
    registrations: new Map(),
    watchPaths: cellOf<readonly string[]>([]),
    background: createBackgroundQueue(),
    engine: cellOf<BuiltEngine | undefined>(undefined),
    stopCap: createStopBlockCap(),
    onceClaims: createOnceClaims(),
    monitors,
  };
}

/**
 * The ledger after an update: the counts of skills whose plugin no longer runs go, and `used` is
 * summed again from the counts that stay, so the 1,024-hook limit is what the survivors used.
 * Judgment (spec/judgments.md): a skill whose `once` hook ran still counts, as it was registered.
 */
function settleLedger(core: SessionCore, state: HostState): void {
  const { used, counted } = core.skillHooks;
  for (const [prefix, own] of counted) {
    if (own.pluginId !== undefined && !state.active.some((plugin) => plugin.id === own.pluginId))
      counted.delete(prefix);
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
  const { gates } = state;
  refreshRegistry(core, { state, gates });
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
