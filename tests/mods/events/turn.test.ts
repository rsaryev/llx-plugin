/**
 * The turn events. plugins/mods/reference.md § Turns; plugins/mods/events.md § Follow a turn
 * (including "Send a request to a different model"). Where a turn starts and ends, and each request
 * to the model, is the host's; the tests fire the events through the chain, `turn.step` as a stream.
 */
import { describe, expect, test } from 'bun:test';
import { eventInputProblem } from '../../../src/mods/events/index.ts';
import { consume, fn, gen, record } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

async function* response(...chunks: string[]): AsyncGenerator<unknown, unknown> {
  await Promise.resolve();
  for (const chunk of chunks) yield chunk;
  return {
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      cache_read_input_tokens: 8,
      cache_creation_input_tokens: 0,
      model: 'opus',
    },
  };
}

describe('turn.start', () => {
  spec('mods.event.turn.start', () => {
    test('a hook observes the turn: e.turnId identifies it, and next(e) lets the turn begin unchanged', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('my-mod', 'user', [fn('turn.start', (_$, e, next) => (seen.push(e.turnId), next(e)))]);
      expect(await h.fire('turn.start', { turnId: 't-1' })).toEqual({ core: { turnId: 't-1' } });
      expect(seen).toEqual(['t-1']);
      expect(eventInputProblem('turn.start', {})).toContain('turnId');
    });
  });
});

describe('turn.step', () => {
  const step = { turnId: 't-1', model: 'opus', effort: 'high' };

  spec('mods.event.turn.step', () => {
    test('yield* next(e) forwards the response as it streams and evaluates to the finished result, with its token usage', async () => {
      const h = eventHarness();
      let usage: unknown;
      h.mod('my-mod', 'user', [
        gen('turn.step', async function* (_$, e, next) {
          const result = yield* next(e);
          usage = record(result).usage;
          return result;
        }),
      ]);
      const { chunks, result } = await consume(
        h.fireStream('turn.step', step, { core: () => response('a', 'b') }),
      );
      expect(chunks).toEqual(['a', 'b']);
      expect(usage).toEqual({
        input_tokens: 10,
        output_tokens: 2,
        cache_read_input_tokens: 8,
        cache_creation_input_tokens: 0,
        model: 'opus',
      });
      expect(result).toEqual({ usage });
    });

    test('next({ ...e, model }) and next({ ...e, effort }) send the request to another model or effort', async () => {
      const h = eventHarness();
      h.mod('router', 'user', [
        gen('turn.step', (_$, e, next) => next({ ...e, model: 'haiku', effort: 'low' })),
      ]);
      await consume(
        h.fireStream('turn.step', step, { core: (e) => (h.coreSeen.push(e), response()) }),
      );
      expect(h.coreSeen).toEqual([{ ...step, model: 'haiku', effort: 'low' }]);
    });

    test('a hook can answer without calling the model; the call to the model never happens', async () => {
      const h = eventHarness();
      h.mod('cache', 'user', [
        gen('turn.step', async function* () {
          yield* []; // a generator hook that answers at once, with nothing to forward
          return await Promise.resolve({ usage: { input_tokens: 0 } });
        }),
      ]);
      const { result } = await consume(
        h.fireStream('turn.step', step, { core: (e) => (h.coreSeen.push(e), response()) }),
      );
      expect(result).toEqual({ usage: { input_tokens: 0 } });
      expect(h.coreSeen).toEqual([]);
    });

    test('e.agentId marks a subagent request, and a result whose usage is not a table fails the hook', async () => {
      expect(eventInputProblem('turn.step', { ...step, agentId: 'agent-7' })).toBeUndefined();
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        gen('turn.step', async function* () {
          yield* [];
          return await Promise.resolve({ usage: 'lots' });
        }),
      ]);
      const { result } = await consume(
        h.fireStream('turn.step', step, { core: () => response('x') }),
      );
      expect(result).toEqual({ usage: expect.objectContaining({ input_tokens: 10 }) });
      expect(reasonsOf(h)).toHaveLength(1);
    });
  });
});

describe('turn.complete', () => {
  const complete = {
    turnId: 't-1',
    answer: 'Done.',
    durationMs: 12_000,
    usage: { input_tokens: 5 },
    isAborted: false,
  };

  spec('mods.event.turn.complete', () => {
    test('an object with a text field shows a line under the answer', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('turn.complete', (_$, e) =>
          Promise.resolve({ text: `Done in ${Number(e.durationMs) / 1000} seconds` }),
        ),
      ]);
      expect(await h.fire('turn.complete', complete)).toEqual({ text: 'Done in 12 seconds' });
    });

    test('next(e) observes: the hook reads the answer, the duration, the usage, isAborted and a subagent agentId', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('turn.complete', (_$, e, next) => next(e))]);
      const event = { ...complete, isAborted: true, agentId: 'agent-1' };
      expect(eventInputProblem('turn.complete', event)).toBeUndefined();
      expect(await h.fire('turn.complete', event)).toEqual({ core: event });
    });

    test('a text that is not a string fails the hook', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('turn.complete', () => Promise.resolve({ text: 12 }))]);
      expect(await h.fire('turn.complete', complete)).toEqual({ core: complete });
      expect(reasonsOf(h)).toHaveLength(1);
    });
  });
});
