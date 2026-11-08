import type { PermissionMode } from '../../protocol/official.ts';
import type { Decision, DecisionReason, PermissionRule } from '../types.ts';
import { isDroppedInAuto } from './auto-dropped.ts';
import { isAllowRule } from './behavior.ts';
import type { DecideContext } from './context.ts';
import type { CallFacts } from './facts.ts';

const allow = (reason: DecisionReason): Decision => ({ outcome: 'allow', reason });
const ask = (reason: DecisionReason): Decision => ({ outcome: 'ask', reason });
const deny = (reason: DecisionReason): Decision => ({ outcome: 'deny', reason });
const classify = (reason: DecisionReason): Decision => ({ outcome: 'classify', reason });
const classifyThenPrompt = (reason: DecisionReason): Decision => ({
  outcome: 'classify',
  reason,
  thenPrompt: true,
});

/**
 * What differs between the permission modes (permissions.md, "Permission modes"; permission-modes.md),
 * one strategy per mode in a registry typed over `PermissionMode`: a mode added to the SDK fails the
 * typecheck until it has one. The gates that no mode skips (rules, hooks, mods) are in `decide`.
 */
export interface ModeStrategy {
  /** What a would-be prompt becomes: a prompt, or in `dontAsk` a denial. */
  prompt(reason: DecisionReason): Decision;
  /** What a PreToolUse hook's `ask` becomes: a prompt, or in `dontAsk` a denial; auto mode has its own paths. */
  hookAsk(facts: CallFacts): Decision;
  /** "Protected-path writes", per mode (permission-modes.md, "Protected paths"). */
  protectedWrite(ctx: DecideContext): Decision;
  /** "Critical-path removals in each permission mode". */
  criticalRemoval(ctx: DecideContext): Decision;
  /** A read from a network path (permissions.md, "Network paths"). */
  networkRead(ctx: DecideContext): Decision;
  /** What a call gets when no rule, hook or read-only status settles it. */
  baseline(facts: CallFacts, ctx: DecideContext): Decision;
  /** Whether a mod's `tool.check` approval can lift an outcome for this call. */
  modMayApprove(facts: CallFacts, ctx: DecideContext): boolean;
  /** Whether a PreToolUse hook's allow can skip the prompt for this call. */
  hookMayAllow(facts: CallFacts, ctx: DecideContext): boolean;
  /** The rules in force in this mode. */
  rules(rules: readonly PermissionRule[], ctx: DecideContext): readonly PermissionRule[];
}

/** Manual mode: reads in scope only; everything else asks. The other modes change what they must. */
const PROMPTING: ModeStrategy = {
  prompt: ask,
  hookAsk: () => ask('hook'),
  protectedWrite: () => ask('protected-path'),
  criticalRemoval: () => ask('critical-path'),
  networkRead: () => ask('network-path'),
  baseline: () => ask('default-prompt'),
  modMayApprove: () => true,
  hookMayAllow: () => true,
  rules: (rules) => rules,
};

/**
 * A hook's `ask` in auto mode "normally sends the tool call to the permission prompt, and the
 * classifier doesn't decide it". Two paths differ (hooks.md, "PreToolUse `ask` decisions in auto
 * mode"): a call Claude Code's own checks flag too, a protected-path write or a command that asks to
 * run outside the sandbox, which the classifier reviews first ("can deny one of these calls before
 * any prompt appears. If it approves, the call normally still goes to the prompt"); and
 * `SubagentHandback`, which no prompt guards ("the call runs even if the classifier objects").
 */
const autoHookAsk = (facts: CallFacts): Decision => {
  if (facts.handback) return allow('no-permission-required');
  return facts.protectedWrite || facts.unsandboxed ? classifyThenPrompt('hook') : ask('hook');
};

/** "Interactive terminal sessions with bypass permissions available": plan mode's blocks are not enforced. */
const bypassInPlan = (ctx: DecideContext): boolean => ctx.bypassAvailable && ctx.interactive;

/** Auto mode available with `useAutoModeDuringPlan` on, "which it is by default". */
const autoInPlan = (ctx: DecideContext): boolean =>
  ctx.autoAvailable && ctx.useAutoModeDuringPlan !== false;

/** In auto mode a removal asks at a terminal and is denied elsewhere. */
const autoRemoval = (ctx: DecideContext): Decision =>
  ctx.interactive ? ask('critical-path') : deny('critical-path');

/**
 * A protected-path write goes to the classifier, except "in a session started with `--restricted`
 * ... the classifier can't approve protected-path writes": then the user is asked.
 */
const classifiedProtectedWrite = (ctx: DecideContext): Decision =>
  ctx.protectedPaths?.restricted === true ? ask('protected-path') : classify('protected-path');

const planProtectedWrite = (ctx: DecideContext): Decision => {
  if (bypassInPlan(ctx)) return allow('mode-plan');
  return autoInPlan(ctx) ? classifiedProtectedWrite(ctx) : ask('protected-path');
};

const planRemoval = (ctx: DecideContext): Decision =>
  autoInPlan(ctx) && !bypassInPlan(ctx) ? autoRemoval(ctx) : ask('critical-path');

const planBaseline = (facts: CallFacts, ctx: DecideContext): Decision => {
  if (bypassInPlan(ctx)) return allow('mode-plan');
  return facts.shell && autoInPlan(ctx) ? classify('mode-plan') : ask('mode-plan');
};

/** Plan mode: "the mod can't approve a call that isn't read-only", nor can a hook's allow. */
const planLifts = (facts: CallFacts, ctx: DecideContext): boolean =>
  facts.readOnly || bypassInPlan(ctx);

export const MODES: { readonly [M in PermissionMode]: ModeStrategy } = {
  default: PROMPTING,
  acceptEdits: {
    ...PROMPTING,
    baseline: (facts) =>
      facts.editsInScope || facts.shellEdits ? allow('accept-edits') : ask('default-prompt'),
  },
  plan: {
    ...PROMPTING,
    protectedWrite: planProtectedWrite,
    criticalRemoval: planRemoval,
    networkRead: (ctx) => (bypassInPlan(ctx) ? allow('mode-plan') : ask('network-path')),
    baseline: planBaseline,
    modMayApprove: planLifts,
    hookMayAllow: planLifts,
  },
  auto: {
    ...PROMPTING,
    hookAsk: autoHookAsk,
    protectedWrite: classifiedProtectedWrite,
    criticalRemoval: autoRemoval,
    baseline: (facts) => {
      if (facts.readsFiles || facts.editsInScope) return allow('mode-auto');
      return facts.escapesViaLink ? ask('default-prompt') : classify('mode-auto');
    },
    rules: (rules, ctx) =>
      rules.filter((rule) => !isDroppedInAuto(rule, ctx.classifyAllShell === true)),
  },
  dontAsk: {
    ...PROMPTING,
    prompt: deny,
    hookAsk: () => deny('hook'),
    protectedWrite: () => deny('protected-path'),
    criticalRemoval: () => deny('critical-path'),
    networkRead: () => deny('network-path'),
    baseline: () => deny('mode-dontask'),
  },
  bypassPermissions: {
    ...PROMPTING,
    protectedWrite: () => allow('mode-bypass'),
    criticalRemoval: (ctx) =>
      ctx.criticalPathPromptOff === true ? allow('mode-bypass') : ask('critical-path'),
    networkRead: () => allow('mode-bypass'),
    baseline: () => allow('mode-bypass'),
    // "Allow rules have no effect in `bypassPermissions`": everything runs without them.
    rules: (rules) => rules.filter((rule) => !isAllowRule(rule)),
  },
};
