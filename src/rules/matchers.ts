import type { PermissionBehavior } from '../protocol/official.ts';
import { matchBashRule } from './bash/bash.ts';
import { matchPowerShellRule } from './bash/powershell.ts';
import { matchFileRule } from './path/file-rules.ts';
import { matchAgentRule } from './target/agent.ts';
import { matchWebFetchRule } from './target/domain.ts';
import { matchSkillRule } from './target/skill.ts';
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

/**
 * What an unwritten matcher answers, per behaviour: it fails on the safe side. An allow rule that
 * matches nothing approves nothing; a deny or ask rule that matched nothing would let the call
 * through unchecked, so it covers every call of its tool until the real matcher exists.
 */
const COVERS_WHEN_UNWRITTEN: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};

/** The placeholder of a format whose matcher is not written yet. */
const failsClosed: SpecifierMatcher = (rule) => COVERS_WHEN_UNWRITTEN[rule.behavior];

export const SPECIFIER_MATCHERS: SpecifierMatchers = {
  command: matchBashRule,
  'powershell-command': matchPowerShellRule,
  'read-path': matchFileRule,
  'edit-path': matchFileRule,
  'skill-name': matchSkillRule,
  'subagent-type': matchAgentRule,
  domain: matchWebFetchRule,
  bare: failsClosed,
};
