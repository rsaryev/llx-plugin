import type { PermissionBehavior } from '../protocol/official.ts';
import type { Assert, Equal } from '../protocol/type-equality.ts';
import { SPECIFIER_MATCHERS, type SpecifierMatchers } from './matchers.ts';
import { matchesCallParam } from './param.ts';
import { ruleFormatOf } from './specifier-formats.ts';
import { toolNameMatches } from './tool-pattern.ts';
import type { MatchContext, PermissionRule, PreparedCall, RuleVerdict } from './types.ts';

/**
 * Whether one rule covers one call. The tool name decides first (equal, or a glob matching it
 * whole). A bare rule then covers every use; a parameter rule looks at the call's input fields;
 * any other specifier goes to the matcher of the tool's rule format (`matchers` defaults to the
 * kit's registry; a host or test passes its own).
 */
export function matchRule(
  rule: PermissionRule,
  call: PreparedCall,
  ctx: MatchContext,
  matchers: SpecifierMatchers = SPECIFIER_MATCHERS,
): boolean {
  if (!toolNameMatches(rule, call.toolName)) return false;
  const { specifier } = rule;
  if (specifier === undefined) return true;
  if (specifier.form === 'param') return matchesCallParam(rule, specifier, call);
  return matchers[ruleFormatOf(call.toolName)](rule, call, ctx);
}

/**
 * The order permissions.md ("Manage permissions") evaluates rules in: "deny, then ask, then
 * allow. The first match in that order determines the outcome, and rule specificity doesn't
 * change the order."
 */
const PRECEDENCE = ['deny', 'ask', 'allow'] as const satisfies readonly PermissionBehavior[];

/** @public A compile-time drift guard: the typecheck fails when the SDK adds a behaviour. */
export type PrecedenceCoversBehaviors = Assert<
  Equal<(typeof PRECEDENCE)[number], PermissionBehavior>
>;

/**
 * What the rules alone say about a call: the first deny rule that matches, else the first ask
 * rule, else the first allow rule, else nothing. A broad deny beats a narrower allow, and an ask
 * beats an allow, however specific.
 */
export function evaluateRules(
  rules: readonly PermissionRule[],
  call: PreparedCall,
  ctx: MatchContext,
  matchers: SpecifierMatchers = SPECIFIER_MATCHERS,
): RuleVerdict {
  for (const behavior of PRECEDENCE) {
    const rule = rules.find(
      (candidate) => candidate.behavior === behavior && matchRule(candidate, call, ctx, matchers),
    );
    if (rule !== undefined) return { behavior, rule };
  }
  return { behavior: undefined };
}
