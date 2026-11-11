/**
 * Hooks on a streaming event are async generators: `yield* next(e)` forwards the response as it
 * streams and evaluates to the finished result. plugins/mods/events.md § Follow a turn; reference.md
 * § Events ("Hooks on `turn.step` and `process.spawn` are async generators") and § Limits.
 */
import { describe, expect, test } from 'bun:test';
import { consume, deferred, flush, gen, harness } from '../../support/mods-chain.ts';

async function* response(...chunks: string[]): AsyncGenerator<unknown, unknown> {
  await Promise.resolve();
  for (const chunk of chunks) yield chunk;
  return { usage: { input_tokens: 3 } };
}

describe('a generator hook on turn.step', () => {
  test('yield* next(e) forwards each piece as it arrives and evaluates to the finished result', async () => {
    const h = harness();
    let seen: unknown;
    h.mod('my-mod', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        const result = yield* next(e);
        seen = result;
        return result;
      }),
    ]);
    const { chunks, result } = await consume(
      h.fireStream('turn.step', { model: 'm' }, { core: () => response('a', 'b') }),
    );
    expect(chunks).toEqual(['a', 'b']);
    expect(result).toEqual({ usage: { input_tokens: 3 } });
    expect(seen).toEqual(result);
  });

  test('the hook can pass a changed copy and answer without calling the model', async () => {
    const h = harness();
    h.mod('router', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        return yield* next({ ...e, model: 'haiku' });
      }),
    ]);
    h.mod('cache', 'user', [
      gen('turn.step', async function* (_$, e) {
        if (e.model === 'haiku') return { usage: { cached: true } };
        return yield* response();
      }),
    ]);
    const { result } = await consume(
      h.fireStream('turn.step', { model: 'opus' }, { core: () => response('never') }),
    );
    expect(result).toEqual({ usage: { cached: true } });
  });

  test('a hook may add pieces of its own to the stream', async () => {
    const h = harness();
    h.mod('my-mod', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        yield 'first';
        return yield* next(e);
      }),
    ]);
    const { chunks } = await consume(h.fireStream('turn.step', {}, { core: () => response('a') }));
    expect(chunks).toEqual(['first', 'a']);
  });

  test('a hook that fails before calling next is skipped and the response streams through the next handler', async () => {
    const h = harness();
    h.mod('my-mod', 'user', [
      gen('turn.step', async function* () {
        yield* [];
        throw new Error('boom');
      }),
    ]);
    const { chunks, result } = await consume(
      h.fireStream('turn.step', {}, { core: () => response('a', 'b') }),
    );
    expect(chunks).toEqual(['a', 'b']);
    expect(result).toEqual({ usage: { input_tokens: 3 } });
    expect(h.reports[0]?.line).toBe('my-mod: turn.step hook skipped: threw Error: boom');
  });

  test('a hook that fails midway through the response lets the rest of it stream, and its result stands', async () => {
    const h = harness();
    h.mod('my-mod', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        const stream = next(e);
        const first = await stream.next();
        if (!first.done) yield first.value;
        throw new Error('stopped reading');
      }),
    ]);
    const { chunks, result } = await consume(
      h.fireStream('turn.step', {}, { core: () => response('a', 'b', 'c') }),
    );
    expect(chunks).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ usage: { input_tokens: 3 } });
  });

  test("time inside next and between pulls is not the hook's own, and its own time is limited to 10 seconds", async () => {
    const h = harness();
    h.mod('slow-model', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        return yield* next(e);
      }),
    ]);
    const gate = deferred();
    const slow = async function* (): AsyncGenerator<unknown, unknown> {
      await gate.promise;
      yield 'late piece';
      return 'done';
    };
    const pending = consume(h.fireStream('turn.step', {}, { core: slow }));
    await flush();
    h.clock.advance(3_600_000);
    gate.resolve();
    expect((await pending).chunks).toEqual(['late piece']);
    expect(h.reports).toEqual([]);

    const h2 = harness();
    h2.mod('stuck', 'user', [
      gen('turn.step', async function* () {
        yield* [];
        await new Promise(() => undefined);
      }),
    ]);
    const stuck = consume(h2.fireStream('turn.step', {}, { core: () => response('a') }));
    await flush();
    h2.clock.advance(10_000);
    expect((await stuck).chunks).toEqual(['a']);
    expect(h2.reports[0]?.reason).toContain('10000 ms');
  });

  test('next.to on a generator hook streams from the tier it lands on', async () => {
    const h = harness();
    h.mod('org', 'prepend', [
      gen('turn.step', async function* (_$, e, next) {
        return yield* next.to(e, 'core');
      }),
    ]);
    h.mod('skipped', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        yield 'skipped mod';
        return yield* next(e);
      }),
    ]);
    const { chunks } = await consume(h.fireStream('turn.step', {}, { core: () => response('a') }));
    expect(chunks).toEqual(['a']);
  });
});
