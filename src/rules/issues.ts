import { warning, type PluginIssue } from '../format/issues.ts';
import type { PermissionBehavior } from '../protocol/official.ts';
import { REMOVED_TOOLS } from '../protocol/tool-names.ts';
import type { PermissionRule } from './types.ts';

type RuleCheck = (rule: PermissionRule, knownTools: ReadonlySet<string>) => readonly PluginIssue[];

/** Only deny and ask rules are checked for a tool they cannot match (permissions.md, "Tool name wildcards"). */
const WARNS_UNKNOWN_TOOL: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};

const removedTools: ReadonlySet<string> = new Set(REMOVED_TOOLS);

/**
 * "A deny or ask rule whose tool name matches no known tool produces a startup warning to catch
 * typos. Tool names containing `_` or `*` are exempt from the check, and so are the names of tools
 * Claude Code has removed, such as `TaskOutput`." A label ("Stop Task") is such a name.
 */
const matchesNoTool: RuleCheck = (rule, knownTools) => {
  const { toolName } = rule.value;
  const exempt =
    !WARNS_UNKNOWN_TOOL[rule.behavior] ||
    toolName.includes('_') ||
    toolName.includes('*') ||
    knownTools.has(toolName) ||
    removedTools.has(toolName);
  return exempt
    ? []
    : [
        warning(
          `permissions.${rule.behavior}`,
          `Permission ${rule.behavior} rule "${rule.text}" matches no known tool — check for typos.`,
        ),
      ];
};

/** Every check of a rule that is a startup warning rather than a reason to skip it. */
const RULE_CHECKS: readonly RuleCheck[] = [matchesNoTool];

/** The startup warnings of a rule list (errors.md, "Configuration warnings"). */
export function ruleIssues(
  rules: readonly PermissionRule[],
  knownTools: ReadonlySet<string>,
): readonly PluginIssue[] {
  return rules.flatMap((rule) => RULE_CHECKS.flatMap((check) => check(rule, knownTools)));
}
