/**
 * plugins/mods/troubleshoot.md § A value resets after `/clear`, `/resume`, or `/branch` ("Each of those
 * commands resets `$.state` to its defaults, and `session.start` doesn't fire again. Load the saved value
 * again in a `classic.SessionStart` hook"); plugins/mods/interface.md § Save from more than one session
 * (every session shares one `$.store`; "Give each item its own key", "Read again right before you write").
 */
import { expect, test } from 'bun:test';
import type { JsonObject } from '../../../src/foundation/index.ts';
import { atom, read, update, type StateHost } from '../../../src/mods/api/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { apiHarness, memoryStore } from '../../support/mods-api.ts';
import { flush } from '../../support/mods-chain.ts';
import { PANE, runHello } from '../../support/mods-hello-pane.ts';
import { helloStateFolder } from '../../support/mods-hello-state.ts';
import { installed, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

interface Dollar extends StateHost {
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
}
type Next = (e: unknown) => unknown;

spec('mods.troubleshoot.A value resets after /clear, /resume, or /branch', () => {
  test('the host resets every $.state value to its default, session.start does not fire again, and the saved value comes back through classic.SessionStart', async () => {
    const store = memoryStore({ count: 7 } satisfies JsonObject);
    const starts: string[] = [];
    const register = registerOf((on) => {
      const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0);
      async function loadCount($: Dollar) {
        const saved = Number((await $.store.get('count')) ?? 0);
        await update($, count, () => saved);
      }
      on('session.start', async ($: Dollar, e: unknown, next: Next) => {
        starts.push('session.start');
        await loadCount($);
        return next(e);
      });
      on(
        'classic.SessionStart',
        { source: ['clear', 'resume', 'fork'] },
        async ($: Dollar, e: unknown, next: Next) => {
          starts.push('classic.SessionStart');
          await loadCount($);
          return next(e);
        },
      );
      on('tool.call', async ($: Dollar, e: unknown, next: Next) => {
        starts.push(`count is ${await read($, count)}`);
        return next(e);
      });
    });
    const { host } = session({ 'hello-tabs': register }, { ports: portsOf(store) });
    await host.load([{ candidate: installed('hello-tabs'), files: helloStateFolder(true) }]);
    const ask = () =>
      host.fire('tool.call', { tool: 'Bash', input: {} }, { core: () => Promise.resolve({}) });
    await ask();
    expect(starts).toEqual(['session.start', 'count is 7']);
    for (const source of ['clear', 'resume', 'fork'] as const) {
      starts.length = 0;
      host.resetState();
      await ask();
      // The value is back to its default, and session.start did not fire again.
      expect(starts).toEqual(['count is 0']);
      starts.length = 0;
      await host.fire(
        'classic.SessionStart',
        { source },
        {
          core: () => Promise.resolve({}),
        },
      );
      await ask();
      expect(starts).toEqual(['classic.SessionStart', 'count is 7']);
    }
  });
});

spec('mods.interface.Save from more than one session', () => {
  /** A store that takes a turn to answer, as a file on disk does, shared by every session. */
  function sharedStore(initial: JsonObject = {}) {
    let data: JsonObject = initial;
    const turn = () => flush();
    return {
      get data(): JsonObject {
        return data;
      },
      read: async () => (await turn(), structuredClone(data)),
      write: async (_plugin: string, next: JsonObject) => {
        await turn();
        data = next;
      },
    };
  }

  test('each item under its own key: sessions that write different keys at the same time do not overwrite each other', async () => {
    const store = sharedStore();
    const one = await apiHarness({ ports: { store } });
    const two = await apiHarness({ ports: { store } });
    await Promise.all([
      one.api.store.set('note-a', 'first'),
      two.api.store.set('note-b', 'second'),
    ]);
    expect(store.data).toEqual({ 'note-a': 'first', 'note-b': 'second' });
  });

  test('the Add one button of hello-tabs reads what the store holds now: a count another session raised to 3 becomes 4, shown and saved', async () => {
    const held = new Map<string, unknown>([['count', 0]]);
    const result = await runHello(({ test, expect }) => {
      test('Add one after another session saved 3', async (claude, on) => {
        on('store.get', (_$: unknown, e: { key: string }) => ({ value: held.get(e.key) }));
        on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
          held.set(e.key, e.value);
          return { value: undefined };
        });
        const ui = await claude.ui.mount(PANE);
        expect(await ui.find({ type: 'Text', text: 'Count: 0' })).toBeDefined();
        // Another session raised the count while this pane showed 0.
        held.set('count', 3);
        await ui.press({ key: 'more' });
        expect(await ui.find({ type: 'Text', text: 'Count: 4' })).toBeDefined();
      });
    });
    expect(result.lines.join('\n')).toContain('(pass) Add one after another session saved 3');
    expect(result.exitCode).toBe(0);
    expect(held.get('count')).toBe(4);
  });

  // A documented limitation (interface.md: "a `get` followed by a `set` isn't atomic"), not a promise of
  // the kit: the stale write wins, as it does with any store the kit does not lock across a mod's own calls.
  test('documented limitation: a get followed by a set is not atomic, so another session write that lands between them is replaced', async () => {
    const store = sharedStore({ count: 0 });
    const mine = await apiHarness({ ports: { store } });
    const other = await apiHarness({ ports: { store } });
    const seen = Number(await mine.api.store.get('count'));
    await other.api.store.set('count', 5);
    await mine.api.store.set('count', seen + 1);
    expect(store.data.count).toBe(1);
  });
});

/** The ports of a session whose `$.store` is `store`. */
function portsOf(store: ReturnType<typeof memoryStore>) {
  return { ...fakePorts().ports, store };
}
