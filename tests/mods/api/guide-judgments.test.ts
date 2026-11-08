/**
 * What the kit decides where the docs are silent about state, the store and the notices of a stopped
 * session (spec/judgments.md). None of these is under `spec(...)`: a judgment is never compatibility.
 */
import { describe, expect, test } from 'bun:test';
import type { JsonObject } from '../../../src/foundation/index.ts';
import { atom, read, update } from '../../../src/mods/api/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { flush } from '../../support/mods-chain.ts';
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
