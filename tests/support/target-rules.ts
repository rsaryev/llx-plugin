import type { PermissionBehavior } from '../../src/protocol/official.ts';
import { matchRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from './rule-context.ts';

/** Whether `ruleText`, written as `behavior`, covers a call of `toolName` with `input`. */
export const covers = (
  behavior: PermissionBehavior,
  ruleText: string,
  toolName: string,
  input: unknown,
): boolean => matchRule(parsed(ruleText, behavior), call(toolName, input), matchContext);

/** Whether a rule on `WebFetch` covers a fetch of `url`. */
export const fetchCovered = (
  ruleText: string,
  url: string,
  behavior: PermissionBehavior = 'deny',
): boolean => covers(behavior, ruleText, 'WebFetch', { url, prompt: 'summarise' });
