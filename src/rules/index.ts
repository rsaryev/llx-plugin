/** Permission rules (the syntax of `Tool(specifier)`, matching, the deny, ask, allow order) and the hook matcher grammar. */
export { requiresPromptDespitePrefixRule } from './bash/exec-wrappers.ts';
export { evaluateIf, type IfResult } from './bash/if-eval.ts';
export { splitCommand, type SplitCommand } from './bash/split.ts';
export { matchBashPattern } from './bash/wildcard.ts';
export { matchCdRule, type CdTarget } from './path/cd.ts';
export { isNetworkPath, readsNetworkPath } from './path/network.ts';
export { prepareCall, resolveRuleDirectories } from './path/symlink.ts';
export type { PathResolver } from '../ports/path-resolver.ts';
export { matchDomainPattern, sandboxDomainEntry, sandboxDomainLists } from './target/domain.ts';
export type { SandboxDomainEntry, SandboxList } from './target/domain.ts';
export {
  mcpToolName,
  mcpToolRuleMatches,
  normalizeMcpServerName,
  pluginMcpServerName,
} from './target/mcp.ts';
export { stripWrappers } from './bash/wrappers.ts';
export { evaluateRules, matchRule } from './evaluate.ts';
export { matchesMatcher } from './hook-matcher.ts';
export { ruleIssues } from './issues.ts';
export type { SpecifierMatcher, SpecifierMatchers } from './matchers.ts';
export { formatRule, parseRule, type RuleOrigin, type RuleParse } from './parse.ts';
export { RULE_FORMATS, type RuleFormatId } from './specifier-formats.ts';
export type {
  Decision,
  DecisionReason,
  MatchContext,
  PathContext,
  PermissionRule,
  PreparedCall,
  RuleSource,
  RuleVerdict,
  Specifier,
  ToolCall,
} from './types.ts';
