import type { PermissionBehavior, PermissionMode } from '../../protocol/official.ts';

/** What `tool.check` decides: `allow`, `ask` or `deny`, with an optional reason. */
export interface ToolDecision {
  readonly decision: PermissionBehavior;
  readonly reason?: string;
}

/**
 * How strict each decision is. The docs say a hook can "tighten" the decision but "can't loosen
 * it", which needs an order; allow, then ask, then deny is the kit's reading (judgment).
 */
const STRICTNESS: { readonly [B in PermissionBehavior]: number } = { allow: 0, ask: 1, deny: 2 };

/** The modes in which a `tool.check` hook can only tighten a call that is not read-only (permissions.md, "Hook approvals in plan mode"). */
const TIGHTEN_ONLY: { readonly [M in PermissionMode]: boolean } = {
  default: false,
  acceptEdits: false,
  bypassPermissions: false,
  plan: true,
  dontAsk: false,
  auto: false,
};

export interface ToolCheckContext {
  readonly mode: PermissionMode;
  /** `e.isReadOnly`: `true` when the tool reports the call as read-only, otherwise absent. */
  readonly isReadOnly?: true;
}

/**
 * The decision a call gets, from the decision Claude Code reached (what `next(e)` resolves to) and
 * the one a mod answered. In plan mode a call that is not read-only can be tightened by a mod but
 * not approved or loosened; in every other case, and for a read-only call, the mod's answer stands
 * (events.md, "Approve or refuse a tool call before the user is asked"; permissions.md, "Hook
 * approvals in plan mode"). A mod's own `deny` is a tightening, so a mod can still block there.
 */
export function mergeToolCheck(
  claudeCode: ToolDecision,
  mod: ToolDecision,
  context: ToolCheckContext,
): ToolDecision {
  const bound = TIGHTEN_ONLY[context.mode] && context.isReadOnly !== true;
  return bound && STRICTNESS[mod.decision] < STRICTNESS[claudeCode.decision] ? claudeCode : mod;
}
