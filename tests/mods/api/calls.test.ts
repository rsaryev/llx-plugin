/**
 * Every mods API call is an event, and what a hook before the mod can do with it.
 * plugins/mods/reference.md § Mods API calls ("Every mods API method is also an event, named for
 * its namespace and method ... A hook on one intercepts calls from the mods that run after it, and
 * can return next(e), { deny: reason }, or { value }"); plugins/mods/test.md § Look up what a stub
 * returns (event fields, `{ value }`, `{ deny }` makes the call reject); plugins/mods/api.md §
 * Reach files, processes, and the network ("A mod earlier in the chain can observe, rewrite, or
 * refuse your call"); plugins/mods/events.md § Handle a hook that fails.
 */
import { describe, expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods, memoryStore } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';

describe('a mods API call is an event', () => {
  test('$ has every namespace of the reference, and each holds exactly its methods', async () => {
    const { api } = await apiHarness();
    expect(Object.keys(api)).toEqual(Object.keys(MODS_API));
    for (const [namespace, methods] of Object.entries(MODS_API)) {
      if (namespace === 'plugin') continue;
      expectMethods(Reflect.get(api, namespace), methods);
    }
  });

  test('a hook on the call sees the event with the call fields, and next(e) reaches the port', async () => {
    const seen: unknown[] = [];
    const store = memoryStore({ count: 7 });
    const h = await apiHarness({ ports: { store } });
    await h.mod('watcher', 'prepend', [fn('store.get', (_$, e, next) => (seen.push(e), next(e)))]);
    expect(await h.api.store.get('count')).toBe(7);
    expect(seen).toEqual([{ key: 'count' }]);
  });

  test('a hook can rewrite the call: the port gets the changed event', async () => {
    const store = memoryStore({ count: 7, other: 9 });
    const h = await apiHarness({ ports: { store } });
    await h.mod('rewriter', 'prepend', [
      fn('store.get', (_$, e, next) => next({ ...e, key: 'other' })),
    ]);
    expect(await h.api.store.get('count')).toBe(9);
  });

  test('a hook answers { value } and the port is never reached', async () => {
    const h = await apiHarness();
    await h.mod('stub', 'prepend', [fn('store.get', () => ({ value: 7 }))]);
    expect(await h.api.store.get('count')).toBe(7);
  });

  test('a hook answers { deny } and the call rejects naming the calling mod and the reason', async () => {
    const h = await apiHarness({ ports: { store: memoryStore() } });
    await h.mod('policy', 'prepend', [fn('store.get', () => ({ deny: 'no reading today' }))]);
    expect(await rejection(h.api.store.get('count'))).toContain(
      'my-mod: $.store.get: no reading today',
    );
  });

  test('a hook that answers a bare value is skipped like a failed hook, and the call goes on', async () => {
    const h = await apiHarness({ ports: { store: memoryStore({ count: 3 }) } });
    await h.mod('sloppy', 'prepend', [fn('store.get', () => 7)]);
    expect(await h.api.store.get('count')).toBe(3);
    expect(h.reports.map((report) => report.reason).join(' ')).toContain(
      'returned neither { value } nor { deny }',
    );
  });

  test('the mod own hooks on the event are skipped for its own call (re-entry)', async () => {
    const h = await apiHarness({ ports: { store: memoryStore({ count: 1 }) } });
    let reached = false;
    const mine = await h.mod('my-mod', 'user', [
      fn('store.get', (_$, e, next) => ((reached = true), next(e))),
    ]);
    expect(await mine.api.store.get('count')).toBe(1);
    expect(reached).toBe(false);
  });

  test('a port that fails rejects the call with its error', async () => {
    const env = {
      get: () => {
        throw new Error('boom');
      },
      set: () => undefined,
      snapshot: () => ({}),
    };
    const h = await apiHarness({ ports: { env } });
    expect(await rejection(h.api.env.get('HOME'))).toContain('boom');
  });
});
