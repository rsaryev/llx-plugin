import type { HookSpecificOutputOf } from '../../protocol/hook-events.ts';
import { type Decision } from '../../rules/index.ts';
import type { HookOutcome } from '../outcome.ts';
import { PROMPT_DENIALS } from '../../rules/decide/unanswered.ts';

type RequestBehavior = HookSpecificOutputOf<'PermissionRequest'>['decision']['behavior'];

/** What the hook's answer makes of the call: it runs, or it is denied by the hook. */
const ANSWERS: { readonly [B in RequestBehavior]: Decision } = {
  allow: { outcome: 'allow', reason: 'hook' },
  deny: { outcome: 'deny', reason: 'hook' },
};

/** Which outcomes are a prompt the hooks answer; a denial counts only in place of a prompt. */
const PROMPTS: { readonly [O in Decision['outcome']]: boolean } = {
  allow: false,
  ask: true,
  deny: false,
  classify: false,
};

/** A decision that stands where a prompt would be: an `ask`, or a denial in place of a prompt nobody may answer. */
const answerable = (decision: Decision): boolean =>
  PROMPTS[decision.outcome] || PROMPT_DENIALS.has(decision.reason);

/**
 * The decision once the `PermissionRequest` hooks have answered (hooks.md, "PermissionRequest
 * decision control"). The hooks answer the prompt a call would get, and also where no prompt may be
 * shown: "Anything that would prompt is denied unless a `PermissionRequest` hook allows it"
 * (headless.md), and with `permissions.denyInsteadOfPrompting` "A `PermissionRequest` hook still
 * answers" (settings-reference.md). A call denied before any hook is asked (a deny rule, a
 * critical-path removal in auto mode) and a call already decided stay as they are; with no answer
 * the decision stands. The `updatedInput` and `updatedPermissions` of an allow stay in `effects`.
 */
export function permissionRequestDecision(
  decision: Decision,
  outcome: Pick<HookOutcome<'PermissionRequest'>, 'effects'>,
): Decision {
  const answer = outcome.effects.permissionRequest;
  return answer !== undefined && answerable(decision) ? ANSWERS[answer.behavior] : decision;
}
