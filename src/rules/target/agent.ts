import type { SpecifierMatcher } from '../matchers.ts';
import { inputString } from './input.ts';

/**
 * `Agent(AgentName)` (permissions.md, "Agent (subagents)"): the rule's text is the subagent's name
 * and is compared with the call's `subagent_type`. The comparison is exact and case-sensitive, and a
 * call that leaves `subagent_type` out matches no name (spec/judgments.md).
 */
export const matchAgentRule: SpecifierMatcher = (rule, call) => {
  const { specifier } = rule;
  if (specifier?.form !== 'text') return false;
  const type = inputString(call.input, 'subagent_type');
  return type !== undefined && type === specifier.pattern;
};
