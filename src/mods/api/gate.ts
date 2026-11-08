import { runEach } from '../../foundation/index.ts';
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

/**
 * The reason of a `$.session.send` that was not delivered while the session refuses new work (api.md,
 * "What refused calls return"): to a subagent that finished, and to a teammate of an agent team.
 */
export const unsentReason = {
  subagent: (id: string, reason: string): string => `Agent "${id}" was not resumed: ${reason}.`,
  teammate: (name: string, reason: string): string =>
    `Teammate "${name}" was not messaged: ${reason}.`,
};

/**
 * The toast Claude Code shows when the user stopped a turn and a mod then tried to start work on its
 * own and was refused (troubleshoot.md, "`Stopped: type a message to continue; a mod cannot resume work
 * after Stop`"). Nothing needs fixing: after the next message, mods can start work again.
 */
export const STOPPED_TOAST =
  'Stopped: type a message to continue; a mod cannot resume work after Stop';

/** What a call that waited in the queue gives when the user stops the turn before it ran. */
export const QUEUE_DROPS = {
  prompt: 'the prompt was removed from the queue before it ran',
  command: 'the command was removed from the queue before it ran',
} as const;

/**
 * The line a foreground Bash or PowerShell command gets when it reaches its timeout while the
 * session's input is held (api.md, "Work your mod started before the interruption"): the host ends
 * the command and puts this line in its output.
 */
export const HELD_AT_TIMEOUT =
  "Ended instead of moving to the background: plugins' input is held, by a Stop or by the host's limits.";

/**
 * What happens to a notice for the conversation that comes while the session is stopped (api.md,
 * "Work your mod started before the interruption"): a subagent's finish notice and the notice that a
 * monitor ended wait for the user's next input, and an event a monitor raises is dropped.
 */
export const STOPPED_NOTICES = {
  'agent.finished': 'held',
  'monitor.event': 'dropped',
  'monitor.ended': 'held',
} as const satisfies Readonly<Record<string, 'held' | 'dropped'>>;
export type NoticeKind = keyof typeof STOPPED_NOTICES;
/** `delivered` reached the conversation at once, `held` waits for the user's next input, `dropped` is gone. */
export type NoticeOutcome = 'delivered' | 'held' | 'dropped';

type Deliver = () => void;
/** What a stopped session does with a notice, by the outcome its kind has. */
const WHEN_STOPPED: Readonly<
  Record<(typeof STOPPED_NOTICES)[NoticeKind], (queue: Deliver[], deliver: Deliver) => void>
> = {
  held: (queue, deliver) => void queue.push(deliver),
  dropped: () => undefined,
};

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
  /** A call that starts new work was refused for `reason`: a stop is shown to the user as a toast. */
  refused(reason: string): void;
  /** Replaces the run's limits, for a host that lives longer than one run: the next call is judged by them. */
  setLimits(limits: RunLimits): void;
  /**
   * A notice for the conversation, such as a subagent's finish notice or an event from a monitor a
   * mod started. `deliver` puts it in the conversation: now, after the user's next input, or never,
   * as `STOPPED_NOTICES` says for its kind while the session is stopped.
   */
  notice(kind: NoticeKind, deliver: () => void): NoticeOutcome;
}

/** A gate that never refuses and has no limits, for a mods API built without a host. */
export const openGate: RunGate = {
  refusal: () => Promise.resolve(undefined),
  interrupt: () => undefined,
  userInput: () => Promise.resolve(),
  endInput: () => undefined,
  interrupted: () => new AbortController().signal,
  refused: () => undefined,
  setLimits: () => undefined,
  notice: (_kind, deliver) => (deliver(), 'delivered'),
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
  initial: RunLimits = {},
  options: { readonly toast?: (text: string) => void } = {},
): RunGate {
  let limits = initial;
  let stopped = false;
  let ended = false;
  let turnsBefore = 0;
  let epoch = new AbortController();
  const waiting: Deliver[] = [];
  const overBudget = async (): Promise<boolean> => {
    const { maxBudgetUsd } = limits;
    if (maxBudgetUsd === undefined) return false;
    return (costOf(await session.usage()) ?? 0) > maxBudgetUsd;
  };
  const atTurnLimit = async (): Promise<boolean> => {
    const { maxTurns } = limits;
    return maxTurns !== undefined && (await session.turns()) - turnsBefore >= maxTurns;
  };
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
      // Judgment: a notice whose delivery throws does not cost the ones held after it; the failure is reported once all ran.
      runEach(waiting.splice(0), (deliver) => deliver());
    },
    endInput: () => void (ended = true),
    interrupted: () => epoch.signal,
    refused(reason) {
      if (reason === REFUSAL_REASONS.stopped) options.toast?.(STOPPED_TOAST);
    },
    setLimits: (next) => void (limits = next),
    notice(kind, deliver) {
      if (!stopped) {
        deliver();
        return 'delivered';
      }
      WHEN_STOPPED[STOPPED_NOTICES[kind]](waiting, deliver);
      return STOPPED_NOTICES[kind];
    },
  };
}
