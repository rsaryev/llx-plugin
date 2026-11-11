/**
 * A hook that keeps running after its signal aborted. claude-code/index.d.ts:5428, `HookBudget.lingerMs`
 * (`5_000`): "How long a hook may keep running after `next.signal` aborted (the person interrupted,
 * a hook above settled first, its own budget ran out). Past it the hook is reported as lingering;
 * the dispatch had already gone on without it when the signal aborted." The line's words are the
 * kit's (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { deferred, flush, fn, harness } from '../../support/mods-chain.ts';

const NEVER = (): Promise<never> => new Promise(() => undefined);
const LINE = 'my-mod: tool.call hook lingering: still running 5000 ms after next.signal aborted';

describe('HookBudget.lingerMs (claude-code/index.d.ts:5428)', () => {
  test('a hook past its budget and still running 5 seconds later is reported as lingering', async () => {
    const h = harness();
    h.mod('my-mod', 'user', [fn('tool.call', NEVER)]);
    const answer = h.fire('tool.call', { n: 1 });
    await flush();
    h.clock.advance(MOD_LIMITS.hookMs);
    expect(await answer).toEqual({ core: { n: 1 } });
    h.clock.advance(MOD_LIMITS.lingerMs - 1);
    await flush();
    expect(h.reports.map((report) => report.kind)).toEqual(['timeout']);
    h.clock.advance(1);
    expect(h.reports.at(-1)).toEqual({
      plugin: 'my-mod',
      event: 'tool.call',
      kind: 'linger',
      reason: 'still running 5000 ms after next.signal aborted',
      line: LINE,
    });
    h.clock.advance(60_000);
    expect(h.reports.filter((report) => report.kind === 'linger')).toHaveLength(1);
  });

  test('the person interrupting starts the same timer', async () => {
    const h = harness();
    const person = new AbortController();
    const gate = deferred();
    h.mod('my-mod', 'user', [fn('tool.call', async () => (await gate.promise, { late: true }))]);
    void h.fire('tool.call', {}, { signal: person.signal }).catch(() => undefined);
    await flush();
    person.abort(new Error('interrupted'));
    h.clock.advance(MOD_LIMITS.lingerMs);
    expect(h.reports.map((report) => report.line)).toContain(LINE);
  });

  test('a hook that settles within the grace is not reported, and leaves no timer', async () => {
    const h = harness();
    const person = new AbortController();
    const gate = deferred();
    h.mod('my-mod', 'user', [fn('tool.call', async () => (await gate.promise, { late: true }))]);
    void h.fire('tool.call', {}, { signal: person.signal }).catch(() => undefined);
    await flush();
    person.abort(new Error('interrupted'));
    h.clock.advance(MOD_LIMITS.lingerMs - 1);
    gate.resolve();
    await flush();
    h.clock.advance(1);
    expect(h.reports.filter((report) => report.kind === 'linger')).toEqual([]);
    expect(h.clock.pending()).toBe(0);
  });

  test('a hook that settled before the abort is not watched', async () => {
    const h = harness();
    const person = new AbortController();
    h.mod('my-mod', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
    await h.fire('tool.call', {}, { signal: person.signal });
    person.abort();
    h.clock.advance(MOD_LIMITS.lingerMs);
    expect(h.reports).toEqual([]);
    expect(h.clock.pending()).toBe(0);
  });
});
