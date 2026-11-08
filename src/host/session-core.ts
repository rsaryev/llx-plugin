import type { HookRegistry } from '../hooks/index.ts';
import { hookSessionGates, type HookSessionGates } from '../settings/hooks/index.ts';
import type { HookUsage } from '../skills/index.ts';
import { initialRegistry } from './session-hooks.ts';
import type { HostState } from './state.ts';

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

/**
 * What a skill's hooks have used of the limits of hooks.md, "Limits on skill hooks": per source of
 * skills (`used`), and per skill (`counted`) so that invoking a skill again counts its hooks once.
 */
export interface SkillHookLedger {
  readonly used: Map<string, HookUsage>;
  readonly counted: Map<string, HookUsage>;
}

/**
 * The state of a session that must outlive a turn, made once by `openSession` and shared by every
 * view `withTurn` makes: the hooks registered so far, with the skills' (a `once` hook that ran is
 * gone from the cell for every later turn), what skill hooks have used of their limits, and the
 * paths the hooks of `FileChanged` watch beyond the ones their matchers name. The turn view holds
 * nothing of its own beyond the options of the turn.
 */
export interface SessionCore {
  /** The policy of the settings, read once for the session. */
  readonly gates: HookSessionGates;
  readonly registry: Cell<HookRegistry>;
  readonly skillHooks: SkillHookLedger;
  /** The watch list slot: what the host adds to the paths a `FileChanged` matcher names. */
  readonly watch: Cell<readonly string[]>;
}

export function createSessionCore(state: HostState): SessionCore {
  const gates = hookSessionGates(state.view, state.parent);
  return {
    gates,
    registry: cellOf(initialRegistry(state, gates)),
    skillHooks: { used: new Map(), counted: new Map() },
    watch: cellOf([]),
  };
}
