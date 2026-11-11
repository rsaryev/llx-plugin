import type { PermissionBehavior } from '../../src/protocol/official.ts';
import { matchRule, type MatchContext } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from './rule-context.ts';

/** Whether the rule `ruleText`, written as `behavior`, covers `command` run through `toolName`. */
export function covers(
  behavior: PermissionBehavior,
  ruleText: string,
  command: string,
  options: { readonly toolName?: string; readonly ctx?: MatchContext } = {},
): boolean {
  const { toolName = 'Bash', ctx = matchContext } = options;
  return matchRule(parsed(ruleText, behavior), call(toolName, { command }), ctx);
}

/** The same rule written as an allow rule: every subcommand must match it. */
export const allows = (
  ruleText: string,
  command: string,
  ctx: MatchContext = matchContext,
): boolean => covers('allow', ruleText, command, { ctx });

/** The same rule written as a deny rule: any subcommand matching it is enough. */
export const denies = (
  ruleText: string,
  command: string,
  ctx: MatchContext = matchContext,
): boolean => covers('deny', ruleText, command, { ctx });

/** The same rule written as an ask rule: any subcommand matching it is enough. */
export const asks = (
  ruleText: string,
  command: string,
  ctx: MatchContext = matchContext,
): boolean => covers('ask', ruleText, command, { ctx });
