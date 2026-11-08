import type { ModSession } from './ports.ts';

/**
 * Why the session takes no new work from a mod (plugins/mods/api.md, "Calls and background work after
 * the user interrupts a turn", "Calls refused in `claude -p` runs and Agent SDK sessions"). The
 * wording of each reason is the page's: a mod tests for it with `includes`.
 */
export const REFUSAL_REASONS = {
  stopped: 'the session was stopped and nobody has sent input since',
  maxTurns: 'the run reached its --max-turns limit',
  budget: 'the run is past its --max-budget-usd limit',
  inputEnded: 'the host has ended its input',
} as const;

/** What a call that waited in the queue gives when the user stops the turn before it ran. */
export const QUEUE_DROPS = {
  prompt: 'the prompt was removed from the queue before it ran',
  command: 'the command was removed from the queue before it ran',
} as const;

/** `--max-turns` and `--max-budget-usd` of a `claude -p` run, or the Agent SDK's turn and spend limits. */
export interface RunLimits {
  readonly maxTurns?: number;
  readonly maxBudgetUsd?: number;
}

/**
 * What the session says about new work: the host tells it what happened to the session's input
 * (`interrupt`, `userInput`, `endInput`), the limits come from the run, and the kit decides which
 * calls it refuses and what each returns (`refusal.ts`).
 */
export interface RunGate {
  /** The reason a call that starts new work is refused now, or `undefined` while the session accepts it. */
  refusal(): Promise<string | undefined>;
  /** The user stopped a running turn (Esc, **Stop**, the SDK's `interrupt()`). */
  interrupt(): void;
  /** The user or the SDK application sent input: an interruption ends and the turn count starts over; the spend does not. */
  userInput(): Promise<void>;
  /** The host takes no more input: the run is ending. */
  endInput(): void;
  /** Aborts at the next interruption: for a call that waits in the queue, which the interruption drops. */
  interrupted(): AbortSignal;
}

/** A gate that never refuses and has no limits, for a mods API built without a host. */
export const openGate: RunGate = {
  refusal: () => Promise.resolve(undefined),
  interrupt: () => undefined,
  userInput: () => Promise.resolve(),
  endInput: () => undefined,
  interrupted: () => new AbortController().signal,
};

const costOf = (usage: unknown): number | undefined => {
  if (typeof usage !== 'object' || usage === null || !('cost' in usage)) return undefined;
  return typeof usage.cost === 'number' ? usage.cost : undefined;
};

/**
 * The gate over the session's own numbers: the turns and the spend come from `ModSession`. When more
 * than one reason applies, the one that no retry can change comes first: the input ended, the
 * budget, the turn limit, then the interruption (spec/judgments.md).
 */
export function createRunGate(
  session: Pick<ModSession, 'turns' | 'usage'>,
  limits: RunLimits = {},
): RunGate {
  let stopped = false;
  let ended = false;
  let turnsBefore = 0;
  let epoch = new AbortController();
  const overBudget = async (): Promise<boolean> => {
    if (limits.maxBudgetUsd === undefined) return false;
    return (costOf(await session.usage()) ?? 0) > limits.maxBudgetUsd;
  };
  const atTurnLimit = async (): Promise<boolean> =>
    limits.maxTurns !== undefined && (await session.turns()) - turnsBefore >= limits.maxTurns;
  return {
    async refusal() {
      if (ended) return REFUSAL_REASONS.inputEnded;
      if (await overBudget()) return REFUSAL_REASONS.budget;
      if (await atTurnLimit()) return REFUSAL_REASONS.maxTurns;
      return stopped ? REFUSAL_REASONS.stopped : undefined;
    },
    interrupt() {
      stopped = true;
      const dropped = epoch;
      epoch = new AbortController();
      dropped.abort();
    },
    async userInput() {
      stopped = false;
      turnsBefore = await session.turns();
    },
    endInput: () => void (ended = true),
    interrupted: () => epoch.signal,
  };
}
