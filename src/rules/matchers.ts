import type { RuleFormatId } from './specifier-formats.ts';
import type { MatchContext, PermissionRule, PreparedCall } from './types.ts';

/**
 * Matches the text or domain specifier of one rule against one call. A rule reaches its matcher
 * only after its tool name matched and it is neither bare nor a parameter rule, so the matcher
 * reads `rule.specifier` and the call's input, and decides by `rule.behavior` where the docs
 * differ (an allow rule needs every Bash subcommand covered, a deny or ask rule any).
 */
export type SpecifierMatcher = (
  rule: PermissionRule,
  call: PreparedCall,
  ctx: MatchContext,
) => boolean;

export type SpecifierMatchers = { readonly [F in RuleFormatId]: SpecifierMatcher };

/** Matches nothing: the placeholder of a format whose matcher is not written yet. */
const matchesNothing: SpecifierMatcher = () => false;

/**
 * The matcher of each rule format. The command, path, skill, agent and domain matchers are the
 * business of the sub-packages that implement them; each replaces its entry here. A format with no
 * matcher matches nothing, which is the safe side for an allow rule and, until the matcher exists,
 * the unsafe one for a deny rule.
 */
export const SPECIFIER_MATCHERS: SpecifierMatchers = {
  command: matchesNothing,
  'powershell-command': matchesNothing,
  'read-path': matchesNothing,
  'edit-path': matchesNothing,
  'skill-name': matchesNothing,
  'subagent-type': matchesNothing,
  domain: matchesNothing,
  bare: matchesNothing,
};
