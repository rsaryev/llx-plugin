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

/** Whether a `tool.check` hook can only tighten a call that is not read-only, in this mode. */
export const hookTightensOnly = (mode: PermissionMode): boolean => TIGHTEN_ONLY[mode];

/**
 * How the host states the mode's part of the merge: the permission mode, or the verdict a host
 * reached itself (`hookTightensOnly` over its own mode), when it has no `PermissionMode` to hand.
 */
export type ToolCheckMode =
  | { readonly mode: PermissionMode; readonly tightenOnly?: never }
  | { readonly tightenOnly: boolean; readonly mode?: never };

export type ToolCheckContext = ToolCheckMode & {
  /** `e.isReadOnly`: `true` when the tool reports the call as read-only, otherwise absent. */
  readonly isReadOnly?: true;
  /** `e.ceiling`: `ask` for a connector tool the organization set to `ask`, otherwise absent. */
  readonly ceiling?: 'ask';
};

/**
 * The decision a call gets, from the decision Claude Code reached (what `next(e)` resolves to) and
 * the one a mod answered. In plan mode a call that is not read-only can be tightened by a mod but
 * not approved or loosened; in every other case, and for a read-only call, the mod's answer stands
 * (events.md, "Approve or refuse a tool call before the user is asked"; permissions.md, "Hook
 * approvals in plan mode"). A mod's own `deny` is a tightening, so a mod can still block there.
 * A connector tool with `ceiling: 'ask'` still prompts when a mod allows it (permissions.md,
 * "Hook approvals in plan mode": tools "your organization set to `ask`"), so an `allow` is `ask`.
 */
export function mergeToolCheck(
  claudeCode: ToolDecision,
  mod: ToolDecision,
  context: ToolCheckContext,
): ToolDecision {
  const tightenOnly =
    context.mode === undefined ? context.tightenOnly : hookTightensOnly(context.mode);
  const bound = tightenOnly && context.isReadOnly !== true;
  const merged =
    bound && STRICTNESS[mod.decision] < STRICTNESS[claudeCode.decision] ? claudeCode : mod;
  return context.ceiling === 'ask' && merged.decision === 'allow'
    ? { ...merged, decision: 'ask' }
    : merged;
}
