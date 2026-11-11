/**
 * hooks.md § Limits on skill hooks: "each source of skills has its own limit per session. Your
 * project, your personal skills folder, and each plugin count as separate sources. The skills from
 * one source can register at most 1,024 hooks. Those hooks' matchers can total at most 16,384
 * characters. A matcher with several hooks under it counts once for each hook." Both totals "build
 * up skill by skill", and a skill past a limit "registers none of its hooks".
 */
import { describe, expect, test } from 'bun:test';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import {
  admitSkillHooks,
  countSkillHooks,
  hookSourceOf,
  NO_HOOKS_YET,
  SKILL_HOOK_LIMITS,
} from '../../src/skills/hook-limits.ts';
import { spec } from '../support/spec.ts';

const command = { type: 'command', command: './check.sh' } as const;

/** `count` handlers under one group whose matcher is `matcher`. */
const group = (matcher: string | undefined, count: number): HooksSettings => ({
  PreToolUse: [
    {
      ...(matcher === undefined ? {} : { matcher }),
      hooks: Array.from({ length: count }, () => command),
    },
  ],
});

spec('skills.frontmatter.hooks', () => {
  describe('counting', () => {
    test("one hook, one matcher: the hook and the matcher's characters", () => {
      expect(countSkillHooks(group('Bash', 1))).toEqual({ hooks: 1, matcherChars: 4 });
    });

    test('"A matcher with several hooks under it counts once for each hook"', () => {
      expect(countSkillHooks(group('Edit|Write', 3))).toEqual({ hooks: 3, matcherChars: 30 });
    });

    test('a group with no matcher adds hooks but no characters', () => {
      expect(countSkillHooks(group(undefined, 2))).toEqual({ hooks: 2, matcherChars: 0 });
    });

    test('every event and group adds up', () => {
      const hooks: HooksSettings = {
        ...group('Bash', 1),
        PostToolUse: [{ matcher: 'Edit', hooks: [command, command] }],
        Stop: [{ hooks: [command] }],
      };
      expect(countSkillHooks(hooks)).toEqual({ hooks: 4, matcherChars: 4 + 8 });
    });

    test('judgment: characters are code points, not UTF-16 units', () => {
      expect(countSkillHooks(group('\u{1F600}', 1))).toEqual({ hooks: 1, matcherChars: 1 });
    });

    test('the limits are the documented ones', () => {
      expect(SKILL_HOOK_LIMITS).toEqual({ hooks: 1024, matcherChars: 16_384 });
    });
  });

  describe('admitting one skill after another from one source', () => {
    test('the totals build up skill by skill', () => {
      const first = admitSkillHooks(NO_HOOKS_YET, group('Bash', 2));
      expect(first).toEqual({ admitted: true, used: { hooks: 2, matcherChars: 8 } });
      const second = admitSkillHooks(first.used, group('Edit', 1));
      expect(second).toEqual({ admitted: true, used: { hooks: 3, matcherChars: 12 } });
    });

    test('"at most 1,024 hooks": 1,024 fit, one more does not', () => {
      const full = admitSkillHooks(NO_HOOKS_YET, group(undefined, 1024));
      expect(full.admitted).toBe(true);
      const over = admitSkillHooks(full.used, group(undefined, 1));
      expect(over.admitted).toBe(false);
    });

    test('"at most 16,384 characters": the matchers\' total, counted per hook', () => {
      const edge = admitSkillHooks(NO_HOOKS_YET, group('x'.repeat(16_384), 1));
      expect(edge.admitted).toBe(true);
      expect(admitSkillHooks(edge.used, group('y', 1)).admitted).toBe(false);
      expect(admitSkillHooks(NO_HOOKS_YET, group('x'.repeat(8_193), 2)).admitted).toBe(false);
    });

    test('a skill past a limit "registers none of its hooks" and adds nothing to the totals', () => {
      const used = { hooks: 1_000, matcherChars: 0 };
      const refused = admitSkillHooks(used, group(undefined, 30));
      expect(refused).toEqual({ admitted: false, used });
    });

    test('a later, smaller skill still fits after one was refused', () => {
      const used = { hooks: 1_000, matcherChars: 0 };
      const refused = admitSkillHooks(used, group(undefined, 30));
      expect(admitSkillHooks(refused.used, group(undefined, 24)).admitted).toBe(true);
    });
  });

  describe('sources', () => {
    test('"Your project, your personal skills folder, and each plugin count as separate sources"', () => {
      const sources = [
        hookSourceOf({ kind: 'project' }),
        hookSourceOf({ kind: 'user' }),
        hookSourceOf({ kind: 'plugin', plugin: 'a' }),
        hookSourceOf({ kind: 'plugin', plugin: 'b' }),
      ];
      expect(new Set(sources).size).toBe(4);
    });

    test('two skills of one plugin share a source, and the root skill is the same plugin', () => {
      expect(hookSourceOf({ kind: 'plugin', plugin: 'a' })).toBe(
        hookSourceOf({ kind: 'plugin', plugin: 'a', rootSkill: true }),
      );
    });
  });
});
