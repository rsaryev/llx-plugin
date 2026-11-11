/**
 * What the kit decides where the docs are silent about state, the store and the notices of a stopped
 * session (spec/judgments.md). None of these is under `spec(...)`: a judgment is never compatibility.
 */
import { describe, expect, test } from 'bun:test';
import type { JsonObject } from '../../../src/foundation/index.ts';
import {
  atom,
  createRunGate,
  createStateStore,
  read,
  update,
} from '../../../src/mods/api/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { flush } from '../../support/mods-chain.ts';
import { numbers } from '../../support/mods-refusal.ts';
import { rejection } from '../../support/rejection.ts';

describe('a reset of $.state', () => {
  test('counts each value that was held as written, so a drawing that read it is drawn again and shows the default', async () => {
    const h = await apiHarness();
    const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0);
    await update(h.api, count, () => 9);
    const redraws: string[] = [];
    h.shared.state.onWrite((plugin, key) => redraws.push(`${plugin}.${key}`));
    h.shared.state.reset();
    expect(redraws).toEqual(['hello-tabs.count']);
    expect(await read(h.api, count)).toBe(0);
  });

  test('a listener that throws does not stop the others: each is told about each value, then the failure is reported', () => {
    const state = createStateStore();
    state.set({ plugin: 'hello-tabs', key: 'count' }, 1);
    state.set({ plugin: 'hello-tabs', key: 'tab' }, 'one');
    const told: string[] = [];
    state.onWrite((plugin, key) => {
      told.push(`broken:${plugin}.${key}`);
      throw new Error('redraw failed');
    });
    state.onWrite((plugin, key) => void told.push(`ok:${plugin}.${key}`));
    told.length = 0;
    // The broken listener fails once for each of the two values: both failures are reported together.
    expect(() => state.reset()).toThrow(AggregateError);
    expect(told).toEqual([
      'broken:hello-tabs.count',
      'ok:hello-tabs.count',
      'broken:hello-tabs.tab',
      'ok:hello-tabs.tab',
    ]);
    // The values are back to their defaults even though a listener failed.
    expect(state.get({ plugin: 'hello-tabs', key: 'count' })).toEqual({ version: 0 });
  });

  test('several listeners that throw are reported together', () => {
    const state = createStateStore();
    state.set({ plugin: 'hello-tabs', key: 'count' }, 1);
    state.onWrite(() => {
      throw new Error('first');
    });
    state.onWrite(() => {
      throw new Error('second');
    });
    const failure = (() => {
      try {
        state.reset();
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure instanceof AggregateError && failure.errors.map(String)).toEqual([
      'Error: first',
      'Error: second',
    ]);
  });

  test('tells nobody when no value was held', async () => {
    const h = await apiHarness();
    const redraws: string[] = [];
    h.shared.state.onWrite((plugin, key) => redraws.push(`${plugin}.${key}`));
    h.shared.state.reset();
    expect(redraws).toEqual([]);
  });
});

describe('changes to the store of one plugin', () => {
  /** A store whose every read and write takes a turn, counting how many changes were in flight at once. */
  function slowStore() {
    const data: Record<string, JsonObject> = {};
    const stats = { inFlight: 0, most: 0 };
    return {
      data,
      stats,
      read: async (plugin: string) => {
        stats.inFlight += 1;
        stats.most = Math.max(stats.most, stats.inFlight);
        await flush();
        return structuredClone(data[plugin] ?? {});
      },
      write: async (plugin: string, next: JsonObject) => {
        await flush();
        data[plugin] = next;
        stats.inFlight -= 1;
      },
    };
  }

  test('go one at a time for a plugin, and plugins do not wait for each other', async () => {
    const store = slowStore();
    const one = await apiHarness({ plugin: 'one', ports: { store } });
    const two = await apiHarness({ plugin: 'two', ports: { store } });
    await Promise.all([one.api.store.set('a', 1), one.api.store.set('b', 2)]);
    expect(store.stats.most).toBe(1);
    await Promise.all([one.api.store.set('c', 3), two.api.store.set('c', 4)]);
    expect(store.stats.most).toBe(2);
    expect(store.data).toEqual({ one: { a: 1, b: 2, c: 3 }, two: { c: 4 } });
  });

  test('a change that fails does not hold the ones behind it', async () => {
    const data: JsonObject = {};
    let failNext = true;
    const store = {
      read: () => Promise.resolve(structuredClone(data)),
      write: (_plugin: string, next: JsonObject) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error('disk full'));
        }
        Object.assign(data, next);
        return Promise.resolve();
      },
    };
    const h = await apiHarness({ ports: { store } });
    const failed = rejection(h.api.store.set('a', 1));
    await h.api.store.set('b', 2);
    expect(await failed).toContain('disk full');
    expect(data).toEqual({ b: 2 });
  });

  test('delete goes through the same turns as set', async () => {
    const store = slowStore();
    store.data.my = { a: 1, b: 2 };
    const h = await apiHarness({ plugin: 'my', ports: { store } });
    await Promise.all([h.api.store.delete('a'), h.api.store.set('c', 3)]);
    expect(store.data.my).toEqual({ b: 2, c: 3 });
  });
});

describe('held notices of a stopped session', () => {
  test('a notice whose delivery throws does not cost the ones held after it: the rest arrive, the session accepts input again, then the failure is reported', async () => {
    const gate = createRunGate(numbers().port);
    const reached: string[] = [];
    gate.interrupt();
    gate.notice('agent.finished', () => void reached.push('first'));
    gate.notice('monitor.ended', () => {
      throw new Error('delivery failed');
    });
    gate.notice('agent.finished', () => void reached.push('third'));
    expect(await rejection(gate.userInput())).toContain('delivery failed');
    expect(reached).toEqual(['first', 'third']);
    expect(await gate.refusal()).toBeUndefined();
    // Nothing is held any more: the next input delivers nothing twice.
    await gate.userInput();
    expect(reached).toEqual(['first', 'third']);
  });
});
