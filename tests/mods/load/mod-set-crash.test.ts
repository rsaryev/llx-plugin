/**
 * Judgments of how the mod set copes with the worker's stops (spec/judgments.md): a stop that comes
 * while another change to the set is running waits for it, a mod that is gone is forgotten by the
 * replay ledger, and a mod the loader cannot make a fresh copy of says so.
 */
import { describe, expect, test } from 'bun:test';
import { restartMod, type LoadedMod } from '../../../src/mods/load/loader.ts';
import { flush } from '../../support/mods-chain.ts';
import { crashSession } from '../../support/mods-crash.ts';
import { inline, modPlugin, registerOf } from '../../support/mods-load.ts';
import { modSetOf } from '../../support/mods-set.ts';
import type { ModsApi } from '../../../src/mods/types.ts';

const untraced = { reason: 'the worker stopped responding' };

/** A mod whose `evaluation`-th evaluation waits for the test: its hook counts how often it ran. */
function slowAt(evaluation: number) {
  const state = { evaluations: 0, ran: 0, release: (): void => undefined };
  const held = new Promise<void>((resolve) => {
    state.release = resolve;
  });
  const register = registerOf(async (on) => {
    state.evaluations += 1;
    if (state.evaluations === evaluation) await held;
    on('tool.call', (_$: ModsApi, e: unknown, next: (e: unknown) => Promise<unknown>) => {
      state.ran += 1;
      return next(e);
    });
  });
  return { state, register };
}

describe('one change to the set at a time', () => {
  test('a stop that comes during reload() is handled after the reload: the reloaded mod gets its fresh copy', async () => {
    const { state, register } = slowAt(2);
    const s = crashSession({ 'first-mod': register });
    await s.host.load([modPlugin(inline('first-mod'), register)]);
    const reloading = s.host.reload();
    await flush();
    const stopping = s.worker.crash(untraced);
    state.release();
    await reloading;
    await stopping;
    expect(s.worker.loads.get('first-mod')).toBe(3);
    expect(s.host.active().map((mod) => mod.name)).toEqual(['first-mod']);
  });

  test('two stops in a row: the second, traced to a mod whose fresh copy is being made, unloads that copy', async () => {
    const { state, register } = slowAt(2);
    const s = crashSession({ 'first-mod': register });
    await s.host.load([modPlugin(inline('first-mod'), register)]);
    const first = s.worker.crash(untraced);
    await flush();
    const second = s.worker.crash({ reason: 'blocked', culprit: 'first-mod' });
    state.release();
    await first;
    await second;
    expect(s.host.active()).toEqual([]);
    await s.host.fire('tool.call', { tool: 'Bash' });
    expect(state.ran).toBe(0);
    expect(s.notices.map((notice) => notice.line)).toContain(
      'first-mod was unloaded: it crashed the hooks worker',
    );
  });
});

describe('a mod that is gone is forgotten by the replay ledger', () => {
  const quiet = () => registerOf(() => undefined);

  test('unloadMod forgets the mod, and a name that was not loaded too', async () => {
    const register = quiet();
    const { set, forgotten } = modSetOf({ 'first-mod': register });
    await set.load([modPlugin(inline('first-mod'), register)]);
    expect(await set.unloadMod('first-mod')).toBe(true);
    expect(forgotten).toEqual(['first-mod']);
  });

  test('a stop traced to a mod forgets it, and the mods that get a fresh copy are kept', async () => {
    const [first, second] = [quiet(), quiet()];
    const { set, forgotten } = modSetOf({ 'first-mod': first, 'second-mod': second });
    await set.load([
      modPlugin(inline('first-mod'), first),
      modPlugin(inline('second-mod'), second),
    ]);
    await set.crashed({ reason: 'blocked', culprit: 'first-mod' });
    expect(forgotten).toEqual(['first-mod']);
  });

  test('the third untraced stop forgets every mod it unloads', async () => {
    const [first, second] = [quiet(), quiet()];
    const { set, forgotten } = modSetOf({ 'first-mod': first, 'second-mod': second });
    await set.load([
      modPlugin(inline('first-mod'), first),
      modPlugin(inline('second-mod'), second),
    ]);
    for (let stop = 0; stop < 3; stop += 1) await set.crashed(untraced);
    expect(forgotten.toSorted()).toEqual(['first-mod', 'second-mod']);
  });
});

describe('a fresh copy of a mod the loader does not know', () => {
  test('says the module did not load, and the mod stays off', async () => {
    const register = registerOf(() => undefined);
    const { env } = modSetOf({ 'first-mod': register });
    const stranger: LoadedMod = {
      id: 'first-mod@inline',
      name: 'first-mod',
      tier: 'user',
      isBuiltin: false,
      hooks: [],
      uses: { events: [], calls: [], envReads: [], envWrites: [], stateReads: [], stateWrites: [] },
      unload: () => Promise.resolve(),
    };
    const outcome = await restartMod(
      env,
      stranger,
      { candidate: inline('first-mod'), tier: 'user' },
      (mod) => mod.unload(),
    );
    expect(outcome.mod).toBeUndefined();
    expect(outcome.kind).toBe('did-not-load');
    expect(outcome.line).toBe(
      'first-mod: hooks module did not load: the module it was loaded from is not known',
    );
  });
});
