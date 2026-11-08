/**
 * How a tool reads what follows its name inside the parentheses of a rule: the "Rule format" table
 * of tools-reference.md ("Configure tools with permission rules and hooks"). One id per format;
 * every part that differs per format (matching, syntax details) is a registry typed over
 * `RuleFormatId`, so a format added here fails the typecheck until each registry handles it. Which
 * tool uses which format is the catalog's `ruleFormat` (`catalog.ts`).
 */
export const RULE_FORMATS = [
  'command',
  'powershell-command',
  'read-path',
  'edit-path',
  'skill-name',
  'subagent-type',
  'domain',
  'bare',
] as const;

export type RuleFormatId = (typeof RULE_FORMATS)[number];
