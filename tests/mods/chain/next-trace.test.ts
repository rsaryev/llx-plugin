/**
 * Declarations 2.1.321 (AGENTS.md, E2a; spec/judgments.md, "next.event, next.is and next.trace"):
 * `Next` (claude-code/index.d.ts:6977) has `event`, the dispatch's event name (:7018), `is`, whether
 * a pattern selects it (:7013, `Selected` :11516), and `trace`, what settled beneath the hook on
 * its latest `next()` call, nearest first, the engine's last (:7039, `TraceEntry` :14799,
 * `TraceOutcome` :14851). The docs do not describe them.
 */
import { describe, expect, test } from 'bun:test';
import type { TraceEntry } from '../../../src/mods/trace-types.ts';
import { selects } from '../../../src/mods/chain/select.ts';
import { fn, harness, record } from '../../support/mods-chain.ts';

const brief = (trace: readonly TraceEntry[]): string[] =>
  trace.map(
    (one) =>
      `${one.index} ${one.plugin} ${one.tier} ${one.outcome}${one.reason ? ` (${one.reason})` : ''}`,
  );

describe('next.event and next.is', () => {
  test('next.event names the event, and next.is tests a name, a glob and a negation against it', async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.mod('one', 'user', [
      fn('tool.call', (_$, e, next) => {
        seen.push(next.event, next.is('tool.call', e), next.is('tool.*', e), next.is('!tool.*', e));
        seen.push(next.is('*', e), next.is('prompt.submit', e), next.is('!prompt.submit', e));
        return next(e);
      }),
    ]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual(['tool.call', true, true, false, true, false, true]);
  });

  test('a glob selects only the events under its namespace', () => {
    expect(selects('classic.*', 'classic.PreToolUse')).toBe(true);
    expect(selects('classic.*', 'classicx.y')).toBe(false);
    expect(selects('!*', 'tool.call')).toBe(false);
  });
});

describe('next.trace', () => {
  test('is empty before next, then lists every link beneath, nearest first, the engine last', async () => {
    const h = harness();
    const traces: string[][] = [];
    h.mod('top', 'user', [
      fn('tool.call', async (_$, e, next) => {
        traces.push(brief(next.trace));
        const out = await next(e);
        traces.push(brief(next.trace));
        return out;
      }),
    ]);
    h.mod('passer', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
    h.mod('answerer', 'append', [
      fn('tool.call', async (_$, e, next) => ({ ...record(await next(e)), by: 'a' })),
    ]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(traces).toEqual([
      [],
      ['1 passer user passed', '2 answerer append returned', '3 engine core returned'],
    ]);
  });

  test('names a link that failed before next skipped, one that failed after it kept, and a .catch answer caught', async () => {
    const h = harness();
    let seen: string[] = [];
    h.mod('top', 'user', [
      fn('tool.call', async (_$, e, next) => {
        const out = await next(e);
        seen = brief(next.trace);
        return out;
      }),
    ]);
    h.mod('thrower', 'user', [
      fn('tool.call', () => {
        throw new Error('before next');
      }),
    ]);
    h.mod('late', 'user', [
      fn('tool.call', async (_$, e, next) => {
        await next(e);
        throw new Error('after next');
      }),
    ]);
    h.mod('caught', 'append', [
      fn(
        'tool.call',
        () => {
          throw new Error('to the handler');
        },
        { handler: (_$, e, next) => next(e) },
      ),
    ]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual([
      '1 thrower user skipped',
      '2 late user kept',
      '3 caught append caught',
      '4 engine core returned',
    ]);
  });

  test('lists the links a next.to went beneath as skipped, by whom', async () => {
    const h = harness();
    let seen: string[] = [];
    h.mod('top', 'prepend', [
      fn('tool.call', async (_$, e, next) => {
        const out = await next.to(e, 'append');
        seen = brief(next.trace);
        return out;
      }),
    ]);
    h.mod('peer', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
    h.mod('below', 'append', [fn('tool.call', (_$, e, next) => next(e))]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual([
      '1 peer user skipped (bypassed by top)',
      '2 below append passed',
      '3 engine core returned',
    ]);
  });

  test('a prepend hook skips the prepend hooks below it with next.to(e, "user") (TargetTier, :13622)', async () => {
    const h = harness();
    let seen: string[] = [];
    h.mod('top', 'prepend', [
      fn('tool.call', async (_$, e, next) => {
        const out = await next.to(e, 'user');
        seen = brief(next.trace);
        return out;
      }),
    ]);
    h.mod('peer', 'prepend', [fn('tool.call', (_$, e, next) => next(e))]);
    h.mod('mine', 'user', [fn('tool.call', (_$, e, next) => next(e))]);
    await h.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual([
      '1 peer prepend skipped (bypassed by top)',
      '2 mine user passed',
      '3 engine core returned',
    ]);
  });

  test('is filled when next rejected, and frozen', async () => {
    const h = harness();
    let trace: readonly TraceEntry[] = [];
    h.mod('top', 'user', [
      fn('tool.call', async (_$, e, next) => {
        await next(e).catch(() => undefined);
        trace = next.trace;
        return {};
      }),
    ]);
    await h.fire(
      'tool.call',
      { tool: 'Bash' },
      { core: () => Promise.reject(new Error('core down')) },
    );
    expect(brief(trace)).toEqual(['1 engine core rejected']);
    expect(Object.isFrozen(trace) && Object.isFrozen(trace[0])).toBe(true);
  });
});
