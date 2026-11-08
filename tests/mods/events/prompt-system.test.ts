/**
 * The events about what Claude reads besides the prompt: the system prompt's sections, the first
 * message's context, Claude Code's own messages, @-mentions and attribution text.
 * plugins/mods/reference.md § Prompts and what Claude reads. When Claude Code renders a system
 * prompt or adds a reminder is the host's; the tests fire each event through the chain.
 */
import { describe, expect, test } from 'bun:test';
import { eventInputProblem } from '../../../src/mods/events/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

/** Fires `event` with a hook that answers `answer`; the result and whether the hook was skipped. */
async function answered(event: string, input: Record<string, unknown>, answer: unknown) {
  const h = eventHarness();
  h.mod('my-mod', 'user', [fn(event, () => Promise.resolve(answer))]);
  const result = await h.fire(event, input);
  return { result, skipped: reasonsOf(h).length === 1 };
}

describe('prompt.compose', () => {
  const sections = [
    { id: 'identity', text: 'You are Claude Code.', scope: 'global' },
    { id: 'rules', text: 'Be brief.', scope: 'session' },
  ];
  spec('mods.event.prompt.compose', () => {
    test('{ sections } is the list of { id, text, scope } in the order they are sent', async () => {
      expect(await answered('prompt.compose', {}, { sections })).toEqual({
        result: { sections },
        skipped: false,
      });
    });

    test('a section without id, text or scope, or sections that are not a list, fails the hook', async () => {
      for (const wrong of [
        { sections: [{ id: 'a', text: 'b' }] },
        { sections: [{ text: 'b', scope: 's' }] },
        { sections: 'x' },
        {},
      ]) {
        expect((await answered('prompt.compose', {}, wrong)).skipped).toBe(true);
      }
    });
  });
});

describe('prompt.section', () => {
  spec('mods.event.prompt.section', () => {
    test('e.name is the section id; { text } replaces the section', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.section', (_$, e) => Promise.resolve({ text: `[${String(e.name)}]` })),
      ]);
      expect(await h.fire('prompt.section', { name: 'rules' })).toEqual({ text: '[rules]' });
      expect(eventInputProblem('prompt.section', {})).toContain('name');
    });

    test('{ text: null } omits the section; a text that is neither a string nor null fails the hook', async () => {
      expect(await answered('prompt.section', { name: 'rules' }, { text: null })).toEqual({
        result: { text: null },
        skipped: false,
      });
      expect((await answered('prompt.section', { name: 'rules' }, { text: 5 })).skipped).toBe(true);
      expect((await answered('prompt.section', { name: 'rules' }, {})).skipped).toBe(true);
    });
  });
});

describe('prompt.context', () => {
  spec('mods.event.prompt.context', () => {
    test('{ blocks } is the context sent with the first message', async () => {
      const blocks = [{ type: 'text', text: 'Project notes' }];
      expect(await answered('prompt.context', {}, { blocks })).toEqual({
        result: { blocks },
        skipped: false,
      });
    });

    test('blocks that are not a list fail the hook', async () => {
      expect((await answered('prompt.context', {}, { blocks: 'x' })).skipped).toBe(true);
      expect((await answered('prompt.context', {}, 'nonsense')).skipped).toBe(true);
    });
  });
});

describe('prompt.attachment', () => {
  const reminder = { type: 'todo_reminder', detail: { count: 3 } };
  spec('mods.event.prompt.attachment', () => {
    test('e.type names the kind and e.detail holds the facts; { text } replaces the message', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.attachment', (_$, e) =>
          Promise.resolve({ text: `${String(e.type)}: ${JSON.stringify(e.detail)}` }),
        ),
      ]);
      expect(await h.fire('prompt.attachment', reminder)).toEqual({
        text: 'todo_reminder: {"count":3}',
      });
      expect(eventInputProblem('prompt.attachment', reminder)).toBeUndefined();
      expect(eventInputProblem('prompt.attachment', { detail: 1 })).toContain('type');
    });

    test('{ text: null } omits the message; a text of another type fails the hook', async () => {
      expect((await answered('prompt.attachment', reminder, { text: null })).skipped).toBe(false);
      expect((await answered('prompt.attachment', reminder, { text: false })).skipped).toBe(true);
    });
  });
});

describe('prompt.mention', () => {
  spec('mods.event.prompt.mention', () => {
    test('next({ ...e, path }) makes Claude Code read a different file', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.mention', (_$, e, next) => next({ ...e, path: `${String(e.path)}.safe` })),
      ]);
      await h.fire('prompt.mention', { path: '/repo/notes.md' });
      expect(h.coreSeen).toEqual([{ path: '/repo/notes.md.safe' }]);
    });

    test('{ deny: reason } refuses the read without calling next; Claude Code reads nothing', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.mention', () => Promise.resolve({ deny: 'secrets live there' })),
      ]);
      expect(await h.fire('prompt.mention', { path: '/repo/.env' })).toEqual({
        deny: 'secrets live there',
      });
      expect(h.coreSeen).toEqual([]);
    });

    test('a deny or a path that is not a string fails the hook', async () => {
      expect((await answered('prompt.mention', { path: 'a' }, { deny: 1 })).skipped).toBe(true);
      expect((await answered('prompt.mention', { path: 'a' }, { path: 1 })).skipped).toBe(true);
      expect(eventInputProblem('prompt.mention', {})).toContain('path');
    });
  });
});

describe('attribution.text', () => {
  spec('mods.event.attribution.text', () => {
    test('{ text } is the attribution Claude Code writes in a commit or pull request', async () => {
      expect(
        await answered('attribution.text', {}, { text: 'Co-Authored-By: Team <team@example.com>' }),
      ).toEqual({
        result: { text: 'Co-Authored-By: Team <team@example.com>' },
        skipped: false,
      });
    });

    test('an answer without a text string fails the hook and Claude Code text stands', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('attribution.text', () => Promise.resolve({ text: 1 }))]);
      expect(
        await h.fire('attribution.text', {}, { core: () => Promise.resolve({ text: 'core' }) }),
      ).toEqual({
        text: 'core',
      });
      expect(reasonsOf(h)).toHaveLength(1);
    });
  });
});
