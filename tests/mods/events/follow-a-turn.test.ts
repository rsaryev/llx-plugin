/**
 * Turns, prompts and a stopped turn. plugins/mods/events.md § Follow a turn (and "Send a request to a
 * different model") and § Rewrite or add to a prompt; plugins/mods/troubleshoot.md § `Stopped: type a
 * message to continue; a mod cannot resume work after Stop` and § `a hook changed this call's input
 * after the model wrote it`. Where a turn starts and ends and what the model answers are the host's:
 * the tests fire the events through the chain the way a host will.
 */
import { describe, expect, test } from 'bun:test';
import { consume, fn, gen, record } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

const USAGE = {
  input_tokens: 100,
  output_tokens: 20,
  cache_read_input_tokens: 80,
  cache_creation_input_tokens: 0,
  model: 'opus',
};

/** A response that streams its pieces and ends in the finished result. */
async function* response(result: unknown, ...pieces: string[]): AsyncGenerator<unknown, unknown> {
  await Promise.resolve();
  for (const piece of pieces) yield piece;
  return result;
}

describe('follow a turn', () => {
  spec('mods.events.Follow a turn.turn.start', () => {
    test('a turn begins: the hook observes it, e.turnId identifies the turn in the other two events', async () => {
      const h = eventHarness();
      const ids: string[] = [];
      h.mod('follower', 'user', [
        fn('turn.start', (_$, e, next) => (ids.push(`start ${String(e.turnId)}`), next(e))),
        gen('turn.step', async function* (_$, e, next) {
          ids.push(`step ${String(e.turnId)}`);
          return yield* next(e);
        }),
        fn('turn.complete', (_$, e, next) => (ids.push(`complete ${String(e.turnId)}`), next(e))),
      ]);
      await h.fire('turn.start', { turnId: 't-1' });
      await consume(h.fireStream('turn.step', { turnId: 't-1' }, { core: () => response({}) }));
      await consume(h.fireStream('turn.step', { turnId: 't-1' }, { core: () => response({}) }));
      await h.fire('turn.complete', { turnId: 't-1', answer: 'ok' });
      expect(ids).toEqual(['start t-1', 'step t-1', 'step t-1', 'complete t-1']);
    });

    test('observing changes nothing: the turn starts with the event as it was', async () => {
      const h = eventHarness();
      h.mod('follower', 'user', [fn('turn.start', (_$, e, next) => next(e))]);
      expect(await h.fire('turn.start', { turnId: 't-2' })).toEqual({ core: { turnId: 't-2' } });
    });
  });

  spec('mods.events.Follow a turn.turn.step', () => {
    /** The hook of events.md: how much of each request the Claude API served from the prompt cache. */
    const cacheLogger = () =>
      gen('turn.step', async function* ($, e, next) {
        const result = record(yield* next(e));
        const usage = record(result.usage);
        if (result.usage) {
          await $.ui.log(
            'cache read ' +
              String(usage.cache_read_input_tokens) +
              ' · wrote ' +
              String(usage.cache_creation_input_tokens),
          );
        }
        return result;
      });

    test('the example hook logs the cache read and written of each request, forwards the response as it streams and returns the result unchanged', async () => {
      const h = eventHarness();
      const lines: unknown[] = [];
      h.mod('cache-log', 'user', [cacheLogger()], {
        'ui.log': (...args: unknown[]) => (lines.push(args[0]), Promise.resolve()),
      });
      const done = { usage: USAGE };
      const { chunks, result } = await consume(
        h.fireStream('turn.step', { turnId: 't-1' }, { core: () => response(done, 'He', 'llo') }),
      );
      expect(chunks).toEqual(['He', 'llo']);
      expect(result).toEqual(done);
      expect(lines).toEqual(['cache read 80 · wrote 0']);
    });

    test('a turn with tool calls has several requests, and the hook runs for each of them, a subagent request too, with e.agentId set', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('cache-log', 'user', [
        gen('turn.step', async function* (_$, e, next) {
          seen.push(e.agentId ?? 'main');
          return yield* next(e);
        }),
      ]);
      for (const step of [{}, {}, { agentId: 'agent-3' }]) {
        await consume(
          h.fireStream('turn.step', { turnId: 't-1', ...step }, { core: () => response({}) }),
        );
      }
      expect(seen).toEqual(['main', 'main', 'agent-3']);
    });

    test('result.usage holds the counts of the request plus the model that answered; a result that reports none skips the log', async () => {
      const h = eventHarness();
      const lines: unknown[] = [];
      h.mod('cache-log', 'user', [cacheLogger()], {
        'ui.log': (...args: unknown[]) => (lines.push(args[0]), Promise.resolve()),
      });
      const seen: unknown[] = [];
      h.mod('reader', 'prepend', [
        gen('turn.step', async function* (_$, e, next) {
          const result = record(yield* next(e));
          seen.push(record(result.usage).model);
          return result;
        }),
      ]);
      await consume(
        h.fireStream('turn.step', { turnId: 't' }, { core: () => response({ usage: USAGE }) }),
      );
      await consume(h.fireStream('turn.step', { turnId: 't' }, { core: () => response({}) }));
      expect(lines).toEqual(['cache read 80 · wrote 0']);
      expect(seen).toEqual(['opus']);
    });

    test('result.serverToolUses lists the calls the API ran itself, and is absent when the response has none', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('advisor-log', 'user', [
        gen('turn.step', async function* (_$, e, next) {
          const result = record(yield* next(e));
          seen.push('serverToolUses' in result ? result.serverToolUses : 'absent');
          return result;
        }),
      ]);
      const ran = [{ name: 'advisor' }];
      await consume(
        h.fireStream(
          'turn.step',
          { turnId: 't' },
          { core: () => response({ usage: USAGE, serverToolUses: ran }) },
        ),
      );
      await consume(
        h.fireStream('turn.step', { turnId: 't' }, { core: () => response({ usage: USAGE }) }),
      );
      expect(seen).toEqual([ran, 'absent']);
    });

    test('a hook can answer without calling the model', async () => {
      const h = eventHarness();
      h.mod('cache', 'user', [
        gen('turn.step', async function* () {
          yield* [];
          return await Promise.resolve({ usage: { input_tokens: 0 } });
        }),
      ]);
      const { result } = await consume(
        h.fireStream(
          'turn.step',
          { turnId: 't' },
          { core: (e) => (h.coreSeen.push(e), response({})) },
        ),
      );
      expect(result).toEqual({ usage: { input_tokens: 0 } });
      expect(h.coreSeen).toEqual([]);
    });
  });

  spec('mods.events.Follow a turn.turn.complete', () => {
    const complete = {
      turnId: 't-1',
      answer: 'Done.',
      durationMs: 12_000,
      usage: { input_tokens: 5 },
    };

    test('an object with a text field, such as { text: "Done in 12 seconds" }, shows a line under the answer', async () => {
      const h = eventHarness();
      h.mod('timer', 'user', [
        fn('turn.complete', (_$, e) =>
          Promise.resolve({ text: `Done in ${Number(e.durationMs) / 1000} seconds` }),
        ),
      ]);
      expect(await h.fire('turn.complete', complete)).toEqual({ text: 'Done in 12 seconds' });
    });

    test('it fires for an interrupted turn too, with e.isAborted true, and a hook sees e.answer, e.durationMs and e.usage', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('watcher', 'user', [fn('turn.complete', (_$, e, next) => (seen.push(e), next(e)))]);
      const stopped = { ...complete, isAborted: true, answer: 'Partial' };
      await h.fire('turn.complete', stopped);
      await h.fire('turn.complete', complete);
      expect(seen).toEqual([stopped, complete]);
    });

    test('a subagent turn fires it with e.agentId set, so a hook can tell it from the main turn', async () => {
      const h = eventHarness();
      const lines: string[] = [];
      h.mod('timer', 'user', [
        fn('turn.complete', (_$, e) => {
          if (e.agentId) return Promise.resolve({});
          lines.push('main');
          return Promise.resolve({ text: 'main turn' });
        }),
      ]);
      expect(await h.fire('turn.complete', { ...complete, agentId: 'agent-1' })).toEqual({});
      expect(await h.fire('turn.complete', complete)).toEqual({ text: 'main turn' });
      expect(lines).toEqual(['main']);
    });

    test('a text that is not a string fails the hook, and no line is shown', async () => {
      const h = eventHarness();
      h.mod('timer', 'user', [fn('turn.complete', () => Promise.resolve({ text: 12 }))]);
      expect(await h.fire('turn.complete', complete)).toEqual({ core: complete });
      expect(reasonsOf(h)).toHaveLength(1);
    });
  });

  spec('mods.events.Send a request to a different model', () => {
    test('yield* next({ ...e, model }) sends the request to the other model: Claude Code receives it and the response comes from it', async () => {
      const h = eventHarness();
      const received: unknown[] = [];
      h.mod('router', 'user', [gen('turn.step', (_$, e, next) => next({ ...e, model: 'haiku' }))]);
      const { result } = await consume(
        h.fireStream(
          'turn.step',
          { turnId: 't', model: 'opus' },
          {
            core: (e) => {
              received.push(e);
              return response({ usage: { ...USAGE, model: record(e).model } });
            },
          },
        ),
      );
      expect(received).toEqual([{ turnId: 't', model: 'haiku' }]);
      expect(record(record(result).usage).model).toBe('haiku');
    });

    test('hooks after the router see the changed model, and the event the router received stays as it was', async () => {
      const h = eventHarness();
      const later: unknown[] = [];
      const first: unknown[] = [];
      h.mod('router', 'user', [
        gen('turn.step', (_$, e, next) => (first.push(e.model), next({ ...e, model: 'haiku' }))),
      ]);
      h.mod('watcher', 'user', [
        gen('turn.step', async function* (_$, e, next) {
          later.push(e.model);
          return yield* next(e);
        }),
      ]);
      await consume(
        h.fireStream('turn.step', { turnId: 't', model: 'opus' }, { core: () => response({}) }),
      );
      expect(first).toEqual(['opus']);
      expect(later).toEqual(['haiku']);
    });
  });
});
