import type { PermissionBehavior, PermissionMode } from '../../protocol/official.ts';
import type { Decision, PreparedCall } from '../types.ts';

/**
 * The host's reviewer for auto mode (permission-modes.md, "Eliminate permission prompts with auto
 * mode"): "a second model, the classifier, reviews actions instead of you". The kit holds no model
 * and no classifier. `decide` returns `classify` for an action that goes to the reviewer; the host
 * (or `settleClassification`) hands it here.
 *
 * It names `PreparedCall`, a layer-3 type, so it lives in the rules module rather than in
 * `src/ports/` (docs/ARCHITECTURE.md, "Ports").
 */
export interface PermissionClassifier {
  review(
    call: PreparedCall,
    context: { readonly mode: PermissionMode },
    signal?: AbortSignal,
  ): Promise<PermissionBehavior>;
}

/** How the reviewer's answer reads as a decision: allow runs, deny blocks, ask prompts. */
const ANSWER: { readonly [B in PermissionBehavior]: (reason: Decision['reason']) => Decision } = {
  allow: (reason) => ({ outcome: 'allow', reason }),
  deny: (reason) => ({ outcome: 'deny', reason }),
  ask: (reason) => ({ outcome: 'ask', reason }),
};

/** What a host hands `settleClassification`: the call, the mode, its reviewer and an abort signal. */
export interface ClassificationRequest {
  readonly call: PreparedCall;
  readonly mode: PermissionMode;
  readonly classifier?: PermissionClassifier;
  readonly signal?: AbortSignal;
}

/** What becomes of a decision: only `classify` goes to the reviewer; the rest stand. */
const SETTLE: {
  readonly [O in Decision['outcome']]: (
    decision: Decision,
    request: ClassificationRequest,
  ) => Promise<Decision>;
} = {
  allow: (decision) => Promise.resolve(decision),
  deny: (decision) => Promise.resolve(decision),
  ask: (decision) => Promise.resolve(decision),
  classify: async (decision, { call, mode, classifier, signal }) => {
    // "Claude Code denies the action rather than run it unreviewed" when there is no verdict.
    if (classifier === undefined) return ANSWER.deny(decision.reason);
    return ANSWER[await classifier.review(call, { mode }, signal)](decision.reason);
  },
};

/**
 * The decision once the host's reviewer has answered a `classify`. Any other decision is returned
 * unchanged and the reviewer is not asked. With no reviewer there is no verdict, and no verdict
 * denies the action (permission-modes.md, "When auto mode falls back").
 */
export function settleClassification(
  decision: Decision,
  request: ClassificationRequest,
): Promise<Decision> {
  return SETTLE[decision.outcome](decision, request);
}
