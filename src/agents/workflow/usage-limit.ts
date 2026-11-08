/**
 * When a run hits your usage limit (workflows.md, "When a run hits your usage limit"): the run pauses
 * instead of failing the agent, when all of the conditions hold; when one does not, the affected agent
 * fails. Pure over facts the host holds.
 */

export const SESSION_KINDS = [
  'interactive',
  'non-interactive',
  'background',
  'remote-control',
  'agent-team-teammate',
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/** "The session is interactive": a run does not pause in `claude -p` or the Agent SDK, a background session, Remote Control or an agent team teammate. */
const SESSION_PAUSES: { readonly [K in SessionKind]: boolean } = {
  interactive: true,
  'non-interactive': false,
  background: false,
  'remote-control': false,
  'agent-team-teammate': false,
};

export const NO_WAIT_CAUSES = [
  'session-not-interactive',
  'no-subscription',
  'auto-continue-off',
  'reset-too-far',
  'waited-twice',
  'old-release',
] as const;
export type NoWaitCause = (typeof NO_WAIT_CAUSES)[number];

/** A day, in milliseconds: "The limit resets within 24 hours". */
const DAY_MS = 24 * 60 * 60 * 1000;

/** "The run hasn't already waited twice. When it hits the limit a third time, the agent fails." */
export const MAX_USAGE_WAITS = 2;

export interface UsageLimitFacts {
  readonly session: SessionKind;
  /** Signed in with a claude.ai subscription. */
  readonly subscription: boolean;
  /** `autoContinueAtUsageLimit` is on. */
  readonly autoContinue: boolean;
  /** Milliseconds until the limit resets. A weekly limit can reset further out. */
  readonly msUntilReset: number;
  /** How many times the run has already waited. */
  readonly waitsSoFar: number;
  /** The release has the wait (Claude Code v2.1.271 or later); "on earlier versions, the affected agents fail". */
  readonly releaseHasWait: boolean;
}

export type UsageLimitDecision =
  | {
      /** The agents that hit the limit wait for the reset, and "no new agents start" while it lasts. */
      readonly pauses: true;
      /** Shown on the progress line and in the `/workflows` header. */
      readonly msUntilReset: number;
    }
  | { readonly pauses: false; readonly failsAgent: true; readonly causes: readonly NoWaitCause[] };

const CONDITIONS: { readonly [C in NoWaitCause]: (facts: UsageLimitFacts) => boolean } = {
  'session-not-interactive': (facts) => !SESSION_PAUSES[facts.session],
  'no-subscription': (facts) => !facts.subscription,
  'auto-continue-off': (facts) => !facts.autoContinue,
  'reset-too-far': (facts) => facts.msUntilReset > DAY_MS,
  'waited-twice': (facts) => facts.waitsSoFar >= MAX_USAGE_WAITS,
  'old-release': (facts) => !facts.releaseHasWait,
};

/**
 * Whether the run waits for the reset or the agent that hit the limit fails. Asked again during a
 * wait with the current facts: "If you turn [`autoContinueAtUsageLimit`] off during a wait, the wait
 * ends and the waiting agents fail."
 */
export function usageLimitDecision(facts: UsageLimitFacts): UsageLimitDecision {
  const causes = NO_WAIT_CAUSES.filter((cause) => CONDITIONS[cause](facts));
  if (causes.length > 0) return { pauses: false, failsAgent: true, causes };
  return { pauses: true, msUntilReset: facts.msUntilReset };
}
