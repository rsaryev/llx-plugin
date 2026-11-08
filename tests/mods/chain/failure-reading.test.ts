/**
 * How a failure reads, and what a handler is told about it: the text of a thrown value, the kind of a
 * refused result, a handler on a generator hook. These are judgments of the kit
 * (plugins/mods/events.md § Handle a hook that fails states the rest; see spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import type { HookFailure } from '../../../src/protocol/mods-events.ts';
import { consume, fn, gen, harness, levels } from '../../support/mods-chain.ts';

describe('how a failure reads (judgments)', () => {
  test('a thrown value that is not an error takes its text from String(value), in the report and in next.error', async () => {
    const h = harness();
    let seen: HookFailure | undefined;
    h.mod('my-mod', 'user', [
      fn('tool.call', () => Promise.reject('plain text'), {
        handler: (_$, e, next) => ((seen = next.error), Promise.resolve(e)),
      }),
    ]);
    h.mod('other-mod', 'user', [fn('prompt.submit', () => Promise.reject(42))]);
    await h.fire('tool.call');
    await h.fire('prompt.submit');
    expect(seen).toEqual({ kind: 'throw', message: 'plain text' });
    expect(h.reports.map((report) => report.line)).toEqual([
      'other-mod: prompt.submit hook skipped: threw 42',
    ]);
  });

  test('a result that is refused for its nesting reaches the handler as next.error.kind throw', async () => {
    const h = harness();
    let seen: HookFailure | undefined;
    h.mod('my-mod', 'user', [
      fn('tool.call', () => Promise.resolve({ deep: levels(28_001) }), {
        handler: (_$, e, next) => ((seen = next.error), Promise.resolve(e)),
      }),
    ]);
    await h.fire('tool.call');
    expect(seen?.kind).toBe('throw');
    expect(seen?.message).toEndWith('nesting deeper than 28000 levels is not supported');
  });

  test('a result of the wrong shape reaches the handler as next.error.kind throw', async () => {
    const h = harness(() => 'wrong shape');
    let seen: HookFailure | undefined;
    h.mod('my-mod', 'user', [
      fn('tool.call', () => Promise.resolve('nonsense'), {
        handler: (_$, e, next) => ((seen = next.error), Promise.resolve(e)),
      }),
    ]);
    await h.fire('tool.call');
    expect(seen).toEqual({ kind: 'throw', message: 'wrong shape' });
  });

  test('a .catch handler on a generator hook answers with a stream in its place', async () => {
    const h = harness();
    const kinds: string[] = [];
    h.mod('my-mod', 'user', [
      gen(
        'turn.step',
        // oxlint-disable-next-line require-yield -- the hook fails before it yields
        async function* () {
          yield* [];
          throw new Error('boom');
        },
        {
          // oxlint-disable-next-line typescript/require-await -- an async generator needs no await to answer
          handler: async function* (_$, _e, next) {
            kinds.push(next.error.kind);
            yield 'recovered chunk';
            return 'recovered result';
          },
        },
      ),
    ]);
    const { chunks, result } = await consume(h.fireStream('turn.step'));
    expect(kinds).toEqual(['throw']);
    expect(chunks).toEqual(['recovered chunk']);
    expect(result).toBe('recovered result');
    expect(h.reports).toEqual([]);
  });
});
