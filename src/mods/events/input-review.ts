import type { PermissionMode } from '../../protocol/official.ts';
import { sameData } from './spec.ts';
import type { ToolDecision } from './tool-check-merge.ts';

/**
 * A call a hook changed after auto mode's review (troubleshoot.md, "`a hook changed this call's input
 * after the model wrote it`"; hooks.md, "PreToolUse `updatedInput` in auto mode"). The server
 * reviewed the input Claude wrote, so a change by a hook, a mod's `tool.call` or `turn.step` hook or
 * a `PreToolUse` settings hook, leaves a review that "doesn't cover what would run", and the call is
 * denied. The reviewer is the host's; this is the rule that follows its verdict.
 */

/** The two texts of the denial: the server-side review, and the review some terminal and VS Code sessions name. */
export const INPUT_CHANGED = {
  server: "a hook changed this call's input after the model wrote it",
  session: "a hook changed this call's input after auto mode reviewed it",
} as const;
export type InputReview = keyof typeof INPUT_CHANGED;

/**
 * "The message tells Claude to issue the call once more as recorded" (the second sentence is the
 * kit's wording, judgment: the docs give the instruction and not its words). The message does not say
 * which hook changed the input.
 */
const denialText = (review: InputReview): string =>
  `${INPUT_CHANGED[review]}; issue the call once more exactly as recorded`;

/** The modes in which a server or session review covered the call: only auto mode has one. */
const REVIEWED: { readonly [M in PermissionMode]: boolean } = {
  default: false,
  acceptEdits: false,
  bypassPermissions: false,
  plan: false,
  dontAsk: false,
  auto: true,
};

/**
 * The denial of a call whose input a hook changed after the review, or `undefined` when no review
 * covered the call (any mode but auto) or the input is as the model wrote it.
 */
export function inputChangedDenial(call: {
  readonly mode: PermissionMode;
  /** The input the model wrote, which the review covered. */
  readonly written: unknown;
  /** The input the hooks passed on. */
  readonly passed: unknown;
  readonly review: InputReview;
}): ToolDecision | undefined {
  if (!REVIEWED[call.mode] || sameData(call.written, call.passed)) return undefined;
  return { decision: 'deny', reason: denialText(call.review) };
}
