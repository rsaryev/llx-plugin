import type { HookPermissionDecision } from '../../protocol/official.ts';
import type { Decision, PreparedCall } from '../types.ts';
import type { DecideContext, ModOutcome, ModReach, Pending } from './context.ts';
import type { CallFacts } from './facts.ts';
import type { ModeStrategy } from './modes.ts';

/**
 * How PreToolUse hooks and mods meet the rules and the mode (permissions.md, "Extend permissions
 * with hooks"; hooks.md, "PreToolUse decision control").
 */

/** What one answer of a PreToolUse hook does to the permission check. */
interface HookAnswer {
  readonly vetoes: boolean;
  readonly asks: boolean;
  readonly allows: boolean;
}

const NO_ANSWER: HookAnswer = { vetoes: false, asks: false, allows: false };

/** Typed over the SDK's union: a decision added to it fails the typecheck until it has an entry. `defer` is no answer here. */
const HOOK_ANSWERS: { readonly [D in HookPermissionDecision]: HookAnswer } = {
  allow: { vetoes: false, asks: false, allows: true },
  deny: { vetoes: true, asks: false, allows: false },
  ask: { vetoes: false, asks: true, allows: false },
  defer: NO_ANSWER,
};

const answerOf = (ctx: DecideContext): HookAnswer =>
  ctx.hook?.decision === undefined ? NO_ANSWER : HOOK_ANSWERS[ctx.hook.decision];

/** A hook that "exits with code 2" blocks, and a `deny` is a block; JSON on an exit-2 hook cannot override it. */
export const hookVetoes = (ctx: DecideContext): boolean =>
  ctx.hook?.blocked === true || answerOf(ctx).vetoes;

/** A hook `ask` "prompts the user to confirm". `defer` is not an answer here. */
export const hookAsks = (ctx: DecideContext): boolean => answerOf(ctx).asks;

/**
 * Tools whose allow needs the hook's own answer: "`AskUserQuestion` and `ExitPlanMode` need
 * `updatedInput` paired with `\"allow\"`". For them an allow without `updatedInput` does not skip
 * the prompt, and with it the tool runs in any mode (plan mode included).
 */
const PAIRED_TOOLS: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode']);

const hookAllowed = (ctx: DecideContext): boolean => answerOf(ctx).allows;

/** Whether the hook's allow settles a call of a paired tool. */
export const hookApprovesPaired = (call: PreparedCall, ctx: DecideContext): boolean =>
  PAIRED_TOOLS.has(call.toolName) && hookAllowed(ctx) && ctx.hook?.hasUpdatedInput === true;

/** Whether the hook's allow skips the prompt a call would get: not for a paired tool, not where the mode ignores it. */
export function hookSkipsPrompt(
  call: PreparedCall,
  facts: CallFacts,
  ctx: DecideContext,
  strategy: ModeStrategy,
): boolean {
  if (PAIRED_TOOLS.has(call.toolName)) return hookApprovesPaired(call, ctx);
  return hookAllowed(ctx) && strategy.hookMayAllow(facts, ctx);
}

/** How far a mod's approval reaches, as a test on the mod and the session. */
const REACH: {
  readonly [R in ModReach]: (mod: ModOutcome, ctx: DecideContext) => boolean;
} = {
  any: () => true,
  // "except where the mod can't bypass your permission prompt tool or Agent SDK permission callback"
  unbypassable: (mod, ctx) => !(mod.policyEnforced && ctx.permissionCallback === true),
  // "With neither managed settings nor a Team or Enterprise /login ... the mod can approve a call that a
  // deny rule refuses or a PreToolUse hook blocked", and is not prompted for an ask rule or a hook ask.
  unenforced: (mod) => !mod.policyEnforced,
  never: () => false,
};

const MOD_DENIAL: Decision = { outcome: 'deny', reason: 'mod' };
const MOD_APPROVAL: Decision = { outcome: 'allow', reason: 'mod' };

/** A mod's refusal stops a call that was going to run; a denial already made stands. */
const BLOCKED: { readonly [O in Decision['outcome']]: (decision: Decision) => Decision } = {
  allow: () => MOD_DENIAL,
  ask: () => MOD_DENIAL,
  classify: () => MOD_DENIAL,
  deny: (decision) => decision,
};

/** A mod's approval lifts what would have stopped or prompted a call; an allow already made stands. */
const APPROVED: { readonly [O in Decision['outcome']]: (decision: Decision) => Decision } = {
  allow: (decision) => decision,
  ask: () => MOD_APPROVAL,
  classify: () => MOD_APPROVAL,
  deny: () => MOD_APPROVAL,
};

/**
 * The decision once a mod that handles `tool.check` has answered: it can block a call, and its
 * approval lifts an outcome as far as `Pending.reach` and the mode allow.
 */
export function applyMod(
  pending: Pending,
  facts: CallFacts,
  ctx: DecideContext,
  strategy: ModeStrategy,
): Decision {
  const { mod } = ctx;
  const { decision, reach } = pending;
  if (mod === undefined) return decision;
  if (mod.blocked === true) return BLOCKED[decision.outcome](decision);
  const lifts = mod.approved && strategy.modMayApprove(facts, ctx) && REACH[reach](mod, ctx);
  return lifts ? APPROVED[decision.outcome](decision) : decision;
}
