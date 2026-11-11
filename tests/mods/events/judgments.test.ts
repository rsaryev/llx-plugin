/**
 * Where the docs are silent about the events (spec/judgments.md); none of this counts as
 * compatibility, so none of it is under `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { EVENT_SPECS, EVENT_RULES, eventInputProblem } from '../../../src/mods/events/index.ts';
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
      // The engine event the declarations add (claude-code/index.d.ts:4416).
      'prompt.change',
    ];
    expect(Object.keys(EVENT_SPECS).toSorted()).toEqual(owned.toSorted());
  });

  test('an event with no answer but next(e) takes any result; an event of another part is not checked at all', async () => {
    for (const event of ['session.start', 'turn.start', 'prompt.edit']) {
      expect(EVENT_RULES[event]?.shapeProblem?.('anything', false, {})).toBeUndefined();
    }
    for (const event of ['ui.render', 'constructor'])
      expect(Object.hasOwn(EVENT_RULES, event)).toBe(false);
  });

  test('the wording of a refusal names the event and the field; a changed field names the field', async () => {
    const h = eventHarness();
    h.mod('my-mod', 'user', [fn('tool.check', () => Promise.resolve({ decision: 'maybe' }))]);
    await h.fire('tool.check', { tool: 'Bash', input: {} });
    expect(reasonsOf(h)[0]).toMatch(/^returned the wrong shape \(tool\.check result: decision: /);
    expect(
      EVENT_RULES['skill.prompt']?.changeProblem?.(
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

describe("eventInputProblem (the kit's own helper: no chain rule calls it, the host may)", () => {
  const check = { tool: 'Bash', input: { command: 'ls' } };
  const fits: readonly (readonly [string, unknown])[] = [
    ['tool.call', { tool: 'Bash', command: 'ls' }],
    ['tool.check', { ...check, agentId: 'agent-1', ceiling: 'ask', isReadOnly: true }],
    ['agent.spawn', { agent: 'reviewer', isTeammate: true, resume: { agentId: 'agent-1' } }],
    ['session.end', { reason: 'prompt_input_exit' }],
    ['session.receive', { text: 'x', origin: { kind: 'task-notification' } }],
    ['session.send', { to: 'a', text: 'x', origin: { kind: 'model' } }],
    ['session.append', { door: 'tool', message: { content: [] } }],
    ['turn.step', { turnId: 't', agentId: 'agent-7' }],
    ['no.such.event', 'anything'],
  ];
  const misfits: readonly (readonly [string, unknown, string])[] = [
    ['tool.call', { command: 'ls' }, 'tool'],
    ['tool.check', { ...check, isReadOnly: false }, 'isReadOnly'],
    ['tool.check', { ...check, ceiling: 'deny' }, 'ceiling'],
    ['tool.check', { tool: 'Bash' }, 'input'],
    ['agent.spawn', { resume: {} }, 'resume'],
    ['session.end', { reason: 'branch' }, 'reason'],
    ['session.receive', { text: 'x' }, 'origin'],
    ['session.send', { to: 'a', text: 'x', origin: { kind: 'peer' } }, 'origin'],
    ['session.append', { door: 1, message: { content: [] } }, 'door'],
    ['prompt.section', {}, 'name'],
    ['prompt.mention', {}, 'path'],
    ['prompt.fill', {}, 'text'],
    ['prompt.autocomplete', {}, 'token'],
    ['command.run', { args: '' }, 'command'],
    ['turn.start', {}, 'turnId'],
  ];

  test('is undefined for an input that fits the documented fields, and for an event it does not know', () => {
    for (const [event, input] of fits) expect(eventInputProblem(event, input)).toBeUndefined();
  });

  test('names the event and the field of an input that does not fit', () => {
    for (const [event, input, field] of misfits) {
      expect(eventInputProblem(event, input)).toMatch(new RegExp(`^${event} input: ${field}`));
    }
  });
});
