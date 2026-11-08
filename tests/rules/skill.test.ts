/**
 * skills.md § Restrict Claude's skill access (`Skill(name)` exact, `Skill(name *)` prefix with any
 * arguments, the table of what a deny rule also blocks, "an allow rule only against the skill's own
 * name and the name in Claude's invocation", the namespace of synced skills); permissions.md § Match
 * by input parameter (`Skill(skill:<name>)`); tools-reference.md § Tools reference (Skill, rule
 * format "skill name").
 *
 * The table of what a deny rule also blocks and the allow-rule namespace cases are documented
 * behaviour with no requirement id of their own, so they sit under the nearest one, `tools.tool.Skill`.
 *
 * The kit holds no skill catalog: the other names a skill goes by come from the host in
 * `PreparedCall.skillNames` (spec/judgments.md). Where the docs are silent the test sits outside
 * spec().
 */
import { describe, expect, test } from 'bun:test';
import { evaluateRules, matchRule, parseRule } from '../../src/rules/index.ts';
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

spec('tools.tool.Skill', () => {
  describe("what a deny rule also blocks (skills.md § Restrict Claude's skill access, the table)", () => {
    test('an alias: Skill(review) blocks the bundled /code-review through its /review alias', () => {
      const names = ['code-review', 'review'];
      expect(matches('Skill(review)', 'deny', skill('code-review', names))).toBe(true);
      expect(matches('Skill(review)', 'deny', skill('code-review'))).toBe(false);
    });

    test('an unqualified name: Skill(deploy) blocks a nested skill listed as apps/web:deploy', () => {
      expect(
        matches('Skill(deploy)', 'deny', skill('apps/web:deploy', ['apps/web:deploy', 'deploy'])),
      ).toBe(true);
      expect(
        matches('Skill(deploy)', 'deny', skill('apps/web:other', ['apps/web:other', 'other'])),
      ).toBe(false);
    });

    test('a synced skill: Skill(anthropic-skills:deploy) and Skill(deploy:deploy) block it', () => {
      const names = ['deploy', 'anthropic-skills:deploy', 'deploy:deploy'];
      expect(matches('Skill(anthropic-skills:deploy)', 'deny', skill('deploy:deploy', names))).toBe(
        true,
      );
      expect(matches('Skill(deploy:deploy)', 'deny', skill('deploy', names))).toBe(true);
    });

    test('the plugin form is a name, not a parameter rule on a field called deploy', () => {
      const { rule, issues } = parseRule('Skill(deploy:deploy)', {
        behavior: 'deny',
        source: { kind: 'user' },
      });
      expect(issues).toEqual([]);
      expect(rule?.specifier).toEqual({ form: 'text', pattern: 'deploy:deploy' });
      expect(matches('Skill(deploy:deploy)', 'deny', skill('deploy:deploy'))).toBe(true);
    });

    test('the parameter form Skill(skill:deploy) blocks the skill whichever name Claude calls it by', () => {
      const names = ['deploy', 'ship'];
      expect(matches('Skill(skill:deploy)', 'deny', skill('ship', names))).toBe(true);
      expect(matches('Skill(skill:deploy)', 'deny', skill('deploy', names))).toBe(true);
      expect(matches('Skill(skill:deploy)', 'deny', skill('other', ['other']))).toBe(false);
    });

    test('a prefix rule also reaches the other names: Skill(review *) blocks the alias with arguments', () => {
      expect(
        matches('Skill(review *)', 'deny', skill('code-review', ['code-review', 'review'], '1')),
      ).toBe(true);
    });
  });

  describe("what an allow rule matches (skills.md § Restrict Claude's skill access)", () => {
    test('only the name in the invocation: names the host lists for a deny rule are not seen', () => {
      const names = ['deploy', 'anthropic-skills:deploy'];
      expect(matches('Skill(anthropic-skills:deploy)', 'allow', skill('deploy', names))).toBe(
        false,
      );
      expect(
        matches('Skill(anthropic-skills:deploy)', 'allow', skill('anthropic-skills:deploy', names)),
      ).toBe(true);
      expect(
        matches('Skill(deploy)', 'allow', skill('apps/web:deploy', ['apps/web:deploy', 'deploy'])),
      ).toBe(false);
    });

    test('an ask rule reads the invocation like an allow rule', () => {
      expect(matches('Skill(review)', 'ask', skill('code-review', ['code-review', 'review']))).toBe(
        false,
      );
      expect(matches('Skill(review)', 'ask', skill('review'))).toBe(true);
    });

    test('Skill(anthropic-skills:pdf) approves the synced pdf skill', () => {
      expect(matches('Skill(anthropic-skills:pdf)', 'allow', skill('anthropic-skills:pdf'))).toBe(
        true,
      );
      expect(matches('Skill(anthropic-skills:pdf)', 'allow', skill('anthropic-skills:docx'))).toBe(
        false,
      );
    });

    test('Skill(anthropic-skills *) approves every synced skill', () => {
      for (const name of ['anthropic-skills:pdf', 'anthropic-skills:docx', 'anthropic-skills']) {
        expect([name, matches('Skill(anthropic-skills *)', 'allow', skill(name))]).toEqual([
          name,
          true,
        ]);
      }
      expect(matches('Skill(anthropic-skills *)', 'allow', skill('pdf'))).toBe(false);
    });

    test('Skill(anthropic *) does not cover anthropic-skills:pdf: a prefix outside the namespace', () => {
      expect(matches('Skill(anthropic *)', 'allow', skill('anthropic-skills:pdf'))).toBe(false);
      expect(matches('Skill(anthropic *)', 'allow', skill('anthropic'))).toBe(true);
    });
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
