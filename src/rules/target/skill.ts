import type { PermissionBehavior } from '../../protocol/official.ts';
import type { SpecifierMatcher } from '../matchers.ts';
import type { PreparedCall } from '../types.ts';
import { inputString } from './input.ts';

/**
 * `Skill(name)` and `Skill(name *)` (skills.md, "Restrict Claude's skill access"): `Skill(name)` is
 * an exact match and `Skill(name *)` a prefix match with any arguments. The prefix is a whole name
 * or a namespace: `Skill(anthropic-skills *)` covers `anthropic-skills:pdf` and `Skill(anthropic *)`
 * does not, "because a prefix outside the namespace doesn't match the names inside it".
 */

const ANY_ARGUMENTS = ' *';
const NAMESPACE_SEPARATOR = ':';

function skillCovers(pattern: string, name: string): boolean {
  if (!pattern.endsWith(ANY_ARGUMENTS)) return pattern === name;
  const prefix = pattern.slice(0, -ANY_ARGUMENTS.length);
  return name === prefix || name.startsWith(`${prefix}${NAMESPACE_SEPARATOR}`);
}

/**
 * Only a deny rule sees the other names a skill goes by (its alias, its unqualified name, a synced
 * form): "Claude Code matches an allow rule only against the skill's own name and the name in
 * Claude's invocation", which is the call's `skill` field. The host reports the other names in
 * `PreparedCall.skillNames`; the kit holds no skill catalog (spec/judgments.md).
 */
const SEES_OTHER_NAMES: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: false,
};

function namesOf(behavior: PermissionBehavior, call: PreparedCall): readonly string[] {
  const invoked = inputString(call.input, 'skill');
  const own = invoked === undefined ? [] : [invoked];
  return SEES_OTHER_NAMES[behavior] ? [...own, ...(call.skillNames ?? [])] : own;
}

export const matchSkillRule: SpecifierMatcher = (rule, call) => {
  const { specifier } = rule;
  if (specifier?.form !== 'text') return false;
  const { pattern } = specifier;
  return namesOf(rule.behavior, call).some((name) => skillCovers(pattern, name));
};
