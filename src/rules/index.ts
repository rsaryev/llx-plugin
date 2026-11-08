/** Permission rules: the syntax of `Tool(specifier)`, matching, and the deny, ask, allow order. */
export { requiresPromptDespitePrefixRule } from './bash/exec-wrappers.ts';
export { evaluateIf, type IfResult } from './bash/if-eval.ts';
export { splitCommand, type SplitCommand } from './bash/split.ts';
export { matchBashPattern } from './bash/wildcard.ts';
export { stripWrappers } from './bash/wrappers.ts';
export { evaluateRules, matchRule } from './evaluate.ts';
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
