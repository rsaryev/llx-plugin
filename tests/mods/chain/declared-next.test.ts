/**
 * Declarations 2.1.321 (AGENTS.md, E2a), judged in spec/judgments.md ("What a hook returns, `next`
 * with no argument, `next(e)` on a streaming event"):
 * - `Next` (claude-code/index.d.ts:6963): "Called with no argument it rejects, naming the hook. A hook
 *   that returns without calling it ends the chain; returning nothing is a failure."
 * - `StreamHookBody` (:13444): "Returning nothing lets its last `next(e)`'s result stand."
 * - `HookStream` (:5487): `next(e)` on a streaming event is the stream beneath, whose `result`
 *   "settles with what beneath returned once the stream has been read to its end; rejects if the
 *   stream is closed before that".
 */
import { describe, expect, test } from 'bun:test';
import { consume, fn, gen, harness, messageOf } from '../../support/mods-chain.ts';

describe('a function hook that returns nothing fails (claude-code/index.d.ts:6970)', () => {
  test('before next: the hook is skipped, the line says it returned nothing, the chain goes on', async () => {
    const h = harness();
    h.mod('quiet', 'user', [fn('tool.call', () => undefined)]);
    expect(await h.fire('tool.call', { tool: 'Bash' })).toEqual({ core: { tool: 'Bash' } });
    expect(h.reports.map((report) => report.line)).toEqual([
      'quiet: tool.call hook skipped: returned the wrong shape (it returned nothing: return next(e) or a result)',
    ]);
  });

  test('after next: the result of its next stands, and the failure is reported', async () => {
    const h = harness();
    h.mod('quiet', 'user', [
      fn('tool.call', async (_$, e, next) => {
        await next(e);
        return undefined;
      }),
    ]);
    expect(await h.fire('tool.call', { tool: 'Bash' })).toEqual({ core: { tool: 'Bash' } });
    expect(h.coreSeen).toHaveLength(1);
    expect(h.reports.map((report) => report.kind)).toEqual(['wrong-shape']);
  });

  test('its .catch handler answers in its place', async () => {
    const h = harness();
    h.mod('quiet', 'user', [
      fn('tool.call', () => undefined, { handler: () => ({ deny: 'caught' }) }),
    ]);
    expect(await h.fire('tool.call', {})).toEqual({ deny: 'caught' });
  });

  test("a hook that passes on next's own undefined is not judged: it returned what next gave it", async () => {
    const h = harness();
    h.mod('pass', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
    expect(await h.fire('tool.call', {}, { core: () => Promise.resolve(undefined) })).toBe(
      undefined,
    );
    expect(h.reports).toEqual([]);
  });
});

describe('next() with no argument rejects, naming the hook (claude-code/index.d.ts:6969)', () => {
  test('a function hook', async () => {
    const h = harness();
    let message = '';
    h.mod('lazy', 'user', [
      fn('tool.call', async (_$, _e, next) => {
        try {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test calls next as an untyped guest would
          return await (next as unknown as () => Promise<unknown>)();
        } catch (error) {
          message = messageOf(error);
          return { deny: 'no event' };
        }
      }),
    ]);
    expect(await h.fire('tool.call', {})).toEqual({ deny: 'no event' });
    expect(message).toBe('next() takes the event: the tool.call hook of lazy called it with none');
    expect(h.coreSeen).toEqual([]);
  });

  test('next(undefined) passes undefined on: only a call with no argument is refused', async () => {
    const h = harness();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test passes undefined as an untyped guest would
    const loose = (next: unknown) => (next as (e: unknown) => Promise<unknown>)(undefined);
    h.mod('explicit', 'user', [fn('custom.event', (_$, _e, next) => loose(next))]);
    expect(await h.fire('custom.event', { a: 1 })).toEqual({ core: undefined });
  });
});

async function* core(): AsyncGenerator<unknown, unknown> {
  yield 'a';
  yield 'b';
  return { answer: 'whole' };
}

describe('a streaming hook (claude-code/index.d.ts:13444, :5487)', () => {
  test("returning nothing after next lets that next's result stand", async () => {
    const h = harness();
    h.mod('forward', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        yield* next(e);
      }),
    ]);
    expect(await consume(h.fireStream('turn.step', {}, { core }))).toEqual({
      chunks: ['a', 'b'],
      result: { answer: 'whole' },
    });
    expect(h.reports).toEqual([]);
  });

  test('returning nothing without next is a failure: the hook is skipped (judgment)', async () => {
    const h = harness();
    h.mod('own', 'user', [
      gen('turn.step', async function* () {
        yield* [];
      }),
    ]);
    expect(await consume(h.fireStream('turn.step', {}, { core }))).toEqual({
      chunks: ['a', 'b'],
      result: { answer: 'whole' },
    });
    expect(h.reports.map((report) => report.kind)).toEqual(['wrong-shape']);
  });

  test('next(e) is a HookStream: result settles once it is read to its end', async () => {
    const h = harness();
    const results: unknown[] = [];
    h.mod('reader', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the declared HookStream carries `result`
        const stream = next(e) as AsyncGenerator<unknown, unknown> & { result: Promise<unknown> };
        for await (const chunk of stream) yield `[${String(chunk)}]`;
        results.push(await stream.result);
        return { answer: 'mine' };
      }),
    ]);
    expect(await consume(h.fireStream('turn.step', {}, { core }))).toEqual({
      chunks: ['[a]', '[b]'],
      result: { answer: 'mine' },
    });
    expect(results).toEqual([{ answer: 'whole' }]);
  });

  test('result rejects when the stream is closed before its end', async () => {
    const h = harness();
    let message = '';
    h.mod('early', 'user', [
      gen('turn.step', async function* (_$, e, next) {
        yield* [];
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the declared HookStream carries `result`
        const stream = next(e) as AsyncGenerator<unknown, unknown> & { result: Promise<unknown> };
        await stream.next();
        await stream.return(undefined);
        message = await stream.result.then(String, messageOf);
        return { answer: 'cut' };
      }),
    ]);
    expect((await consume(h.fireStream('turn.step', {}, { core }))).result).toEqual({
      answer: 'cut',
    });
    expect(message).toBe('next(e): the stream was closed before its end');
  });
});
