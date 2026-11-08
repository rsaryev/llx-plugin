/**
 * Where the docs are silent about the events (spec/judgments.md); none of this counts as
 * compatibility, so none of it is under `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { EVENT_SPECS, createEventRules } from '../../../src/mods/events/index.ts';
import { MOD_EVENT_GROUPS } from '../../../src/protocol/mods-events.ts';
import { fn } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';

describe('the event table', () => {
  test('covers every documented event of the groups this part owns, and no event of the other parts', () => {
    const owned = [
      ...MOD_EVENT_GROUPS.tools,
      ...MOD_EVENT_GROUPS.prompts,
      ...MOD_EVENT_GROUPS.commands.filter((name) => name !== 'settings.read'),
      ...MOD_EVENT_GROUPS.turns,
      ...MOD_EVENT_GROUPS.session,
      ...MOD_EVENT_GROUPS.subagents,
    ];
    expect(Object.keys(EVENT_SPECS).toSorted()).toEqual(owned.toSorted());
  });

  test('an event with no answer but next(e) takes any result; an event of another part is not checked at all', async () => {
    const rules = createEventRules();
    for (const event of [
      'session.start',
      'turn.start',
      'prompt.edit',
      'ui.render',
      'constructor',
    ]) {
      expect(rules.shapeProblem(event, 'anything', false)).toBeUndefined();
    }
    expect(rules.changeProblem('ui.render', {}, { x: 1 })).toBeUndefined();
    expect(rules.coreInput('constructor', {}, 'passed')).toBe('passed');
  });

  test('the wording of a refusal names the event and the field; a changed field names the field', async () => {
    const h = eventHarness();
    h.mod('my-mod', 'user', [fn('tool.check', () => Promise.resolve({ decision: 'maybe' }))]);
    await h.fire('tool.check', { tool: 'Bash', input: {} });
    expect(reasonsOf(h)[0]).toMatch(
      /^returned a result that is refused: tool\.check result: decision: /,
    );
    expect(
      createEventRules().changeProblem(
        'skill.prompt',
        { skill: 'a', text: 't' },
        { skill: 'b', text: 't' },
      ),
    ).toBe('skill.prompt: a hook may change text and frontmatter only, not "skill"');
  });

  test('a field the docs do not name is carried on an event input and on an answer', async () => {
    const h = eventHarness();
    h.mod('my-mod', 'user', [
      fn('tool.describe', () => Promise.resolve({ description: 'd', extra: 1 })),
    ]);
    expect(await h.fire('tool.describe', { description: 'd', somethingNew: true })).toEqual({
      description: 'd',
      extra: 1,
    });
    expect(h.reports).toEqual([]);
  });
});
