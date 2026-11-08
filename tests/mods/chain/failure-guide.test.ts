/**
 * plugins/mods/events.md § Handle a hook that fails, one requirement at a time. The failures are the
 * three ways a hook fails (a throw, a timeout, a result of the wrong shape) and the `.catch` handler of
 * the page's example.
 */

import { describe, expect, test } from 'bun:test';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { fn, flush, record } from '../../support/mods-chain.ts';
import { eventHarness } from '../../support/mods-events.ts';
import {
  installed,
  managed,
  modPlugin,
  organizations,
  registerOf,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const failing =
  (message = 'boom') =>
  (): Promise<never> =>
    Promise.reject(new Error(message));

/**
 * events.md § Handle a hook that fails, one requirement at a time, through the event rules of the
 * events part (so a result of the wrong shape is a failure) and the three ways a hook fails.
 */
describe('handle a hook that fails (events.md)', () => {
  const typed = () => eventHarness();

  /** Each way a hook can fail before it calls `next`. */
  const FAILURES: readonly {
    readonly way: string;
    readonly hook: () => Promise<unknown>;
    readonly line: string;
    readonly advance?: number;
  }[] = [
    {
      way: 'throws',
      hook: failing(),
      line: 'my-mod: tool.call hook skipped: threw Error: boom',
    },
    {
      way: 'times out',
      hook: () => new Promise(() => undefined),
      line: 'my-mod: tool.call hook skipped: timed out: ran over its 10000 ms limit',
      advance: 10_000,
    },
    {
      way: 'returns a result of the wrong shape',
      hook: () => Promise.resolve({ deny: 42 }),
      line: 'my-mod: tool.call hook skipped: returned the wrong shape (tool.call result: deny: Invalid input: expected string, received number)',
    },
  ];

  spec('mods.events.Handle a hook that fails.It failed before calling next', () => {
    for (const failure of FAILURES) {
      test(`a hook that ${failure.way} is skipped: the next handler runs in its place, and one line names the mod, the event and the reason`, async () => {
        const h = typed();
        const next: unknown[] = [];
        h.mod('my-mod', 'user', [fn('tool.call', failure.hook)]);
        h.mod('later-mod', 'user', [fn('tool.call', (_$, e, n) => (next.push(e), n(e)))]);
        const pending = h.fire('tool.call', { tool: 'Bash' });
        await flush();
        if (failure.advance) h.clock.advance(failure.advance);
        expect(await pending).toEqual({ core: { tool: 'Bash' } });
        expect(next).toEqual([{ tool: 'Bash' }]);
        expect(h.reports.map((report) => report.line)).toEqual([failure.line]);
      });
    }
  });

  spec('mods.events.Handle a hook that fails.It failed after next resolved', () => {
    test('that result stands, and nothing runs a second time: not the hooks after it, and not Claude Code', async () => {
      const h = typed();
      const runs: string[] = [];
      h.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          await next(e);
          throw new Error('late');
        }),
      ]);
      h.mod('later-mod', 'user', [fn('tool.call', (_$, e, next) => (runs.push('later'), next(e)))]);
      const result = await h.fire(
        'tool.call',
        { tool: 'Bash' },
        {
          core: (e) => (runs.push('core'), Promise.resolve({ ran: record(e).tool })),
        },
      );
      expect(result).toEqual({ ran: 'Bash' });
      expect(runs).toEqual(['later', 'core']);
      expect(h.reports.map((report) => report.line)).toEqual([
        'my-mod: tool.call hook skipped: threw Error: late',
      ]);
    });

    test('a result of the wrong shape after next stands on what next gave, as does a timeout', async () => {
      const wrong = typed();
      wrong.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => (await next(e), { deny: 42 })),
      ]);
      expect(await wrong.fire('tool.call', { tool: 'Bash' })).toEqual({ core: { tool: 'Bash' } });
      expect(wrong.coreSeen).toHaveLength(1);
      const slow = typed();
      slow.mod('my-mod', 'user', [
        fn('tool.call', async (_$, e, next) => {
          await next(e);
          return new Promise(() => undefined);
        }),
      ]);
      const pending = slow.fire('tool.call', { tool: 'Bash' });
      await flush();
      slow.clock.advance(10_000);
      expect(await pending).toEqual({ core: { tool: 'Bash' } });
      expect(slow.coreSeen).toHaveLength(1);
    });
  });

  /** The guard of events.md, with the `.catch` handler that makes it fail closed. */
  const failClosed = (hook: () => Promise<unknown>) =>
    fn('tool.call', hook, {
      matcher: { tool: 'Bash' },
      handler: (_$, e, next) => {
        if (next.called) return next(e);
        return Promise.resolve({
          deny: 'The command guard failed, so this command was not run: ' + next.error.kind,
        });
      },
    });

  spec('mods.events.Handle a hook that fails.guard failed before it called next', () => {
    test('the command does not run, and Claude reads the deny text with the kind at the end: throw', async () => {
      const h = typed();
      h.mod('guard-mod', 'user', [failClosed(failing())]);
      const result = await h.fire('tool.call', { tool: 'Bash', command: 'ls' });
      expect(result).toEqual({
        deny: 'The command guard failed, so this command was not run: throw',
      });
      expect(h.coreSeen).toEqual([]);
    });

    test('and timeout, when guard ran out of time', async () => {
      const h = typed();
      h.mod('guard-mod', 'user', [failClosed(() => new Promise(() => undefined))]);
      const pending = h.fire('tool.call', { tool: 'Bash', command: 'ls' });
      await flush();
      h.clock.advance(10_000);
      expect(await pending).toEqual({
        deny: 'The command guard failed, so this command was not run: timeout',
      });
      expect(h.coreSeen).toEqual([]);
    });

    test('the handler has a shorter time limit of its own; when it throws or times out, the hook is skipped as if it had no handler and the command goes on', async () => {
      const throwing = typed();
      throwing.mod('guard-mod', 'user', [
        fn('tool.call', failing(), { handler: failing('handler broke') }),
      ]);
      expect(await throwing.fire('tool.call', { tool: 'Bash' })).toEqual({
        core: { tool: 'Bash' },
      });
      const slow = typed();
      slow.mod('guard-mod', 'user', [
        fn('tool.call', failing(), { handler: () => new Promise(() => undefined) }),
      ]);
      const pending = slow.fire('tool.call', { tool: 'Bash' });
      await flush();
      slow.clock.advance(MOD_LIMITS.catchMs);
      expect(await pending).toEqual({ core: { tool: 'Bash' } });
      expect(MOD_LIMITS.catchMs).toBeLessThan(MOD_LIMITS.hookMs);
    });
  });

  spec('mods.events.Handle a hook that fails.guard failed after it called next', () => {
    test("the handler's next(e) resolves to the result guard's call produced, without running the command again, and Claude reads that result", async () => {
      let runs = 0;
      const late = typed();
      late.mod('guard-mod', 'user', [
        fn(
          'tool.call',
          async (_$, e, next) => {
            await next(e);
            throw new Error('after next');
          },
          {
            matcher: { tool: 'Bash' },
            handler: (_$, e, next) => {
              if (next.called) return next(e);
              return Promise.resolve({ deny: 'not reached' });
            },
          },
        ),
      ]);
      const result = await late.fire(
        'tool.call',
        { tool: 'Bash', command: 'ls' },
        {
          core: () => {
            runs += 1;
            return Promise.resolve({ stdout: `run ${runs}` });
          },
        },
      );
      expect(result).toEqual({ stdout: 'run 1' });
      expect(runs).toBe(1);
    });
  });

  spec('mods.events.Handle a hook that fails.plugin.register', () => {
    const user = registerOf((on) => {
      on('tool.call', () => ({ result: 'x' }));
    });
    const failingAfterNext = (handler: unknown) =>
      registerOf((on) => {
        on(
          'plugin.register',
          async (_$: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => {
            await next(e);
            throw new Error('late failure');
          },
        ).catch(handler);
      });

    test('a refusal returned after next resolved still holds, without testing next.called', async () => {
      const acme = failingAfterNext(() => ({ refuse: 'Acme policy check failed' }));
      const s = session(
        { 'acme-guard': acme, runner: user },
        { policy: managed({ prependPlugins: ['acme-guard@acme-tools'] }) },
      );
      const report = await s.host.load([
        modPlugin(organizations('acme-guard'), acme),
        modPlugin(installed('runner'), user),
      ]);
      expect(report.lines).toEqual(['runner: refused by acme-guard: Acme policy check failed']);
      expect(report.loaded.map((mod) => mod.name)).toEqual(['acme-guard']);
    });

    test('a handler that answers with next(e) after next resolved lets the mod load', async () => {
      const acme = failingAfterNext(
        (_$: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => next(e),
      );
      const s = session(
        { 'acme-guard': acme, runner: user },
        { policy: managed({ prependPlugins: ['acme-guard@acme-tools'] }) },
      );
      const report = await s.host.load([
        modPlugin(organizations('acme-guard'), acme),
        modPlugin(installed('runner'), user),
      ]);
      expect(report.lines).toEqual([]);
      expect(report.loaded.map((mod) => mod.name)).toEqual(['acme-guard', 'runner']);
    });
  });
});
