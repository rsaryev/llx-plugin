/**
 * skills.md § Restrict Claude's skill access (`Skill(name)` exact, `Skill(name *)` prefix with any
 * arguments, the table of what a deny rule also blocks, "an allow rule only against the skill's own
 * name and the name in Claude's invocation", the namespace of synced skills); permissions.md § Match
 * by input parameter (`Skill(skill:<name>)`); tools-reference.md § Tools reference (Skill, rule
 * format "skill name").
 *
 * The table of what a deny rule also blocks and the allow-rule namespace cases are in
 * skill-access.test.ts, one block per row.
 *
 * The kit holds no skill catalog: the other names a skill goes by come from the host in
 * `PreparedCall.skillNames` (spec/judgments.md). Where the docs are silent the test sits outside
 * spec().
 */
import { describe, expect, test } from 'bun:test';
import { evaluateRules, matchRule } from '../../src/rules/index.ts';
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import type { PreparedCall } from '../../src/rules/index.ts';
import { matchContext, parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

/** A Skill call as Claude sends it, with the names the host reports for the skill. */
const skill = (name: string, skillNames?: readonly string[], args?: string): PreparedCall => ({
  toolName: 'Skill',
  input: args === undefined ? { skill: name } : { skill: name, args },
  ...(skillNames === undefined ? {} : { skillNames }),
});

const matches = (rule: string, behavior: PermissionBehavior, target: PreparedCall): boolean =>
  matchRule(parsed(rule, behavior), target, matchContext);

const BEHAVIORS = ['allow', 'ask', 'deny'] as const;

spec('tools.tool.Skill', () => {
  test('Skill(commit) is an exact match', () => {
    for (const behavior of BEHAVIORS) {
      expect(matches('Skill(commit)', behavior, skill('commit'))).toBe(true);
      expect(matches('Skill(commit)', behavior, skill('commit-all'))).toBe(false);
      expect(matches('Skill(commit)', behavior, skill('com'))).toBe(false);
      expect(matches('Skill(commit)', behavior, skill('review-pr'))).toBe(false);
    }
  });

  test('Skill(name *) is a prefix match with any arguments', () => {
    for (const behavior of BEHAVIORS) {
      expect(matches('Skill(review-pr *)', behavior, skill('review-pr'))).toBe(true);
      expect(
        matches('Skill(review-pr *)', behavior, skill('review-pr', undefined, '123 --fast')),
      ).toBe(true);
      expect(matches('Skill(deploy *)', behavior, skill('deploy', undefined, 'prod'))).toBe(true);
      expect(matches('Skill(deploy *)', behavior, skill('deployment'))).toBe(false);
      expect(matches('Skill(deploy *)', behavior, skill('commit'))).toBe(false);
    }
  });

  test('the documented allow list approves only the named skills', () => {
    const rules = [parsed('Skill(commit)', 'allow'), parsed('Skill(review-pr *)', 'allow')];
    const verdict = (target: PreparedCall) => evaluateRules(rules, target, matchContext).behavior;
    expect(verdict(skill('commit'))).toBe('allow');
    expect(verdict(skill('review-pr', undefined, '42'))).toBe('allow');
    expect(verdict(skill('deploy'))).toBe(undefined);
  });

  test('a bare Skill rule covers every skill: denying it disables all skills', () => {
    expect(matches('Skill', 'deny', skill('anything'))).toBe(true);
    expect(matches('Skill', 'deny', { toolName: 'Skill', input: {} })).toBe(true);
  });

  test('a Skill rule never covers another tool', () => {
    expect(matches('Skill(commit)', 'deny', { toolName: 'Bash', input: { skill: 'commit' } })).toBe(
      false,
    );
  });
});

describe('what the docs leave open about Skill rules (spec/judgments.md)', () => {
  test('the exact form ignores arguments: Skill(commit) covers commit called with any', () => {
    for (const behavior of BEHAVIORS) {
      expect(matches('Skill(commit)', behavior, skill('commit', undefined, '-m "x"'))).toBe(true);
    }
  });

  test('a call without a skill name matches no name rule', () => {
    for (const behavior of BEHAVIORS) {
      expect(matches('Skill(commit)', behavior, { toolName: 'Skill', input: {} })).toBe(false);
    }
    expect(
      matches('Skill(commit)', 'deny', {
        toolName: 'Skill',
        input: { skill: 5 },
        skillNames: ['x'],
      }),
    ).toBe(false);
  });

  test('Skill(name *) covers name:... too: a namespace of that name is inside the prefix', () => {
    expect(matches('Skill(anthropic *)', 'allow', skill('anthropic:pdf'))).toBe(true);
    expect(matches('Skill(anthropic *)', 'deny', skill('anthropic:pdf'))).toBe(true);
    expect(matches('Skill(anthropic *)', 'allow', skill('anthropic-skills:pdf'))).toBe(false);
  });

  test('a * that is not the trailing " *" is a literal character', () => {
    expect(matches('Skill(deploy*)', 'deny', skill('deployment'))).toBe(false);
    expect(matches('Skill(deploy*)', 'deny', skill('deploy*'))).toBe(true);
    expect(matches('Skill(dep*oy)', 'deny', skill('deploy'))).toBe(false);
    expect(matches('Skill(a * b)', 'deny', skill('a x b'))).toBe(false);
    expect(matches('Skill(a * b)', 'deny', skill('a * b'))).toBe(true);
    expect(matches('Skill(*)', 'deny', skill('deploy'))).toBe(false);
  });

  test('the name is case-sensitive', () => {
    expect(matches('Skill(Commit)', 'deny', skill('commit'))).toBe(false);
  });
});
