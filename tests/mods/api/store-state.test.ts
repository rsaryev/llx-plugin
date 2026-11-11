/** Also plugins/mods/api.md § Reach files, processes, and the network. */
/**
 * `$.store` and `$.state`.
 * plugins/mods/interface.md § Keep state (`$.store.get(key)` resolves to the value or `undefined`,
 * `$.store.set(key, value)` takes any JSON value; `$.state` holds values for the length of a session,
 * survives a reload of the module, and "a `ui.render` hook that reads a value subscribes to it, so
 * Claude Code redraws that site each time you write the value"; `atom`, `read`, `update`; "Those
 * commands reset every `$.state` value to its default"), § Save from more than one session ("A
 * `get` followed by a `set` isn't atomic"); plugins/mods/reference.md § Limits (`$.store`: 4 MiB of
 * JSON in total), § Mods API methods; plugins/mods/test.md § Look up what a stub returns
 * (`on('store.get', ($, e) => ({ value: saved.get(e.key) }))`).
 */
import { expect, test } from 'bun:test';
import { atom, createModsApi, read, update } from '../../../src/mods/api/index.ts';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods, memoryStore } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

spec(
  [
    'mods.api.$.store',
    'mods.apiGuide.Reach files, processes, and the network',
    'mods.apiGuide.Reach files, processes, and the network.$.store',
  ],
  () => {
    test('$.store has get, set, delete and keys', async () => {
      const { api } = await apiHarness({ ports: { store: memoryStore() } });
      expectMethods(api.store, MODS_API.store);
    });

    test('set takes any JSON value and get resolves to it, or to undefined for a key never set', async () => {
      const h = await apiHarness({ ports: { store: memoryStore() } });
      await h.api.store.set('count', 7);
      await h.api.store.set('notes', [{ text: 'a', done: false }]);
      expect(await h.api.store.get('count')).toBe(7);
      expect(await h.api.store.get('notes')).toEqual([{ text: 'a', done: false }]);
      expect(await h.api.store.get('missing')).toBeUndefined();
    });

    test('delete removes one key and keys lists the rest', async () => {
      const h = await apiHarness({ ports: { store: memoryStore({ a: 1, b: 2 }) } });
      expect(await h.api.store.keys()).toEqual(['a', 'b']);
      await h.api.store.delete('a');
      expect(await h.api.store.keys()).toEqual(['b']);
      expect(await h.api.store.get('a')).toBeUndefined();
    });

    test('the store is the mod own: the port is asked for this plugin', async () => {
      const asked: string[] = [];
      const store = {
        read: (plugin: string) => (asked.push(plugin), Promise.resolve({})),
        write: () => Promise.resolve(),
      };
      const h = await apiHarness({ plugin: 'my-mod', ports: { store } });
      await h.api.store.get('x');
      expect(asked).toEqual(['my-mod']);
    });

    test('a set changes only its own key: two keys written one after the other both stay', async () => {
      const h = await apiHarness({ ports: { store: memoryStore() } });
      await h.api.store.set('a', 1);
      await h.api.store.set('b', 2);
      expect(await h.api.store.keys()).toEqual(['a', 'b']);
    });

    test('a value that is not JSON rejects and nothing is written', async () => {
      const store = memoryStore();
      const h = await apiHarness({ ports: { store } });
      const cycle: Record<string, unknown> = {};
      cycle.self = cycle;
      expect(await rejection(h.api.store.set('x', () => 1))).toContain('$.store.set');
      expect(await rejection(h.api.store.set('x', cycle))).toContain('$.store.set');
      expect(store.writes).toHaveLength(0);
    });

    test('a stub answers store.get with { value } and store.set with { value: undefined }', async () => {
      const h = await apiHarness();
      await h.mod('stub', 'prepend', [
        fn('store.get', (_$, e) => ({ value: e.key === 'count' ? 7 : undefined })),
        fn('store.set', () => ({ value: undefined })),
      ]);
      expect(await h.api.store.get('count')).toBe(7);
      await h.api.store.set('count', 8);
    });
  },
);

spec('mods.limit.$.store', () => {
  // The JSON of { "k": "<n characters>" } is n + 8 characters.
  const framing = 8;

  test('a store of exactly 4 MiB of JSON is saved', async () => {
    const store = memoryStore();
    const h = await apiHarness({ ports: { store } });
    await h.api.store.set('k', 'x'.repeat(MOD_LIMITS.storeBytes - framing));
    expect(store.writes).toHaveLength(1);
  });

  test('one byte more rejects and the store keeps what it had', async () => {
    const store = memoryStore({ k: 'small' });
    const h = await apiHarness({ ports: { store } });
    expect(
      await rejection(h.api.store.set('k', 'x'.repeat(MOD_LIMITS.storeBytes - framing + 1))),
    ).toContain('$.store');
    expect(store.writes).toHaveLength(0);
    expect(await h.api.store.get('k')).toBe('small');
  });

  test('the limit is the total of every key, not one value', async () => {
    const half = 'x'.repeat(MOD_LIMITS.storeBytes / 2);
    const h = await apiHarness({ ports: { store: memoryStore() } });
    await h.api.store.set('a', half);
    expect(await rejection(h.api.store.set('b', half))).toContain('$.store');
  });

  test('bytes are counted, so two-byte characters fill it twice as fast', async () => {
    const h = await apiHarness({ ports: { store: memoryStore() } });
    expect(await rejection(h.api.store.set('k', 'é'.repeat(MOD_LIMITS.storeBytes / 2)))).toContain(
      '$.store',
    );
  });
});

spec('mods.api.$.state', () => {
  test('$.state has get and set; a value written is read back with its version, and one never written has none', async () => {
    const h = await apiHarness();
    expectMethods(h.api.state, MODS_API.state);
    const key = { plugin: 'hello-tabs', key: 'count' };
    expect(await h.api.state.get(key)).toEqual({ version: 0 });
    await h.api.state.set(key, 3);
    expect(await h.api.state.get(key)).toEqual({ value: 3, version: 1 });
  });

  test('atom names a value and its default; read gives the default until a write; update writes from the old value', async () => {
    const h = await apiHarness();
    const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0);
    expect(await read(h.api, count)).toBe(0);
    await update(h.api, count, (value) => value + 1);
    await update(h.api, count, (value) => value + 1);
    expect(await read(h.api, count)).toBe(2);
  });

  test('a write tells the listeners, so a site that read the value redraws; a read tells them too', async () => {
    const h = await apiHarness();
    const wrote: string[] = [];
    const reads: string[] = [];
    h.shared.state.onWrite((plugin, key) => wrote.push(`${plugin}.${key}`));
    h.shared.state.onRead((plugin, key) => reads.push(`${plugin}.${key}`));
    await h.api.state.set({ plugin: 'hello-tabs', key: 'tab' }, 'two');
    await h.api.state.get({ plugin: 'hello-tabs', key: 'count' });
    expect(wrote).toEqual(['hello-tabs.tab']);
    expect(reads).toEqual(['hello-tabs.count']);
  });

  test('a value survives the reload of a module: a new $ for the same mod sees it', async () => {
    const h = await apiHarness();
    await h.api.state.set({ plugin: 'hello-tabs', key: 'count' }, 5);
    const reloaded = await createModsApi(h.shared, { name: 'my-mod', tier: 'user' });
    expect(await read(reloaded.api, { plugin: 'hello-tabs', key: 'count' })).toBe(5);
  });

  test('/clear, /resume and /branch reset every value to its default', async () => {
    const h = await apiHarness();
    const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0);
    await update(h.api, count, () => 9);
    h.shared.state.reset();
    expect(await read(h.api, count)).toBe(0);
  });

  test('the call is an event: a mod before can answer state.get', async () => {
    const h = await apiHarness();
    await h.mod('stub', 'prepend', [fn('state.get', () => ({ value: 'stubbed' }))]);
    expect(await h.api.state.get({ plugin: 'p', key: 'k' })).toBe('stubbed');
  });
});
