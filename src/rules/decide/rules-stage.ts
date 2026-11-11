import type { PermissionBehavior } from '../../protocol/official.ts';
import { evaluateRules, matchRule } from '../evaluate.ts';
import type { PermissionRule, PreparedCall } from '../types.ts';
import { isAllowRule } from './behavior.ts';
import type { DecideContext } from './context.ts';
import type { CallFacts } from './facts.ts';

/**
 * Every subcommand of a compound command must be allowed, "for example because the subcommand
 * matches an allow rule or is a read-only command" (permissions.md, "Compound commands"). The rules
 * may be different ones for different subcommands, so each subcommand is tried on its own against
 * every allow rule.
 */
function everySubcommandAllowed(
  call: PreparedCall,
  rules: readonly PermissionRule[],
  facts: CallFacts,
  ctx: DecideContext,
): boolean {
  const { subcommands, readOnlyParts } = facts.parts;
  // A command of read-only parts alone needs no rule: the read-only gate settles it.
  if (subcommands.length === 0 || readOnlyParts.every(Boolean)) return false;
  const allows = rules.filter(isAllowRule);
  return subcommands.every(
    (subcommand, index) =>
      readOnlyParts[index] === true ||
      allows.some((rule) =>
        matchRule(rule, { toolName: call.toolName, input: { command: subcommand } }, ctx.match),
      ),
  );
}

/**
 * What the rules in force say about a call: deny, then ask, then allow, the first match deciding
 * ("rule specificity doesn't change the order"). An allow also comes from a compound command whose
 * subcommands are each allowed by some allow rule or are read-only.
 */
export function ruleBehavior(
  call: PreparedCall,
  rules: readonly PermissionRule[],
  facts: CallFacts,
  ctx: DecideContext,
): PermissionBehavior | undefined {
  const { behavior } = evaluateRules(rules, call, ctx.match);
  if (behavior !== undefined) return behavior;
  return facts.shell && everySubcommandAllowed(call, rules, facts, ctx) ? 'allow' : undefined;
}
