/**
 * The time all `session.end` hooks share. plugins/mods/reference.md § Limits ("All `session.end`
 * hooks together"); plugins/mods/hooks.md gives the SessionEnd budget this follows.
 */
import { describe, expect, test } from 'bun:test';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { consume, flush, fn, harness } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

const NEVER = (): Promise<never> => new Promise(() => undefined);

const sleeper = (name: string, h: ReturnType<typeof harness>) =>
  h.mod(
    name,
    'user',
    [
      fn('session.end', async ($, e, next) => {
        await $.clock.sleep(1000);
        return next(e);
      }),
    ],
    { 'clock.sleep': (ms) => h.clock.sleep(Number(ms)) },
  );

describe('all session.end hooks together', () => {
  spec('mods.limit.session.end', () => {
    test('1.5 seconds by default, counted over all the hooks: the one running when it is spent is skipped', async () => {
      const h = harness();
      sleeper('first', h);
      sleeper('second', h);
      let done = false;
      const pending = h.fire('session.end', { reason: 'clear' }).then(() => (done = true));
      await flush();
      h.clock.advance(1000);
      await flush();
      expect(done).toBe(false);
      h.clock.advance(499);
      await flush();
      expect(done).toBe(false);
      h.clock.advance(1);
      await pending;
      expect(h.coreSeen).toEqual([{ reason: 'clear' }]);
      expect(h.reports.map((report) => report.plugin)).toEqual(['second']);
      expect(h.reports[0]?.reason).toContain('1500 ms they share');
      expect(MOD_LIMITS.sessionEndMs).toBe(1500);
    });

    test('a hook that starts after the budget is spent does not run (judgment)', async () => {
      const h = harness();
      let ran = false;
      sleeper('first', h);
      h.mod('late', 'user', [fn('session.end', (_$, e, next) => ((ran = true), next(e)))]);
      const pending = h.fire('session.end', {}, { groupMs: 500 });
      await flush();
      h.clock.advance(500);
      await pending;
      expect(ran).toBe(false);
      expect(h.coreSeen).toHaveLength(1);
    });

    test('a hook whose time ran out with the shared budget is not asked for its handler (judgment)', async () => {
      const h = harness();
      let asked = false;
      h.mod(
        'slow',
        'user',
        [
          fn(
            'session.end',
            async ($) => {
              await $.clock.sleep(1000);
              return await NEVER();
            },
            {
              handler: (_$, e) => ((asked = true), Promise.resolve(e)),
            },
          ),
        ],
        { 'clock.sleep': (ms) => h.clock.sleep(Number(ms)) },
      );
      const pending = h.fire('session.end', {}, { groupMs: 500 });
      await flush();
      h.clock.advance(500);
      await flush();
      h.clock.advance(500);
      await pending;
      expect(asked).toBe(false);
      expect(h.reports).toHaveLength(1);
    });

    test('the shared budget is counted from the first hook that has the floor, not from when the event is created (judgment)', async () => {
      const h = harness();
      sleeper('first', h);
      const stream = h.fireStream('session.end', {});
      h.clock.advance(60_000);
      const pending = consume(stream);
      await flush();
      h.clock.advance(1000);
      await pending;
      expect(h.reports).toEqual([]);
    });

    test("time a hook spends inside next is not counted against the shared budget, Claude Code's own work included (judgment)", async () => {
      const h = harness();
      h.mod('my-mod', 'user', [fn('session.end', (_$, e, next) => next(e))]);
      const gate = Promise.withResolvers<string>();
      const pending = h.fire('session.end', {}, { core: () => gate.promise });
      await flush();
      h.clock.advance(3_600_000);
      gate.resolve('flushed');
      expect(await pending).toBe('flushed');
      expect(h.reports).toEqual([]);
    });

    test('a longer budget the host passes, as when settings give SessionEnd hooks more time, lets them finish', async () => {
      const h = harness();
      sleeper('first', h);
      sleeper('second', h);
      const pending = h.fire('session.end', {}, { groupMs: 5000 });
      await flush();
      h.clock.advance(1000);
      await flush();
      h.clock.advance(1000);
      await pending;
      expect(h.reports).toEqual([]);
    });

    test('the shared budget is not a limit of any other event', async () => {
      const h = harness();
      h.mod(
        'my-mod',
        'user',
        [
          fn('tool.call', async ($, e, next) => {
            await $.clock.sleep(1000);
            return next(e);
          }),
        ],
        { 'clock.sleep': (ms) => h.clock.sleep(Number(ms)) },
      );
      const pending = h.fire('tool.call');
      await flush();
      h.clock.advance(1000);
      await pending;
      expect(h.reports).toEqual([]);
    });
  });
});
