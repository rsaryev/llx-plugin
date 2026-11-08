import type { PluginIssue } from '../format/issues.ts';
import {
  invalidRuleMessage,
  MALFORMED_RULE,
  splitRule,
  type RuleParts,
} from '../format/permission-rule-shape.ts';
import type { PermissionBehavior } from '../protocol/official.ts';
import type { PermissionRuleValue } from '../protocol/official-tools.ts';
import { isPrimaryField, readParam } from './param.ts';
import { ruleFormatOf, SPECIFIER_SYNTAX } from './specifier-formats.ts';
import { IS_SETTINGS_SOURCE } from './sources.ts';
import { isAnchoredAllowGlob } from './tool-pattern.ts';
import type { PermissionRule, RuleSource, Specifier } from './types.ts';

/** Where a rule was written and what it does: the two things the text cannot say. */
export interface RuleOrigin {
  readonly behavior: PermissionBehavior;
  readonly source: RuleSource;
}

export interface RuleParse {
  /** `undefined` when the rule is skipped or ignored; the issues say why. */
  readonly rule: PermissionRule | undefined;
  readonly issues: readonly PluginIssue[];
}

/** What is wrong with a rule, before it becomes an issue at `permissions.<behavior>`. */
interface Problem {
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

const invalid = (raw: string, reason: string): Problem => ({
  severity: 'error',
  message: invalidRuleMessage(raw, reason),
});

/**
 * Rules a tool name rules out whatever follows it: an MCP rule with parentheses (in a settings
 * file only: the command line and the session read it as a parameter rule, permissions.md "Match
 * by input parameter"), a glob with a specifier.
 */
function checkToolName(parts: RuleParts, at: RuleOrigin, raw: string): Problem | undefined {
  const { toolName, content } = parts;
  const hasSpecifier = content !== undefined;
  if (hasSpecifier && toolName.startsWith('mcp__') && IS_SETTINGS_SOURCE[at.source.kind]) {
    return invalid(
      raw,
      'an mcp__ rule in a settings file cannot have parentheses (to match a parameter of an MCP tool, pass a deny rule with --disallowedTools)',
    );
  }
  if (hasSpecifier && toolName.includes('*')) {
    return invalid(raw, 'a tool-name glob cannot take a specifier');
  }
  if (at.behavior === 'allow' && !isAnchoredAllowGlob(toolName)) {
    return {
      severity: 'warning',
      message: `Permission allow rule "${raw}" was skipped: an allow glob in the tool-name position must follow a literal mcp__<server>__ prefix, so it approves nothing`,
    };
  }
  return undefined;
}

/**
 * Deny and ask rules read `name:value` as an input parameter; "allow rules continue to use each
 * tool's own specifier syntax" (permissions.md, "Match by input parameter").
 */
const READS_PARAMETERS: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};

type Read = { readonly specifier: Specifier | undefined } | { readonly problem: Problem };

/** What the text between the parentheses means for `toolName`. */
function readSpecifier(parts: RuleParts, at: RuleOrigin, raw: string): Read {
  const { toolName, content } = parts;
  if (content === undefined || content.trim() === '') return { specifier: undefined };
  const syntax = SPECIFIER_SYNTAX[ruleFormatOf(toolName)];
  if (syntax.starIsBare && content.trim() === '*') return { specifier: undefined };
  const prefix = /^\s*domain\s*:\s*/.exec(content);
  if (syntax.domainPrefix && prefix !== null) {
    return { specifier: { form: 'domain', pattern: content.slice(prefix[0].length).trim() } };
  }
  const param = READS_PARAMETERS[at.behavior] ? readParam(content, syntax) : undefined;
  if (param === undefined) return { specifier: { form: 'text', pattern: content } };
  if (!isPrimaryField(toolName, param.name)) return { specifier: param };
  return {
    problem: {
      severity: 'warning',
      message: `Permission ${at.behavior} rule "${raw}" is ignored: ${param.name} is the tool's primary content field and a parameter rule on it would be bypassable by a compound command. Use Bash(rm *), Read(./path) or WebFetch(domain:host) instead`,
    },
  };
}

const skip = (at: RuleOrigin, problem: Problem): RuleParse => ({
  rule: undefined,
  issues: [
    { severity: problem.severity, path: `permissions.${at.behavior}`, message: problem.message },
  ],
});

/**
 * Reads one permission rule (permissions.md, "Permission rule syntax"). A rule Claude Code skips or
 * ignores comes back as `rule: undefined` with the issue it reports; nothing throws.
 */
export function parseRule(text: string, at: RuleOrigin): RuleParse {
  const raw = text.trim();
  const parts = splitRule(raw);
  if (parts === undefined) return skip(at, invalid(raw, MALFORMED_RULE));
  const refused = checkToolName(parts, at, raw);
  if (refused !== undefined) return skip(at, refused);
  const read = readSpecifier(parts, at, raw);
  if ('problem' in read) return skip(at, read.problem);
  const { toolName, content } = parts;
  const value: PermissionRuleValue =
    read.specifier === undefined || content === undefined
      ? { toolName }
      : { toolName, ruleContent: content };
  return {
    rule: {
      value,
      behavior: at.behavior,
      source: at.source,
      toolGlob: toolName.includes('*'),
      specifier: read.specifier,
      text: raw,
    },
    issues: [],
  };
}

/** A rule's text, as `parseRule` reads it back to the same value. */
export function formatRule(value: PermissionRuleValue): string {
  return value.ruleContent === undefined || value.ruleContent === ''
    ? value.toolName
    : `${value.toolName}(${value.ruleContent})`;
}
