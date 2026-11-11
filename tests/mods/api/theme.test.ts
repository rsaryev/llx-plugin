/**
 * `$.theme`: the session's backdrop.
 * plugins/mods/interface.md § Put a backdrop behind the conversation ("call `$.theme.set` with a
 * `backdrop`, then draw the backdrop at the `Backdrop` render site. To take the backdrop off, call
 * `$.theme.clear()`"; the `backdrop` fields: "`id`, a name you choose, is required, and the other
 * fields are optional. `colorScheme` is `'light'` or `'dark'`"; "`$.theme.set` resolves with
 * `isDrawn: true` when a Desktop or mobile app connected to the session says it draws backdrops.
 * Otherwise `isDrawn` is `false` and `reason` says why"; "a `$.theme.set` call replaces the
 * session's backdrop and `$.theme.clear()` removes that backdrop, whichever mod set it"; "Neither a
 * reload of this mod nor --resume keeps the backdrop"; the transcript shows `the theme is cleared`);
 * plugins/mods/reference.md § Mods API methods (`$.theme`: `set`, `clear`), § Limits (the `id` of
 * a backdrop is a name). Whether an app draws backdrops is the host's (the `theme` port).
 */
import { describe, expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import type { ModTheme, SessionBackdrop } from '../../../src/mods/api/index.ts';

import { apiHarness, expectMethods } from '../../support/mods-api.ts';
import { fn } from '../../support/mods-chain.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';
import { THEME_CLEARED } from '../../../src/mods/api/theme.ts';

const SECTION = 'mods.interface.Put a backdrop behind the conversation';

/** A theme port whose apps draw backdrops (or not, with `reason`), recording each change. */
function theme(reason?: string) {
  const changes: (SessionBackdrop | undefined)[] = [];
  const port: ModTheme = {
    drawn: () =>
      Promise.resolve(reason === undefined ? { isDrawn: true } : { isDrawn: false, reason }),
    changed: (backdrop) => void changes.push(backdrop),
  };
  return { port, changes };
}

async function setup(reason?: string, plugin = 'night-sky') {
  const { port, changes } = theme(reason);
  const h = await apiHarness({ plugin, ports: { theme: port } });
  return { h, changes, current: () => h.shared.registries.backdrop.current() };
}

spec('mods.api.$.theme', () => {
  test('$.theme has set and clear, which reach the host', async () => {
    const { h, changes } = await setup();
    expectMethods(h.api.theme, MODS_API.theme);
    await h.api.theme.set({ backdrop: { id: 'night-sky' } });
    await h.api.theme.clear();
    expect(changes).toEqual([{ id: 'night-sky', plugin: 'night-sky' }, undefined]);
  });

  test('each call is an event a hook of another mod sees and can rewrite', async () => {
    const { h, current } = await setup();
    const seen: unknown[] = [];
    await h.mod('other', 'prepend', [
      fn('theme.set', (_$, e, next) => {
        seen.push(e);
        return next({ backdrop: { id: 'dawn', colorScheme: 'light' } });
      }),
      fn('theme.clear', (_$, e, next) => (seen.push('clear'), next(e))),
    ]);
    await h.api.theme.set({ backdrop: { id: 'night-sky', colorScheme: 'dark' } });
    expect(current()).toEqual({ id: 'dawn', plugin: 'night-sky', colorScheme: 'light' });
    await h.api.theme.clear();
    expect(seen).toEqual([{ backdrop: { id: 'night-sky', colorScheme: 'dark' } }, 'clear']);
  });
});

spec(`${SECTION}.The backdrop fields`, () => {
  test('id is required and a name; colorScheme is light or dark; glass is optional', async () => {
    const { h, current } = await setup();
    await h.api.theme.set({ backdrop: { id: 'night-sky', colorScheme: 'dark' } });
    expect(current()).toEqual({ id: 'night-sky', plugin: 'night-sky', colorScheme: 'dark' });
    await h.api.theme.set({ backdrop: { id: 'day_1', colorScheme: 'light', glass: true } });
    expect(current()).toEqual({
      id: 'day_1',
      plugin: 'night-sky',
      colorScheme: 'light',
      glass: true,
    });
    for (const wrong of [
      { backdrop: {} },
      { backdrop: { id: 'night sky' } },
      { backdrop: { id: 'a'.repeat(65) } },
      { backdrop: { id: 'night-sky', colorScheme: 'dim' } },
    ]) {
      expect(await rejection(h.api.theme.set(wrong))).toStartWith('$.theme.set: ');
    }
    expect(current()).toEqual({
      id: 'day_1',
      plugin: 'night-sky',
      colorScheme: 'light',
      glass: true,
    });
  });
});

spec(`${SECTION}.Whether the backdrop is drawn`, () => {
  test('set resolves { isDrawn: true } when an app connected to the session says it draws backdrops', async () => {
    const { h } = await setup();
    // `requestId` `backdrop`, the `e.requestId` of the backdrop at `ui.render` (claude-code/index.d.ts:14072).
    expect(await h.api.theme.set({ backdrop: { id: 'night-sky' } })).toEqual({
      isDrawn: true,
      requestId: 'backdrop',
    });
  });

  test('otherwise isDrawn is false and reason says why', async () => {
    const { h, current } = await setup('no app that draws backdrops is connected');
    expect(await h.api.theme.set({ backdrop: { id: 'night-sky' } })).toEqual({
      isDrawn: false,
      reason: 'no app that draws backdrops is connected',
    });
    expect(current()).toEqual({ id: 'night-sky', plugin: 'night-sky' });
  });
});

spec(`${SECTION}.One backdrop for each session`, () => {
  test("a set replaces the session's backdrop and clear removes it, whichever mod set it", async () => {
    const { h, changes, current } = await setup();
    const other = await h.mod('other', 'user', []);
    await h.api.theme.set({ backdrop: { id: 'night-sky' } });
    await other.api.theme.set({ backdrop: { id: 'dawn' } });
    expect(current()).toEqual({ id: 'dawn', plugin: 'other' });
    const cleared = await h.api.theme.clear();
    expect(cleared).toMatchObject({ reason: 'the theme is cleared' });
    expect(current()).toBeUndefined();
    expect(changes).toEqual([
      { id: 'night-sky', plugin: 'night-sky' },
      { id: 'dawn', plugin: 'other' },
      undefined,
    ]);
  });

  test('a reload of the mod that set the backdrop does not keep it; unloading another mod leaves it', async () => {
    const { h, changes, current } = await setup();
    const other = await h.mod('other', 'user', []);
    await h.api.theme.set({ backdrop: { id: 'night-sky' } });
    other.dispose();
    expect(current()).toEqual({ id: 'night-sky', plugin: 'night-sky' });
    h.handle.dispose();
    expect(current()).toBeUndefined();
    expect(changes).toEqual([{ id: 'night-sky', plugin: 'night-sky' }, undefined]);
  });
});

describe('judgments', () => {
  test('clear resolves { isDrawn: false, reason: "the theme is cleared" }, also with no backdrop set, and tells the host only when one was', async () => {
    const { h, changes } = await setup();
    expect(await h.api.theme.clear()).toEqual({ isDrawn: false, reason: THEME_CLEARED });
    expect(changes).toEqual([]);
  });

  test('set without a backdrop rejects before any hook sees it, and keeps the other fields of the backdrop out of the site props', async () => {
    const { h, current } = await setup();
    const seen: unknown[] = [];
    await h.mod('other', 'prepend', [fn('theme.set', (_$, e, next) => (seen.push(e), next(e)))]);
    expect(await rejection(h.api.theme.set({}))).toStartWith('$.theme.set: backdrop');
    expect(seen).toEqual([]);
    await h.api.theme.set({ backdrop: { id: 'night-sky', extra: 1 } });
    expect(current()).toEqual({ id: 'night-sky', plugin: 'night-sky' });
  });
});
