/**
 * The time limits of hooks. plugins/mods/reference.md § Limits (a hook's own execution time, a
 * `.catch` handler's, all `session.end` hooks together) and § The hook function (`next.budget`).
 */
import { describe, expect, test } from 'bun:test';
import { deferred, flush, fn, harness } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

const NEVER = (): Promise<never> => new Promise(() => undefined);

describe("a hook's own time (reference.md § Limits)", () => {
  spec('mods.limit.next', () => {
    test('10 seconds for one event: a hook still running at 10 seconds is skipped, not before', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [fn('tool.call', NEVER)]);
      let result: unknown;
      const pending = h.fire('tool.call', { n: 1 }).then((answer) => (result = answer));
      await flush();
      h.clock.advance(9999);
      await flush();
      expect(result).toBeUndefined();
      h.clock.advance(1);
      await pending;
      expect(result).toEqual({ core: { n: 1 } });
      expect(h.reports.map((report) => report.line)).toEqual([
        'my-mod: tool.call hook skipped: timed out: ran over its 10000 ms limit',
      ]);
    });

    test('50 milliseconds for a prompt.edit hook', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [fn('prompt.edit', NEVER)]);
      let done = false;
      const pending = h.fire('prompt.edit', {}).then(() => (done = true));
      await flush();
      h.clock.advance(49);
      await flush();
      expect(done).toBe(false);
      h.clock.advance(1);
      await pending;
      expect(h.reports[0]?.reason).toContain('50 ms');
    });

    test('time inside next is not counted', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
      const gate = Promise.withResolvers<string>();
      const pending = h.fire('tool.call', {}, { core: () => gate.promise });
      await flush();
      h.clock.advance(3_600_000);
      gate.resolve('late answer');
      expect(await pending).toBe('late answer');
      expect(h.reports).toEqual([]);
    });

    test("time inside a mods API call is not counted, except $.clock.sleep, which is the hook's own", async () => {
      const h = harness();
      let read = deferred();
      let readCalls = 0;
      h.mod(
        'my-mod',
        'user',
        [
          fn('tool.call', async ($, e, next) => {
            await $.fs.read('a');
            await $.clock.sleep(6000);
            await $.fs.read('b');
            await $.clock.sleep(5000);
            return next(e);
          }),
        ],
        {
          'fs.read': () => ((readCalls += 1), (read = deferred()).promise),
          'clock.sleep': (ms) => h.clock.sleep(Number(ms)),
        },
      );
      const pending = h.fire('tool.call', { n: 1 });
      await flush();
      h.clock.advance(60_000);
      read.resolve();
      await flush();
      h.clock.advance(6000);
      await flush();
      expect(readCalls).toBe(2);
      h.clock.advance(60_000);
      read.resolve();
      await flush();
      h.clock.advance(3999);
      await flush();
      expect(h.reports).toEqual([]);
      h.clock.advance(1);
      expect(await pending).toEqual({ core: { n: 1 } });
      expect(h.reports.map((report) => report.reason)).toEqual([
        'timed out: ran over its 10000 ms limit',
      ]);
    });

    test('a synchronous mods API call gives the floor back: the limit still fires after it', async () => {
      const h = harness();
      let logged = 0;
      h.mod(
        'my-mod',
        'user',
        [
          fn('tool.call', async ($) => {
            $.ui.log('x');
            return await NEVER();
          }),
        ],
        { 'ui.log': () => (logged += 1) },
      );
      let done = false;
      const pending = h.fire('tool.call', { n: 1 }).then(() => (done = true));
      await flush();
      expect(logged).toBe(1);
      h.clock.advance(9999);
      await flush();
      expect(done).toBe(false);
      h.clock.advance(1);
      await pending;
      expect(h.reports.map((report) => report.reason)).toEqual([
        'timed out: ran over its 10000 ms limit',
      ]);
    });
  });

  spec('mods.hookArgument.next.budget', () => {
    test("ms is the whole limit and remainingMs is what is left now, counting only the hook's own time", async () => {
      const h = harness();
      const seen: number[] = [];
      let read = deferred();
      h.mod(
        'my-mod',
        'user',
        [
          fn('tool.call', async ($, e, next) => {
            seen.push(next.budget.ms, next.budget.remainingMs);
            await $.clock.sleep(3000);
            seen.push(next.budget.remainingMs);
            await $.fs.read('slow');
            seen.push(next.budget.remainingMs);
            return next(e);
          }),
        ],
        {
          'clock.sleep': (ms) => h.clock.sleep(Number(ms)),
          'fs.read': () => (read = deferred()).promise,
        },
      );
      const pending = h.fire('tool.call');
      await flush();
      h.clock.advance(3000);
      await flush();
      h.clock.advance(20_000);
      read.resolve();
      await pending;
      expect(seen).toEqual([10_000, 10_000, 7000, 7000]);
    });

    test('a prompt.edit hook has 50 ms, and a .catch handler 1000 ms', async () => {
      const h = harness();
      const seen: number[] = [];
      h.mod('edit', 'user', [
        fn('prompt.edit', (_$, e, next) => (seen.push(next.budget.ms), next(e))),
      ]);
      h.mod('guard', 'user', [
        fn('tool.call', () => Promise.reject(new Error('x')), {
          handler: (_$, e, next) => (seen.push(next.budget.ms), next(e)),
        }),
      ]);
      await h.fire('prompt.edit');
      await h.fire('tool.call');
      expect(seen).toEqual([50, 1000]);
    });
  });
});

describe("a .catch handler's time", () => {
  spec('mods.limit..catch', () => {
    test('1 second: a handler still running at 1 second is skipped, and the hook is skipped with it', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [
        fn('tool.call', () => Promise.reject(new Error('x')), { handler: NEVER }),
      ]);
      let result: unknown;
      const pending = h.fire('tool.call', { n: 1 }).then((answer) => (result = answer));
      await flush();
      h.clock.advance(999);
      await flush();
      expect(result).toBeUndefined();
      h.clock.advance(1);
      await pending;
      expect(result).toEqual({ core: { n: 1 } });
      expect(h.reports.map((report) => report.reason)).toEqual(['threw Error: x']);
    });

    test("time inside the handler's next and mods API calls is not counted", async () => {
      const h = harness();
      const read = deferred();
      h.mod(
        'my-mod',
        'user',
        [
          fn('tool.call', () => Promise.reject(new Error('x')), {
            handler: async ($, e, next) => {
              await $.fs.read('x');
              return next(e);
            },
          }),
        ],
        { 'fs.read': () => read.promise },
      );
      const pending = h.fire('tool.call', { n: 1 });
      await flush();
      h.clock.advance(5000);
      read.resolve();
      expect(await pending).toEqual({ core: { n: 1 } });
      expect(h.reports).toEqual([]);
    });
  });
});
