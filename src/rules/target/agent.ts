import type { PermissionBehavior } from '../../protocol/official.ts';
import type { SpecifierMatcher } from '../matchers.ts';
import { isTextSpecifier } from '../specifier-guards.ts';
import { inputString } from './input.ts';

/**
 * `Agent(AgentName)` (permissions.md, "Agent (subagents)"): the rule's text is the subagent's name
 * and is compared with the call's `subagent_type`. The comparison is exact and case-sensitive. A
 * fork is the call whose `subagent_type` is `fork` (the SDK's `AgentInput` names it so), which
 * `Agent(fork)` stops (sub-agents.md, "Turn fork mode off"). A call that leaves `subagent_type` out
 * is `general-purpose` for a deny or ask rule and no name for an allow rule (spec/judgments.md).
 */

/** The subagent a call without `subagent_type` falls back to (sub-agents.md, "Built-in subagents"). */
const FALLBACK_SUBAGENT = 'general-purpose';

/**
 * What an omitted `subagent_type` counts as, per behaviour, on the safe side: a deny or ask rule for
 * `general-purpose` still covers the call, which runs as that subagent; an allow rule approves
 * nothing it cannot see named. A session with no `general-purpose` fails the call, so the cover
 * costs nothing there.
 */
const NAME_WHEN_OMITTED: { readonly [B in PermissionBehavior]: string | undefined } = {
  allow: undefined,
  deny: FALLBACK_SUBAGENT,
  ask: FALLBACK_SUBAGENT,
};

export const matchAgentRule: SpecifierMatcher = (rule, call) => {
  const { specifier } = rule;
  if (!isTextSpecifier(specifier)) return false;
  const type = inputString(call.input, 'subagent_type') ?? NAME_WHEN_OMITTED[rule.behavior];
  return type !== undefined && type === specifier.pattern;
};
