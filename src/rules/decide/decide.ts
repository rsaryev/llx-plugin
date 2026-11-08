import type { Decision, PreparedCall } from '../types.ts';
import type { PermissionBehavior } from '../../protocol/official.ts';
import type { DecideContext, ModReach, Pending } from './context.ts';
import { factsOf, type CallFacts } from './facts.ts';
import {
  applyMod,
  hookApprovesPaired,
  hookAsks,
  hookSkipsPrompt,
  hookVetoes,
} from './hooks-and-mods.ts';
import { MODES, type ModeStrategy } from './modes.ts';
import { ruleBehavior } from './rules-stage.ts';

/** Everything a gate reads: the call, the session, what the call is, the mode and what the rules say. */
interface Step {
  readonly call: PreparedCall;
  readonly ctx: DecideContext;
  readonly facts: CallFacts;
  readonly strategy: ModeStrategy;
  readonly verdict: PermissionBehavior | undefined;
}

type Gate = (step: Step) => Pending | undefined;

const pending = (decision: Decision, reach: ModReach): Pending => ({ decision, reach });

/**
 * A baseline outcome from the mode is lifted by a mod, except what is put to the host's callback: a
 * prompt (`--permission-prompt-tool` or `canUseTool` "would be asked about") and a classification
 * (permissions.md, "Precedence among rules, hooks, and mods"), which an enforced mod cannot skip.
 */
const BASELINE_REACH: { readonly [O in Decision['outcome']]: ModReach } = {
  allow: 'any',
  ask: 'unbypassable',
  deny: 'any',
  classify: 'unbypassable',
};

/** Where a symlink, not the path as asked, leads to a protected path, a review becomes a prompt. */
const VIA_LINK: { readonly [O in Decision['outcome']]: (decision: Decision) => Decision } = {
  allow: (decision) => decision,
  ask: (decision) => decision,
  deny: (decision) => decision,
  classify: (decision) => ({ outcome: 'ask', reason: decision.reason }),
};

const DENIED: Decision = { outcome: 'deny', reason: 'deny-rule' };

/** Where no one can answer a prompt, an `ask` is a denial; the other outcomes stand. */
const UNANSWERED: { readonly [O in Decision['outcome']]: (decision: Decision) => Decision } = {
  allow: (decision) => decision,
  ask: () => ({ outcome: 'deny', reason: 'prompt-unavailable' }),
  deny: (decision) => decision,
  classify: (decision) => decision,
};

const settle = (decision: Decision, ctx: DecideContext): Decision =>
  ctx.cannotPrompt === true ? UNANSWERED[decision.outcome](decision) : decision;

/** Each gate is one rule of the docs; the first that answers decides, in the order of the docs. */
const GATES: readonly Gate[] = [
  // "The tool never prompts for permission, and PreToolUse hooks don't run for it."
  ({ facts }) =>
    facts.exempt
      ? pending({ outcome: 'allow', reason: 'no-permission-required' }, 'any')
      : undefined,
  // "the file tools refuse reads there ... in every permission mode, including bypassPermissions"
  ({ facts }) =>
    facts.blockedBy === undefined
      ? undefined
      : pending({ outcome: 'deny', reason: facts.blockedBy }, 'never'),
  // "A hook that exits with code 2 stops the tool call before permission rules are evaluated."
  ({ ctx }) =>
    hookVetoes(ctx) ? pending({ outcome: 'deny', reason: 'hook' }, 'unenforced') : undefined,
  // "Deny rules block in every mode, including bypassPermissions."
  ({ verdict }) => (verdict === 'deny' ? pending(DENIED, 'unenforced') : undefined),
  // "Tools matched by an explicit ask rule" are never auto-approved; dontAsk denies them.
  ({ verdict, strategy }) =>
    verdict === 'ask' ? pending(strategy.prompt('ask-rule'), 'unenforced') : undefined,
  // A hook ask prompts, and auto mode "still shows you those prompts".
  ({ ctx, strategy }) =>
    hookAsks(ctx) ? pending(strategy.prompt('hook'), 'unenforced') : undefined,
  // "Recognized `rm` and `rmdir` critical-path removals, which no allow rule or PreToolUse hook allow approves".
  ({ facts, ctx, strategy }) =>
    facts.criticalRemoval ? pending(strategy.criticalRemoval(ctx), 'never') : undefined,
  // "Tools that require user interaction", unless the hook answers with `updatedInput`.
  ({ call, ctx, facts, strategy }) => {
    if (!facts.interaction) return undefined;
    const approved = hookApprovesPaired(call, ctx);
    return pending(
      approved
        ? { outcome: 'allow', reason: 'hook' }
        : strategy.prompt('requires-user-interaction'),
      'never',
    );
  },
  // "Connector tools your organization set to `ask`": no mode, hook or mod approves them.
  ({ facts, strategy }) =>
    facts.connectorAsk ? pending(strategy.prompt('organization-ask'), 'never') : undefined,
  // "A read from a network path prompts you even when an allow rule matches."
  ({ facts, ctx, strategy }) =>
    facts.network ? pending(strategy.networkRead(ctx), 'never') : undefined,
  // "recognized file-reading Bash commands prompt even in auto mode and `bypassPermissions` mode".
  ({ facts, strategy }) =>
    facts.readBlockPrompt
      ? pending(strategy.prompt('outside-working-directory'), 'unenforced')
      : undefined,
  // "The safety check runs before Claude Code evaluates allow rules from settings."
  ({ facts, ctx, strategy }) => {
    if (!facts.protectedWrite) return undefined;
    const decision = strategy.protectedWrite(ctx);
    return pending(
      facts.protectedViaLink ? VIA_LINK[decision.outcome](decision) : decision,
      'never',
    );
  },
  ({ verdict }) =>
    verdict === 'allow' ? pending({ outcome: 'allow', reason: 'allow-rule' }, 'any') : undefined,
  ({ call, ctx, facts, strategy }) =>
    hookSkipsPrompt(call, facts, ctx, strategy)
      ? pending({ outcome: 'allow', reason: 'hook' }, 'any')
      : undefined,
  ({ facts }) =>
    facts.readOnly ? pending({ outcome: 'allow', reason: facts.readReason }, 'any') : undefined,
];

/**
 * Whether a call may run, asks the user, is denied or goes to the host's classifier
 * (permissions.md, "Manage permissions", "Permission modes" and "Extend permissions with hooks";
 * permission-modes.md). Pure over the call and the session: the host supplies the hook outcome, the
 * mod's answer and the session facts in `ctx`, and acts on the answer.
 *
 * The order: a path outside the working directories that the block keys refuse; a hook block; deny
 * rules; ask rules and hook asks; the actions no mode auto-approves (critical-path removals, user
 * interaction, network reads); protected paths; then allow rules, hook allows and read-only calls;
 * then what the mode does with the rest. A mod's answer comes last.
 */
export function decide(call: PreparedCall, ctx: DecideContext): Decision {
  const strategy = MODES[ctx.mode];
  const facts = factsOf(call, ctx);
  const verdict = ruleBehavior(call, strategy.rules(ctx.rules, ctx), facts, ctx);
  const step: Step = { call, ctx, facts, strategy, verdict };
  for (const gate of GATES) {
    const answer = gate(step);
    if (answer !== undefined) return settle(applyMod(answer, facts, ctx, strategy), ctx);
  }
  const baseline = strategy.baseline(facts, ctx);
  const last = pending(baseline, BASELINE_REACH[baseline.outcome]);
  return settle(applyMod(last, facts, ctx, strategy), ctx);
}
