/**
 * The calls a fresh copy of a mod does not make again (plugins/mods/troubleshoot.md, "`its
 * session.start ran again in a fresh copy`"): when Claude Code loads a mod's module again, for
 * example after the hooks worker crashed and was replaced, the fresh copy's `session.start` hook
 * runs, and the `$.prompt.submit`, `$.command.run` or `$.agent.spawn` call it repeats "resolved with
 * the result of its first run instead of running again". The docs say what the mod sees, not how a
 * call is told from another across copies: the ledger keys a call by the mod, the kind of call and
 * its place among the calls of that kind made in the `session.start` hook (spec/judgments.md).
 */

/** The calls that start work, which a fresh copy must not start twice. */
export const REPLAYED_CALLS = ['prompt.submit', 'command.run', 'agent.spawn'] as const;
export type ReplayedCall = (typeof REPLAYED_CALLS)[number];

/** The first `session.start` of a copy records its calls; the one of a fresh copy replays them. */
export type ReplayMode = 'first' | 'again';

export interface ReplayLedger {
  /** Runs `run`, the `session.start` hook of `mod`, so that its calls are numbered. */
  window<T>(mod: string, mode: ReplayMode, run: () => Promise<T>): Promise<T>;
  /**
   * One call of `mod`: made as `run` says, or, in the `session.start` of a fresh copy, answered with
   * the result of the first copy's call at the same place. A call outside `session.start` is `run`.
   */
  once(mod: string, kind: ReplayedCall, run: () => Promise<unknown>): Promise<unknown>;
  /** Forgets the calls of `mod`: it is gone (unloaded by the host or for a crash), so its results are not kept. */
  forget(mod: string): void;
}

/** The line for people when a call was not made again. */
export const replayedLine = (mod: string, kind: ReplayedCall): string =>
  `${mod}: its session.start ran again in a fresh copy; the $.${kind} call it had already made was not made again`;

/** What differs per mode: whether the `session.start` repeats the calls of the first copy. */
const REPEATS: { readonly [M in ReplayMode]: boolean } = { first: false, again: true };

interface Window {
  readonly repeats: boolean;
  readonly ordinals: Map<ReplayedCall, number>;
  /** The kinds already named in a line: one line for each kind of call in a fresh copy. */
  readonly said: Set<ReplayedCall>;
}

/** `replayed` is told, once for each kind of call, that a fresh copy's call was answered from the first. */
export function createReplayLedger(
  replayed: (mod: string, kind: ReplayedCall) => void,
): ReplayLedger {
  const calls = new Map<string, Map<string, Promise<unknown>>>();
  const windows = new Map<string, Window>();
  const callsOf = (mod: string): Map<string, Promise<unknown>> => {
    const own = calls.get(mod) ?? new Map<string, Promise<unknown>>();
    calls.set(mod, own);
    return own;
  };
  return {
    async window(mod, mode, run) {
      const repeats = REPEATS[mode];
      if (!repeats) calls.delete(mod);
      windows.set(mod, { repeats, ordinals: new Map(), said: new Set() });
      try {
        return await run();
      } finally {
        windows.delete(mod);
      }
    },
    once(mod, kind, run) {
      const open = windows.get(mod);
      if (!open) return run();
      const ordinal = (open.ordinals.get(kind) ?? 0) + 1;
      open.ordinals.set(kind, ordinal);
      const key = `${kind}#${ordinal}`;
      const own = callsOf(mod);
      const first = own.get(key);
      if (first !== undefined && open.repeats) {
        if (!open.said.has(kind)) {
          open.said.add(kind);
          replayed(mod, kind);
        }
        return first;
      }
      const started = run();
      own.set(key, started);
      // A call that failed was not made: a fresh copy makes it for real.
      started.catch(() => (own.get(key) === started ? own.delete(key) : false));
      return started;
    },
    forget: (mod) => void calls.delete(mod),
  };
}
