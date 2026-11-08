/**
 * The prompt events a user's typing raises. plugins/mods/reference.md § Prompts and what Claude
 * reads; plugins/mods/events.md § Rewrite or add to a prompt and § Handle a hook that fails. When
 * these events fire (a submit, the box filling, an edit, a word ending at the cursor) is the host's;
 * the tests fire each through the chain and prove what the kit does with the documented answers.
 */
import { describe, expect, test } from 'bun:test';
import { autocompleteRows, eventInputProblem } from '../../../src/mods/events/index.ts';
import { deferred, flush, fn } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

describe('prompt.submit', () => {
  spec('mods.event.prompt.submit', () => {
    test('next({ ...e, text }): later handlers and Claude Code receive the trimmed prompt, never the original', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.submit', (_$, e, next) => next({ ...e, text: String(e.text).trim() })),
      ]);
      await h.fire('prompt.submit', { text: '  hello  ' });
      expect(h.coreSeen).toEqual([{ text: 'hello' }]);
    });

    test('next({ ...e, context }): text only Claude reads is added after the prompt, keeping an earlier hook context', async () => {
      const h = eventHarness();
      h.mod('first', 'user', [
        fn('prompt.submit', (_$, e, next) => next({ ...e, context: ['earlier'] })),
      ]);
      h.mod('second', 'user', [
        fn('prompt.submit', (_$, e, next) =>
          next({
            ...e,
            context: [
              ...(Array.isArray(e.context) ? e.context : []),
              'Current branch: feature/auth',
            ],
          }),
        ),
      ]);
      await h.fire('prompt.submit', { text: 'open a PR for this change' });
      expect(h.coreSeen).toEqual([
        { text: 'open a PR for this change', context: ['earlier', 'Current branch: feature/auth'] },
      ]);
    });

    test('{ drop: reason } without next stops the prompt: it is never sent', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.submit', () => Promise.resolve({ drop: 'No secrets in prompts.' })),
      ]);
      expect(await h.fire('prompt.submit', { text: 'x' })).toEqual({
        drop: 'No secrets in prompts.',
      });
      expect(h.coreSeen).toEqual([]);
    });

    test('a drop after next(e) let the prompt through fails the hook: the turn still runs', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.submit', async (_$, e, next) => {
          await next(e);
          return { drop: 'too late' };
        }),
      ]);
      expect(await h.fire('prompt.submit', { text: 'x' })).toEqual({ core: { text: 'x' } });
      expect(h.coreSeen).toHaveLength(1);
      expect(reasonsOf(h)[0]).toContain('a drop after its next() was answered');
    });

    test('a hook that throws is skipped and the prompt is sent; a .catch that drops when next was not called stops it', async () => {
      const plain = eventHarness();
      plain.mod('my-mod', 'user', [fn('prompt.submit', () => Promise.reject(new Error('boom')))]);
      expect(await plain.fire('prompt.submit', { text: 'x' })).toEqual({ core: { text: 'x' } });

      const guarded = eventHarness();
      guarded.mod('my-mod', 'user', [
        fn('prompt.submit', () => Promise.reject(new Error('boom')), {
          handler: (_$, e, next) =>
            next.called ? next(e) : Promise.resolve({ drop: 'the guard failed' }),
        }),
      ]);
      expect(await guarded.fire('prompt.submit', { text: 'x' })).toEqual({
        drop: 'the guard failed',
      });
      expect(guarded.coreSeen).toEqual([]);
    });

    test('the drop reason, the context and the text must be strings', async () => {
      for (const wrong of [{ drop: 5 }, { text: 5 }, { context: 'one line' }, 'nonsense']) {
        const h = eventHarness();
        h.mod('my-mod', 'user', [fn('prompt.submit', () => Promise.resolve(wrong))]);
        expect(await h.fire('prompt.submit', { text: 'x' })).toEqual({ core: { text: 'x' } });
        expect(reasonsOf(h)).toHaveLength(1);
      }
      expect(eventInputProblem('prompt.submit', { text: 'x', context: ['a'] })).toBeUndefined();
      expect(eventInputProblem('prompt.submit', {})).toContain('text');
    });
  });
});

describe('prompt.fill and prompt.suggest', () => {
  spec(['mods.event.prompt.fill', 'mods.event.prompt.suggest'], () => {
    test('next(e) with changed text: Claude Code puts the changed text in the box, as a draft or as a dim suggestion', async () => {
      for (const event of ['prompt.fill', 'prompt.suggest']) {
        const h = eventHarness();
        h.mod('my-mod', 'user', [
          fn(event, (_$, e, next) => next({ ...e, text: `${String(e.text)}!` })),
        ]);
        await h.fire(event, { text: 'run the tests' });
        expect(h.coreSeen).toEqual([{ text: 'run the tests!' }]);
      }
    });

    test('the event carries e.text; an answer whose text is not a string fails the hook', async () => {
      for (const event of ['prompt.fill', 'prompt.suggest']) {
        expect(eventInputProblem(event, { text: 'x' })).toBeUndefined();
        expect(eventInputProblem(event, {})).toContain('text');
        const h = eventHarness();
        h.mod('my-mod', 'user', [fn(event, () => Promise.resolve({ text: 5 }))]);
        expect(await h.fire(event, { text: 'x' })).toEqual({ core: { text: 'x' } });
        expect(reasonsOf(h)).toHaveLength(1);
      }
    });
  });
});

describe('prompt.edit', () => {
  spec('mods.event.prompt.edit', () => {
    test('next(e) passes the edit on unchanged', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('prompt.edit', (_$, e, next) => next(e))]);
      expect(await h.fire('prompt.edit', { text: 'abc' })).toEqual({ core: { text: 'abc' } });
    });

    test('the hook has 50 milliseconds, not 10 seconds: a hook still running then is skipped and the edit goes on', async () => {
      const h = eventHarness();
      const never = deferred();
      h.mod('my-mod', 'user', [fn('prompt.edit', async () => (await never.promise, {}))]);
      const pending = h.fire('prompt.edit', { text: 'abc' });
      await flush();
      h.clock.advance(50);
      expect(await pending).toEqual({ core: { text: 'abc' } });
      expect(reasonsOf(h)[0]).toContain('50 ms');
    });
  });
});

describe('prompt.autocomplete', () => {
  const rows = [
    { text: 'fix-login', label: 'fix-login', description: 'Branch' },
    { text: 'fix-logout' },
  ];

  spec('mods.event.prompt.autocomplete', () => {
    test('the event carries the word that ends at the cursor in e.token', () => {
      expect(eventInputProblem('prompt.autocomplete', { token: 'fix' })).toBeUndefined();
      expect(eventInputProblem('prompt.autocomplete', {})).toContain('token');
    });

    test('{ suggestions } is a list of rows with text, label and description', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('prompt.autocomplete', () => Promise.resolve({ suggestions: rows })),
      ]);
      expect(await h.fire('prompt.autocomplete', { token: 'fix' })).toEqual({ suggestions: rows });
    });

    test('a row without text, or suggestions that are not a list, fails the hook', async () => {
      for (const wrong of [{ suggestions: [{ label: 'x' }] }, { suggestions: 'fix' }, {}]) {
        const h = eventHarness();
        h.mod('my-mod', 'user', [fn('prompt.autocomplete', () => Promise.resolve(wrong))]);
        expect(await h.fire('prompt.autocomplete', { token: 'fix' })).toEqual({
          core: { token: 'fix' },
        });
        expect(reasonsOf(h)).toHaveLength(1);
      }
    });

    test("the mods' rows are shown below Claude Code's own; an answer of the wrong shape adds none", () => {
      const own = [{ text: 'fix' }];
      expect(autocompleteRows(own, { suggestions: rows })).toEqual([...own, ...rows]);
      expect(autocompleteRows(own, { suggestions: [{ label: 'x' }] })).toEqual(own);
      expect(autocompleteRows(own, undefined)).toEqual(own);
    });
  });
});
