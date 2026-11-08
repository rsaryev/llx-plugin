/**
 * A hook that fails, and the `.catch` handler that answers in its place.
 * plugins/mods/events.md § Handle a hook that fails; plugins/mods/reference.md § The hook function
 * (`next.error`, `next.error.cause`, `next.called`).
 */
import { describe, expect, test } from 'bun:test';
import type { HookFailure } from '../../../src/protocol/mods-events.ts';
import { fn, flush, harness, record, type Ev } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

const failing =
  (message = 'boom') =>
  (): Promise<never> =>
    Promise.reject(new Error(message));

const guard = () =>
  fn('tool.call', async () => failing()(), {
    matcher: { tool: 'Bash' },
    handler: (_$, e, next) => {
      if (next.called) return next(e);
      return Promise.resolve({
        deny: `The command guard failed, so this command was not run: ${next.error.kind}`,
      });
    },
  });

describe('a hook that fails and has no handler (events.md § Handle a hook that fails)', () => {
  test('before calling next: Claude Code skips it, the next handler runs in its place, and one line names the mod, the event and the reason', async () => {
    const h = harness();
    h.mod('my-mod', 'user', [fn('tool.call', failing())]);
    const result = await h.fire('tool.call', { tool: 'Bash' });
    expect(result).toEqual({ core: { tool: 'Bash' } });
    expect(h.reports.map((report) => report.line)).toEqual([
      'my-mod: tool.call hook skipped: threw Error: boom',
    ]);
  });

  test('after next resolved: that result stands and nothing runs a second time', async () => {
    const h = harness();
    h.mod('my-mod', 'user', [
      fn('tool.call', async (_$, e, next) => {
        await next(e);
        throw new Error('late');
      }),
    ]);
    const result = await h.fire('tool.call', { tool: 'Bash' });
    expect(result).toEqual({ core: { tool: 'Bash' } });
    expect(h.coreSeen).toHaveLength(1);
    expect(h.reports).toHaveLength(1);
  });

  // The chain has no shape table of its own yet: the table of what each event answers lands with the
  // events part of mods, so this test injects the check the chain takes (`shapeProblem`).
  test('a result of the wrong shape counts as a failure (with an injected shape check until the events part lands)', async () => {
    const h = harness((event, result) =>
      typeof result === 'object' && result !== null && 'deny' in result
        ? undefined
        : `${event} wants { deny }`,
    );
    h.mod('my-mod', 'user', [fn('tool.call', () => Promise.resolve('nonsense'))]);
    const result = await h.fire('tool.call', {});
    expect(result).toEqual({ core: {} });
    expect(h.reports[0]?.reason).toContain('tool.call wants { deny }');
  });

  test('a failure after next stands even when the hook returned a result of the wrong shape', async () => {
    const h = harness(() => 'wrong shape');
    h.mod('my-mod', 'user', [fn('tool.call', async (_$, e, next) => (await next(e), 'nonsense'))]);
    expect(await h.fire('tool.call', {})).toEqual({ core: {} });
    expect(h.coreSeen).toHaveLength(1);
  });
});

describe('the .catch handler', () => {
  spec(['mods.hookArgument.next.error', 'mods.hookArgument.next.called'], () => {
    test('guard failed before it called next: the handler answers, the command does not run, and next.called is false', async () => {
      const h = harness();
      h.mod('my-mod', 'user', [guard()]);
      const result = await h.fire('tool.call', { tool: 'Bash' });
      expect(result).toEqual({
        deny: 'The command guard failed, so this command was not run: throw',
      });
      expect(h.coreSeen).toEqual([]);
      expect(h.reports).toEqual([]);
    });

    test("guard failed after it called next: the handler's next(e) resolves to the result guard's call produced, without running the command again", async () => {
      const h = harness();
      h.mod('my-mod', 'user', [
        fn(
          'tool.call',
          async (_$, e, next) => {
            await next(e);
            throw new Error('late');
          },
          {
            handler: async (_$, e, next) => {
              const called = next.called;
              const result = record(await next(e));
              return { ...result, called };
            },
          },
        ),
      ]);
      const result = await h.fire('tool.call', { tool: 'Bash' });
      expect(result).toEqual({ core: { tool: 'Bash' }, called: true });
      expect(h.coreSeen).toHaveLength(1);
    });

    test("the handler's next(e) runs what follows when guard never called it, and that call stands if the handler then fails", async () => {
      const h = harness();
      h.mod('my-mod', 'user', [
        fn('tool.call', failing(), {
          handler: async (_$, e, next) => {
            await next(e);
            throw new Error('handler failed after next');
          },
        }),
      ]);
      expect(await h.fire('tool.call', { n: 1 })).toEqual({ core: { n: 1 } });
      expect(h.coreSeen).toHaveLength(1);
    });

    test("next.error says why: kind throw with the error's text, or timeout", async () => {
      const h = harness();
      const seen: HookFailure[] = [];
      const calls: boolean[] = [];
      const handler = (
        _$: unknown,
        e: Ev,
        next: { error: HookFailure; called: boolean },
      ): Promise<unknown> => {
        seen.push(next.error);
        calls.push(next.called);
        return Promise.resolve({ handled: e.n });
      };
      h.mod('thrower', 'user', [fn('a.event', failing('kaboom'), { handler })]);
      h.mod('sleeper', 'user', [fn('b.event', () => new Promise(() => undefined), { handler })]);
      await h.fire('a.event', { n: 1 });
      const pending = h.fire('b.event', { n: 2 });
      await flush();
      h.clock.advance(10_000);
      await pending;
      expect(seen.map(({ kind, message }) => ({ kind, message }))).toEqual([
        { kind: 'throw', message: 'kaboom' },
        { kind: 'timeout', message: 'ran over its 10000 ms limit' },
      ]);
      expect(calls).toEqual([false, false]);
    });

    test("in a hook's own next there is no error and no called: they exist only in a .catch handler", async () => {
      const h = harness();
      let keys: [boolean, boolean] | undefined;
      h.mod('my-mod', 'user', [
        fn('tool.call', (_$, e, next) => ((keys = ['error' in next, 'called' in next]), next(e))),
      ]);
      await h.fire('tool.call');
      expect(keys).toEqual([false, false]);
    });

    test("the handler's error gets no cause when the hook threw or timed out", async () => {
      const h = harness();
      let keys: string[] | undefined;
      h.mod('my-mod', 'user', [
        fn('tool.call', failing(), {
          handler: (_$, e, next) => ((keys = Object.keys(next.error)), Promise.resolve(e)),
        }),
      ]);
      await h.fire('tool.call');
      expect(keys).toEqual(['kind', 'message']);
    });
  });

  test('a handler that throws or times out is skipped as if the hook had no handler', async () => {
    const h = harness();
    h.mod('my-mod', 'user', [fn('tool.call', failing(), { handler: failing('handler broke') })]);
    expect(await h.fire('tool.call', { n: 1 })).toEqual({ core: { n: 1 } });
    expect(h.reports.map((report) => report.line)).toEqual([
      'my-mod: tool.call hook skipped: threw Error: boom',
    ]);
  });
});

describe('re-entry (reference.md § The hook function)', () => {
  spec(['mods.hookArgument.next.error', 'mods.hookArgument.next.error.cause'], () => {
    test('a hook is skipped when the event came from a mods API call by its own mod, and its handler is asked with kind re-entry', async () => {
      const h = harness();
      const seen: HookFailure[] = [];
      let ownRuns = 0;
      h.mod('my-mod', 'user', [
        fn('tool.call', (_$, e, next) => ((ownRuns += 1), next(e)), {
          handler: (_$, e, next) => (seen.push(next.error), next(e)),
        }),
      ]);
      let otherRuns = 0;
      h.mod('other-mod', 'user', [fn('tool.call', (_$, e, next) => ((otherRuns += 1), next(e)))]);
      const result = await h.fire('tool.call', { tool: 'Bash' }, { reentry: { plugin: 'my-mod' } });
      expect(ownRuns).toBe(0);
      expect(otherRuns).toBe(1);
      expect(seen.map((failure) => failure.kind)).toEqual(['re-entry']);
      expect(result).toEqual({ core: { tool: 'Bash' } });
    });

    test('next.error.cause is lent unless rewritten also applies: rewritten wins, lent alone is lent, neither is none', async () => {
      const flags = [
        { rewritten: true, lent: true },
        { rewritten: true, lent: false },
        { rewritten: false, lent: true },
        {},
      ];
      const causes: unknown[] = [];
      for (const given of flags) {
        const h = harness();
        h.mod('my-mod', 'user', [
          fn('tool.call', (_$, e, next) => next(e), {
            handler: (_$, e, next) => (causes.push(next.error.cause), next(e)),
          }),
        ]);
        await h.fire('tool.call', {}, { reentry: { plugin: 'my-mod', ...given } });
      }
      expect(causes).toEqual(['rewritten', 'rewritten', 'lent', undefined]);
    });
  });

  test('a hook skipped for re-entry with no handler is skipped quietly (judgment)', async () => {
    const h = harness();
    h.mod('my-mod', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
    await h.fire('tool.call', {}, { reentry: { plugin: 'my-mod' } });
    expect(h.reports).toEqual([]);
  });
});

test('a hook that fails has its signal aborted, so the background work it started stops (judgment)', async () => {
  const h = harness();
  let signal: AbortSignal | undefined;
  h.mod('my-mod', 'user', [
    fn('tool.call', (_$, _e, next) => {
      signal = next.signal;
      return Promise.reject(new Error('boom'));
    }),
  ]);
  await h.fire('tool.call');
  expect(signal?.aborted).toBe(true);
});
