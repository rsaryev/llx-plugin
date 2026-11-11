import type { Decision, DecisionReason } from '../types.ts';
import type { DecideContext } from './context.ts';

/**
 * What becomes of a would-be prompt where nobody may answer it. Two facts of the session say so:
 * `cannotPrompt`, a `-p` or SDK run with no permission callback ("Calls needing approval are
 * denied", permission-modes.md), and `permissions.denyInsteadOfPrompting` ("Claude Code denies a
 * tool call that would otherwise wait on a prompt, and the turn continues", settings-reference.md).
 * One rule for both: an `ask` is a denial, every other outcome stands. The setting names its own
 * reason, because its denial carries its own messages.
 */
export type PromptFacts = Pick<DecideContext, 'cannotPrompt' | 'denyInsteadOfPrompting'>;

/** The reason a would-be prompt is denied with, or `undefined` where someone may answer it. */
function unansweredReason(facts: PromptFacts): DecisionReason | undefined {
  if (facts.denyInsteadOfPrompting === true) return 'no-approval-surface';
  return facts.cannotPrompt === true ? 'prompt-unavailable' : undefined;
}

const UNANSWERED: {
  readonly [O in Decision['outcome']]: (decision: Decision, reason: DecisionReason) => Decision;
} = {
  allow: (decision) => decision,
  ask: (_decision, reason) => ({ outcome: 'deny', reason }),
  deny: (decision) => decision,
  classify: (decision) => decision,
};

/** The decision once the session's prompt facts apply: an `ask` nobody may answer is denied. */
export function settlePrompt(decision: Decision, facts: PromptFacts): Decision {
  const reason = unansweredReason(facts);
  return reason === undefined ? decision : UNANSWERED[decision.outcome](decision, reason);
}

/**
 * The denials a `PermissionRequest` hook may still turn into an approval: they stand in for the
 * prompt the hook answers ("Anything that would prompt is denied unless a `PermissionRequest` hook
 * allows it", headless.md; "A `PermissionRequest` hook still answers", settings-reference.md).
 */
export const PROMPT_DENIALS: ReadonlySet<DecisionReason> = new Set([
  'prompt-unavailable',
  'no-approval-surface',
]);
