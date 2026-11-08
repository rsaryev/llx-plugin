import type { PermissionBehavior } from '../../protocol/official.ts';
import type { SpecifierMatcher } from '../matchers.ts';
import type { PreparedCall } from '../types.ts';
import { isTextSpecifier } from '../specifier-guards.ts';
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
 * The names `skillNames` adds to the invoked one. A deny rule sees every other name a skill goes by
 * (its alias, its unqualified name, a synced form); an allow rule sees only "the skill's own name
 * and the name in Claude's invocation" (skills.md, "Restrict Claude's skill access"), the invoked
 * name being the call's `skill` field. The host reports the names in `PreparedCall.skillNames`,
 * the command first; the kit holds no skill catalog. Judgment (spec/judgments.md): an ask rule
 * reads the same names as an allow rule, the docs naming only allow and deny.
 */
const OWN_NAME_ONLY = (names: readonly string[]): readonly string[] => names.slice(0, 1);
const EVERY_NAME = (names: readonly string[]): readonly string[] => names;

const NAMES_SEEN: {
  readonly [B in PermissionBehavior]: (names: readonly string[]) => readonly string[];
} = {
  allow: OWN_NAME_ONLY,
  deny: EVERY_NAME,
  ask: OWN_NAME_ONLY,
};

function namesOf(behavior: PermissionBehavior, call: PreparedCall): readonly string[] {
  const invoked = inputString(call.input, 'skill');
  const own = invoked === undefined ? [] : [invoked];
  return [...own, ...NAMES_SEEN[behavior](call.skillNames ?? [])];
}

export const matchSkillRule: SpecifierMatcher = (rule, call) => {
  const { specifier } = rule;
  if (!isTextSpecifier(specifier)) return false;
  const { pattern } = specifier;
  return namesOf(rule.behavior, call).some((name) => skillCovers(pattern, name));
};
