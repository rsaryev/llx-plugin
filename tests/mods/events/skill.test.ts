/**
 * `skill.prompt`. plugins/mods/reference.md § Prompts and what Claude reads and § Source and
 * frontmatter fields on `skill.prompt`. Which skill is expanded when is the host's (the skills part
 * of the kit); `skillPromptEvent` builds the event from what the host knows of the skill.
 */
import { describe, expect, test } from 'bun:test';
import { parseFrontmatter } from '../../../src/format/index.ts';
import { skillPromptEvent } from '../../../src/mods/events/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

const file = '---\nname: review\ndescription: Reviews a diff\n---\nReview $ARGUMENTS';

describe('skill.prompt', () => {
  const event = skillPromptEvent(
    {
      name: 'review',
      source: 'userSettings',
      path: '/home/me/.claude/skills/review/SKILL.md',
      frontmatter: parseFrontmatter(file),
    },
    'Review the diff',
  );

  spec('mods.event.skill.prompt', () => {
    test('the hook reads e.skill and e.text and answers { text }, which Claude reads', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('skill.prompt', (_$, e) => Promise.resolve({ text: `${String(e.text)}\nBe kind.` })),
      ]);
      expect(await h.fire('skill.prompt', event)).toEqual({ text: 'Review the diff\nBe kind.' });
    });

    test('a changed text or frontmatter passed to next: the hooks after it read both and Claude Code reads the final text', async () => {
      const h = eventHarness();
      h.mod('first', 'user', [
        fn('skill.prompt', (_$, e, next) =>
          next({
            ...e,
            text: 'changed',
            frontmatter: { ...record(e.frontmatter), extra: true },
          }),
        ),
      ]);
      const seen: unknown[] = [];
      h.mod('second', 'user', [
        fn('skill.prompt', (_$, e, next) => (seen.push([e.text, e.frontmatter]), next(e))),
      ]);
      await h.fire('skill.prompt', event);
      expect(seen).toEqual([
        ['changed', { name: 'review', description: 'Reviews a diff', extra: true }],
      ]);
      expect(h.coreSeen).toEqual([
        {
          ...event,
          text: 'changed',
          frontmatter: { name: 'review', description: 'Reviews a diff', extra: true },
        },
      ]);
    });

    test('a hook that changes any other field fails: next rejects, the hook is skipped and the text is untouched', async () => {
      for (const field of ['skill', 'source', 'path', 'pluginName']) {
        const h = eventHarness();
        h.mod('my-mod', 'user', [
          fn('skill.prompt', (_$, e, next) => next({ ...e, [field]: 'other' })),
        ]);
        expect(await h.fire('skill.prompt', event)).toEqual({ core: event });
        expect(reasonsOf(h)[0]).toContain(`not "${field}"`);
      }
    });

    test('an answer whose text is not a string fails the hook', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('skill.prompt', () => Promise.resolve({ text: ['x'] }))]);
      expect(await h.fire('skill.prompt', event)).toEqual({ core: event });
      expect(reasonsOf(h)).toHaveLength(1);
    });
  });
});

describe('the fields of a skill.prompt event', () => {
  const at = '/repo/.claude/skills/review/SKILL.md';

  spec('mods.skillPrompt.e.source', () => {
    test('is who provides the skill: the settings sources for the enterprise, personal and project locations, a word such as plugin, mcp, syncedSkills or built-in for the others', () => {
      for (const source of [
        'policySettings',
        'userSettings',
        'projectSettings',
        'plugin',
        'mcp',
        'syncedSkills',
        'built-in',
      ]) {
        expect(skillPromptEvent({ name: 's', source }, 't').source).toBe(source);
      }
    });
  });

  spec('mods.skillPrompt.e.pluginName', () => {
    test("is the plugin's name for a skill whose source is plugin, and absent for any other", () => {
      expect(
        skillPromptEvent({ name: 's', source: 'plugin', pluginName: 'acme' }, 't').pluginName,
      ).toBe('acme');
      expect(
        skillPromptEvent({ name: 's', source: 'projectSettings', pluginName: 'acme' }, 't'),
      ).not.toHaveProperty('pluginName');
    });
  });

  spec('mods.skillPrompt.e.path', () => {
    test("is the absolute path of the skill's file; absent when the skill has no file on this machine, as a built-in skill", () => {
      expect(skillPromptEvent({ name: 's', source: 'projectSettings', path: at }, 't').path).toBe(
        at,
      );
      expect(skillPromptEvent({ name: 's', source: 'built-in' }, 't')).not.toHaveProperty('path');
    });
  });

  spec('mods.skillPrompt.e.frontmatter', () => {
    test("is the frontmatter of the skill's file as plain data", () => {
      const e = skillPromptEvent(
        {
          name: 's',
          source: 'projectSettings',
          path: at,
          frontmatter: parseFrontmatter(
            '---\nname: s\nallowed-tools: [Read, Grep]\nflags:\n  fast: true\n---\nBody',
          ),
        },
        't',
      );
      expect(e.frontmatter).toEqual({
        name: 's',
        'allowed-tools': ['Read', 'Grep'],
        flags: { fast: true },
      });
      expect(JSON.parse(JSON.stringify(e.frontmatter))).toEqual(e.frontmatter);
    });

    test('is an empty table for a skill with no frontmatter or no file', () => {
      expect(skillPromptEvent({ name: 's', source: 'built-in' }, 't').frontmatter).toEqual({});
      expect(
        skillPromptEvent(
          { name: 's', source: 'x', frontmatter: parseFrontmatter('Just a body') },
          't',
        ).frontmatter,
      ).toEqual({});
    });
  });

  spec('mods.skillPrompt.e.frontmatterProblem', () => {
    test('is the reason frontmatter is missing the file frontmatter, as "is a list or a single value, not a table"', () => {
      const e = skillPromptEvent(
        {
          name: 's',
          source: 'x',
          path: at,
          frontmatter: parseFrontmatter('---\n- a\n- b\n---\nBody'),
        },
        't',
      );
      expect(e.frontmatter).toEqual({});
      expect(e.frontmatterProblem).toBe('is a list or a single value, not a table');
    });

    test('is absent when frontmatter holds the whole frontmatter, and when the skill has none', () => {
      expect(
        skillPromptEvent(
          { name: 's', source: 'x', frontmatter: parseFrontmatter('---\nname: s\n---\nB') },
          't',
        ),
      ).not.toHaveProperty('frontmatterProblem');
      expect(
        skillPromptEvent({ name: 's', source: 'x', frontmatter: parseFrontmatter('B') }, 't'),
      ).not.toHaveProperty('frontmatterProblem');
      expect(skillPromptEvent({ name: 's', source: 'built-in' }, 't')).not.toHaveProperty(
        'frontmatterProblem',
      );
    });
  });
});
