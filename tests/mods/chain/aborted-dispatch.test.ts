/**
 * An event abandoned while its hooks hold it: Claude Code's own behaviour never runs for it.
 * claude-code/index.d.ts:6999 (`Next.signal`: "Aborts when the call this dispatch belongs to is
 * abandoned: the user interrupted, a hook above settled first"), :10821 (`ToolUse.isInterrupted`:
 * "an abort ... cut it while it ran, or dropped it before it ran"); spec/judgments.md
 * (`abortedCore`). Outside `spec(...)`: the declarations give it, the docs do not.
 */
import { describe, expect, test } from 'bun:test';
import { deferred, fn, harness } from '../../support/mods-chain.ts';
import { rejection } from '../../support/rejection.ts';

const stopped = (): {
  readonly stop: AbortController;
  readonly held: PromiseWithResolvers<void>;
} => ({
  stop: new AbortController(),
  held: deferred(),
});

describe('a dispatch whose signal aborted runs no core', () => {
  test('a guard holding tool.call fails after the stop: the tool does not run', async () => {
    const h = harness();
    const { stop, held } = stopped();
    h.mod('confirm', 'user', [
      fn('tool.call', async () => {
        await held.promise;
        throw new Error('the confirmation was cancelled');
      }),
    ]);
    const pending = h.fire('tool.call', { tool: 'Bash' }, { signal: stop.signal });
    stop.abort(new Error('the user stopped the turn'));
    held.resolve();
    expect(await rejection(pending)).toBe('the user stopped the turn');
    expect(h.coreSeen).toEqual([]);
    expect(h.reports.map((report) => report.line)).toEqual([
      'confirm: tool.call hook skipped: threw Error: the confirmation was cancelled',
    ]);
  });

  test('a guard that calls next after the stop: the tool does not run', async () => {
    const h = harness();
    const { stop, held } = stopped();
    h.mod('confirm', 'user', [
      fn('tool.call', async (_$, e, next) => {
        await held.promise;
        return next(e);
      }),
    ]);
    const pending = h.fire('tool.call', { tool: 'Bash' }, { signal: stop.signal });
    stop.abort(new Error('stopped'));
    held.resolve();
    expect(await rejection(pending)).toBe('stopped');
    expect(h.coreSeen).toEqual([]);
  });

  test('a .catch handler that passes the event on after the stop: the tool does not run', async () => {
    const h = harness();
    const { stop, held } = stopped();
    h.mod('confirm', 'user', [
      fn(
        'tool.call',
        async () => {
          await held.promise;
          throw new Error('boom');
        },
        { handler: (_$, e, next) => next(e) },
      ),
    ]);
    const pending = h.fire('tool.call', { tool: 'Bash' }, { signal: stop.signal });
    stop.abort(new Error('stopped'));
    held.resolve();
    expect(await rejection(pending)).toBe('stopped');
    expect(h.coreSeen).toEqual([]);
  });

  test('an event fired already aborted reaches no core, with or without hooks', async () => {
    const h = harness();
    const stop = new AbortController();
    stop.abort(new Error('gone'));
    expect(await rejection(h.fire('tool.call', { tool: 'Bash' }, { signal: stop.signal }))).toBe(
      'gone',
    );
    expect(h.coreSeen).toEqual([]);
  });

  test('a guard that fails while the call is live is skipped and the tool runs, as declared', async () => {
    const h = harness();
    h.mod('guard', 'user', [fn('tool.call', () => Promise.reject(new Error('boom')))]);
    expect(await h.fire('tool.call', { tool: 'Bash' })).toEqual({ core: { tool: 'Bash' } });
  });
});
