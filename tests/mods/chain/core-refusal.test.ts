/**
 * A hook that lets its `next(e)`'s rejection through. claude-code/index.d.ts:4204: "a hook that fails
 * (throws, overruns its budget …, answers a wrong shape) is skipped: the hooks beneath and core run
 * in its place, or its last `next` result stands; the failure is reported by name"; troubleshoot.md,
 * "`$.agent.register refused`": a hook that "doesn't catch the rejection, it fails and Claude Code
 * skips it". Judgment (spec/judgments.md): it stays a `throw` (its `.catch` handler answers), and
 * its line says that `next(e)` rejected and the hook did not catch it, not that the hook threw.
 */
import { describe, expect, test } from 'bun:test';
import { fn, harness } from '../../support/mods-chain.ts';

class GateBlocked extends Error {
  override name = 'PermissionGateBlockedError';
}

/** The message the call rejected with. */
const refusalOf = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => 'resolved',
    (error: unknown) => (error instanceof Error ? error.message : error),
  );

const refusing = () => Promise.reject(new GateBlocked('refused by the gate'));
const UNCAUGHT =
  'watcher: tool.call hook skipped: next(e) rejected and the hook did not catch it: PermissionGateBlockedError: refused by the gate';

describe("core's refusal through a hook that does not catch it", () => {
  test('the refusal reaches the caller; the line says the hook did not catch it', async () => {
    const h = harness();
    h.mod('watcher', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
    expect(await refusalOf(h.fire('tool.call', { tool: 'Bash' }, { core: refusing }))).toBe(
      'refused by the gate',
    );
    expect(h.reports.map((report) => [report.kind, report.line])).toEqual([['throw', UNCAUGHT]]);
  });

  test('an awaiting hook that rethrows it reads the same', async () => {
    const h = harness();
    h.mod('watcher', 'user', [
      fn('tool.call', (_$, e, next) =>
        next(e).catch((error: unknown) => {
          throw error;
        }),
      ),
    ]);
    expect(await refusalOf(h.fire('tool.call', { tool: 'Bash' }, { core: refusing }))).toBe(
      'refused by the gate',
    );
    expect(h.reports.map((report) => report.line)).toEqual([UNCAUGHT]);
  });

  test('its .catch handler still answers, reading the rejection on next.error', async () => {
    const h = harness();
    const read: unknown[] = [];
    h.mod('watcher', 'user', [
      fn('tool.call', (_$, e, next) => next(e), {
        handler: (_$, _e, next) => (read.push(next.error), Promise.resolve({ answered: true })),
      }),
    ]);
    expect(await h.fire('tool.call', { tool: 'Bash' }, { core: refusing })).toEqual({
      answered: true,
    });
    expect(read).toEqual([{ kind: 'throw', message: 'refused by the gate', budget: 1000 }]);
    expect(h.reports).toEqual([]);
  });

  test('a hook that throws its own error after the rejection reads as its own throw', async () => {
    const h = harness();
    h.mod('watcher', 'user', [
      fn('tool.call', async (_$, e, next) => {
        await next(e).catch(() => undefined);
        throw new Error('boom');
      }),
    ]);
    expect(await refusalOf(h.fire('tool.call', { tool: 'Bash' }, { core: refusing }))).toBe(
      'refused by the gate',
    );
    expect(h.reports.map((report) => report.line)).toEqual([
      'watcher: tool.call hook skipped: threw Error: boom',
    ]);
  });
});
