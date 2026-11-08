/**
 * The nesting limits of hooks. plugins/mods/reference.md § Limits: "Nesting depth of a mods API
 * call's arguments", "Nesting depth of a changed event passed to `next`, outside async generator
 * hooks" and "Nesting depth of a hook's return value, outside `ui.render`, `ui.resolve`, and async
 * generator hooks": 28,000 levels; past that the call or `next` rejects, or the result is refused,
 * with a message ending `nesting deeper than 28000 levels is not supported`.
 */
import { describe, expect, test } from 'bun:test';
import { nestingMessage, nestingProblem } from '../../../src/mods/chain/index.ts';
import { consume, fn, gen, harness, levels, messageOf, record } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

// The id holds an apostrophe, which the spec gate's literal reader cannot read, so it is named once here;
// `spec()` itself still refuses an id that is not in spec/requirements.json.
const ARGUMENTS_ID = "mods.limit.Nesting depth of a mods API call's arguments";
const MESSAGE_END = 'nesting deeper than 28000 levels is not supported';

describe('a changed event passed to next', () => {
  spec('mods.limit.next', () => {
    test('up to 28000 levels goes to next; past that next rejects with a message ending nesting deeper than 28000 levels is not supported', async () => {
      const h = harness();
      const outcomes: string[] = [];
      h.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          try {
            await next({ ...e, deep: levels(Number(e.depth) - 1) });
            outcomes.push(`${Number(e.depth)}: passed`);
          } catch (error) {
            outcomes.push(`${Number(e.depth)}: ${messageOf(error)}`);
          }
          return next(e);
        }),
      ]);
      await h.fire('tool.call', { depth: 28_000 });
      await h.fire('tool.call', { depth: 28_001 });
      expect(outcomes[0]).toBe('28000: passed');
      expect(outcomes[1]?.startsWith('28001: ')).toBe(true);
      expect(outcomes[1]?.endsWith(MESSAGE_END)).toBe(true);
      expect(h.coreSeen.filter((seen) => 'deep' in record(seen))).toHaveLength(1);
    });

    test('a generator hook such as one on turn.step is exempt', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [
        gen('turn.step', async function* (_$, e, next) {
          return yield* next({ ...e, deep: levels(28_500) });
        }),
      ]);
      const { result } = await consume(
        h.fireStream('turn.step', {}, { core: (e) => Promise.resolve({ seen: e }) }),
      );
      expect(record(result).seen).toBeDefined();
    });
  });
});

describe("the nesting depth of a hook's return value", () => {
  spec('mods.limit.ui.render', () => {
    test('up to 28000 levels the result stands; past that it is refused, and the notice that reports it includes the message', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [
        fn('tool.call', (_$, e) => Promise.resolve({ deep: levels(Number(e.depth)) })),
      ]);
      const fits = record(await h.fire('tool.call', { depth: 27_999 }));
      expect(fits.deep).toBeDefined();
      expect(h.reports).toEqual([]);
      const refused = record(await h.fire('tool.call', { depth: 28_000 }));
      expect(refused).toHaveProperty('core');
      expect(h.reports).toHaveLength(1);
      expect(h.reports[0]?.line).toContain(MESSAGE_END);
    });

    test('a result refused after next was called leaves what next gave standing', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => (await next(e), { deep: levels(28_001) })),
      ]);
      expect(await h.fire('tool.call', { n: 1 })).toEqual({ core: { n: 1 } });
      expect(h.coreSeen).toHaveLength(1);
    });

    test('ui.render and ui.resolve results, and the result of an async generator hook, are exempt', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [
        fn('ui.render', () => Promise.resolve(levels(28_001))),
        fn('ui.resolve', () => Promise.resolve(levels(28_001))),
        gen('turn.step', async function* () {
          yield* [];
          return levels(28_001);
        }),
      ]);
      const render = await h.fire('ui.render');
      const resolve = await h.fire('ui.resolve');
      const step = await consume(h.fireStream('turn.step'));
      expect([render, resolve, step.result].map((value) => Array.isArray(value))).toEqual([
        true,
        true,
        true,
      ]);
      expect(h.reports).toEqual([]);
    });
  });
});

describe("the nesting depth of a mods API call's arguments", () => {
  spec(ARGUMENTS_ID, () => {
    test('28000 levels are passed to the method; past that the call rejects with a message ending nesting deeper than 28000 levels is not supported', async () => {
      const h = harness();
      const received: unknown[] = [];
      const outcomes: string[] = [];
      h.mod(
        'my-mod',
        'user',
        [
          fn('tool.call', async ($, e, next) => {
            for (const depth of [28_000, 28_001]) {
              try {
                await $.fs.write('f', levels(depth));
                outcomes.push(`${depth}: ok`);
              } catch (error) {
                outcomes.push(`${depth}: ${messageOf(error)}`);
              }
            }
            return next(e);
          }),
        ],
        { 'fs.write': (...args) => (received.push(args), Promise.resolve()) },
      );
      await h.fire('tool.call');
      expect(received).toHaveLength(1);
      expect(outcomes[0]).toBe('28000: ok');
      expect(outcomes[1]?.endsWith(MESSAGE_END)).toBe(true);
    });
  });

  test('a synchronous mods API method rejects an over-nested argument too, and is not called (judgment)', async () => {
    const h = harness();
    let calls = 0;
    const outcomes: string[] = [];
    h.mod(
      'my-mod',
      'user',
      [
        fn('tool.call', async ($, e, next) => {
          try {
            await $.ui.log(levels(28_001));
            outcomes.push('called');
          } catch (error) {
            outcomes.push(messageOf(error));
          }
          return next(e);
        }),
      ],
      { 'ui.log': () => (calls += 1) },
    );
    await h.fire('tool.call');
    expect(calls).toBe(0);
    expect(outcomes[0]?.endsWith(MESSAGE_END)).toBe(true);
  });

  test('next.to rejects an over-nested event like next does, and nothing after it runs (judgment)', async () => {
    const h = harness();
    const outcomes: string[] = [];
    h.mod('my-mod', 'prepend', [
      fn('tool.call', async (_$, e, next) => {
        try {
          await next.to({ ...e, deep: levels(28_001) }, 'core');
          outcomes.push('passed');
        } catch (error) {
          outcomes.push(messageOf(error));
        }
        return next(e);
      }),
    ]);
    await h.fire('tool.call', {});
    expect(outcomes[0]?.endsWith(MESSAGE_END)).toBe(true);
    expect(h.coreSeen).toHaveLength(1);
  });

  test('the message names the limit it was given (judgment: the boundary counts nested arrays and objects)', () => {
    expect(nestingMessage(5)).toBe('nesting deeper than 5 levels is not supported');
    expect(nestingProblem(levels(5), 5)).toBeNull();
    expect(nestingProblem(levels(6), 5)).toBe(nestingMessage(5));
    expect(nestingProblem({ a: { b: [] } }, 3)).toBeNull();
    expect(nestingProblem('x', 0)).toBeNull();
  });
});
