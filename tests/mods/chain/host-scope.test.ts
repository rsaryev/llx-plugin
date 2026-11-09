/**
 * What a host that keeps one chain for many mods needs of it (spec/judgments.md, "mods chain: host
 * scope"): the mods an event reaches (`only`), whether any mod hears it (`hears`), where a mod
 * stands in its tier (`position`) and the trace of a dispatch. The docs (plugins/mods/events.md,
 * "The order mods run in") give the order and nothing about these; all are judgments, tested outside
 * `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { DispatchTrace } from '../../../src/mods/trace-types.ts';
import { fn, gen, harness, type FnHook } from '../../support/mods-chain.ts';

const names =
  (seen: string[], name: string): FnHook =>
  (_$, e, next) => (seen.push(name), next(e));

const pass: FnHook = (_$, e, next) => next(e);

describe('only', () => {
  test('a set names the mods whose hooks handle the event, in chain order', async () => {
    const h = harness();
    const seen: string[] = [];
    for (const name of ['a', 'b', 'c']) h.mod(name, 'user', [fn('command.run', names(seen, name))]);
    await h.fire('command.run', {}, { only: new Set(['c', 'a']) });
    expect(seen).toEqual(['a', 'c']);
  });

  test('a name still names one mod, and none names every mod', async () => {
    const h = harness();
    const seen: string[] = [];
    for (const name of ['a', 'b']) h.mod(name, 'user', [fn('command.run', names(seen, name))]);
    await h.fire('command.run', {}, { only: 'b' });
    await h.fire('command.run');
    expect(seen).toEqual(['b', 'a', 'b']);
  });
});

describe('hears', () => {
  test('is true while a mod in the set has a hook for the event', () => {
    const h = harness();
    h.mod('a', 'user', [fn('command.run', pass)]);
    h.mod('b', 'user', [fn('tool.call', pass)]);
    expect(h.chain.hears('command.run')).toBe(true);
    expect(h.chain.hears('command.run', new Set(['a']))).toBe(true);
    expect(h.chain.hears('command.run', new Set(['b']))).toBe(false);
    expect(h.chain.hears('command.run', 'b')).toBe(false);
    expect(h.chain.hears('turn.start')).toBe(false);
  });

  test('counts a wildcard hook of the right form and forgets an unregistered mod', () => {
    const h = harness();
    h.mod('a', 'user', [fn('*', pass)]);
    h.mod('g', 'user', [
      gen('*', async function* (_$, e, next) {
        return yield* next(e);
      }),
    ]);
    expect(h.chain.hears('command.run')).toBe(true);
    expect(h.chain.hears('turn.step')).toBe(true);
    expect(h.chain.hears('command.run', 'g')).toBe(false);
    h.chain.unregister('a');
    expect(h.chain.hears('command.run')).toBe(false);
  });
});

describe('position', () => {
  test('mods run by position whenever they registered, those with none after them', async () => {
    const h = harness();
    const seen: string[] = [];
    const hook = (name: string) => [fn('command.run', names(seen, name))];
    h.modAt('late', 'user', 2, hook('late'));
    h.mod('plain', 'user', hook('plain'));
    h.modAt('early', 'user', 1, hook('early'));
    await h.fire('command.run');
    expect(seen).toEqual(['early', 'late', 'plain']);
  });

  test('a position never moves a mod across a tier', async () => {
    const h = harness();
    const seen: string[] = [];
    h.mod('app', 'append', [fn('command.run', names(seen, 'app'))]);
    h.modAt('usr', 'user', 9, [fn('command.run', names(seen, 'usr'))]);
    h.modAt('pre', 'prepend', 99, [fn('command.run', names(seen, 'pre'))]);
    await h.fire('command.run');
    expect(seen).toEqual(['pre', 'usr', 'app']);
  });

  test('a call by a mod reaches the mods before it by position', async () => {
    const h = harness();
    const seen: string[] = [];
    h.modAt('later', 'user', 2, [fn('command.run', names(seen, 'later'))]);
    h.modAt('earlier', 'user', 1, [fn('command.run', names(seen, 'earlier'))]);
    await h.chain.dispatch(
      'command.run',
      { command: 'x', args: '' },
      {
        origin: { plugin: 'earlier', tier: 'user' },
        caller: { plugin: 'earlier', tier: 'user' },
        signal: new AbortController().signal,
        core: () => Promise.resolve({}),
        report: () => undefined,
      },
    );
    expect(seen).toEqual(['earlier']);
  });
});

const traced = async (h: ReturnType<typeof harness>, core?: () => Promise<unknown>) => {
  const traces: DispatchTrace[] = [];
  await h
    .fire(
      'command.run',
      { command: 'x' },
      { trace: (trace) => traces.push(trace), ...(core ? { core } : {}) },
    )
    .catch(() => undefined);
  return traces;
};

describe('trace', () => {
  test('lists the hooks of the event and the steps: who passed, who answered', async () => {
    const h = harness();
    h.mod('first', 'user', [fn('command.run', pass)]);
    h.mod('second', 'user', [fn('command.run', () => ({ text: 'mine' }))]);
    h.mod('third', 'user', [fn('command.run', pass)]);
    const [trace] = await traced(h);
    expect(trace?.chain).toEqual(['first', 'second', 'third']);
    expect(trace?.steps.map((step) => [step.index, step.plugin, step.tier, step.outcome])).toEqual([
      [0, 'first', 'user', 'passed'],
      [1, 'second', 'user', 'returned'],
    ]);
    expect(trace?.steps[1]?.returned).toEqual({ text: 'mine' });
    expect(trace?.steps[0]?.received).toEqual({ command: 'x' });
  });

  test('Claude Code is the last step, after the index of the last hook', async () => {
    const h = harness();
    h.mod('first', 'user', [fn('command.run', pass)]);
    const [trace] = await traced(h);
    expect(trace?.steps.map((step) => [step.index, step.plugin, step.tier, step.outcome])).toEqual([
      [0, 'first', 'user', 'passed'],
      [1, 'engine', 'core', 'returned'],
    ]);
    expect(trace?.steps.every((step) => step.ms >= 0 && step.event === 'command.run')).toBe(true);
  });

  test('a hook that threw is no step; the trace still arrives when Claude Code fails', async () => {
    const h = harness();
    h.mod('bad', 'user', [
      fn('command.run', () => {
        throw new Error('boom');
      }),
    ]);
    const [trace] = await traced(h);
    expect(trace?.chain).toEqual(['bad']);
    expect(trace?.steps.map((step) => step.plugin)).toEqual(['engine']);
    const [failed] = await traced(h, () => Promise.reject(new Error('core failed')));
    expect(failed?.steps).toEqual([]);
  });

  test('is not built when nobody asks', async () => {
    const h = harness();
    h.mod('first', 'user', [fn('command.run', pass)]);
    expect(await h.fire('command.run')).toEqual({ core: {} });
  });
});
