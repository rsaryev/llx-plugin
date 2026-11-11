/**
 * Placed rows: `$.ui.place` and the `Placed` render site.
 * plugins/mods/interface.md § Place a row in the transcript (the `id` is 1 to 64 letters, digits,
 * `_` or `-`; "The result": `{ isPlaced: true, requestId }` when the terminal draws the row,
 * otherwise `isPlaced: false` and a `reason` such as `no attached surface draws placed rows yet`;
 * "A second call with the same `id`" adds no row and resolves that row's `requestId`; "When the row
 * goes away": the conversation ends, the user rewinds past it, or, outside fullscreen rendering, the
 * conversation is compacted); plugins/mods/reference.md § Render sites (`Placed`: `id`, `plugin`,
 * `onScreen`, the `requestId` `$.ui.place` returned, Terminal), § Limits (500 rows a mod has at one
 * time, and the reason at the limit; the `id` of a placed row follows the names rule). Whether a
 * surface draws placed rows, and where a row sits for a rewind, are the host's
 * (`ModInterface.drawsPlacedRows`, `ModsUi.placed.rewind`); the kit keeps the rows and answers the call.
 */
import { expect, test } from 'bun:test';
import { createPlacedRows, renderEvent, uiRules } from '../../../src/mods/ui/index.ts';
import type { ModInterface } from '../../../src/mods/ui/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fn } from '../../support/mods-chain.ts';
import { rejection } from '../../support/rejection.ts';
import { fakeInterface, recordOf, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

async function setup(overrides: Partial<ModInterface> = {}) {
  const { iface } = fakeInterface(overrides);
  const h = await apiHarness({ rules: uiRules, ui: uiOver(iface) });
  const placed = h.ui?.placed;
  if (!placed) throw new Error('the harness has no interface part');
  return { h, placed };
}

spec('mods.interface.Place a row in the transcript.The result', () => {
  test('where the terminal draws placed rows, the call resolves { isPlaced: true, requestId } and the row is the mod`s', async () => {
    const { h, placed } = await setup();
    const result = await h.api.ui.place({ id: 'build-status' });
    expect(result).toEqual({ isPlaced: true, requestId: expect.any(String) });
    expect(placed.list()).toEqual([
      { requestId: expect.any(String), id: 'build-status', plugin: 'my-mod' },
    ]);
  });

  test('where no attached surface draws placed rows, isPlaced is false with a reason, and no row is kept', async () => {
    const reason = { isPlaced: false, reason: 'no attached surface draws placed rows yet' };
    const none = await setup({ drawsPlacedRows: () => false });
    expect(await none.h.api.ui.place({ id: 'build-status' })).toEqual(reason);
    expect(none.placed.list()).toEqual([]);
    // The Placed site is the terminal's only.
    const desktop = await setup({ surface: () => 'desktop' });
    expect(await desktop.h.api.ui.place({ id: 'build-status' })).toEqual(reason);
  });

  test('the call is the ui.place event: a hook before the mod sees { id } and can refuse it', async () => {
    const { h, placed } = await setup();
    const seen: unknown[] = [];
    await h.mod('guard', 'prepend', [
      fn('ui.place', (_$, e, next) =>
        e.id === 'blocked' ? { deny: 'no rows here' } : (seen.push(e), next(e)),
      ),
    ]);
    expect(await rejection(h.api.ui.place({ id: 'blocked' }))).toContain('no rows here');
    await h.api.ui.place({ id: 'fine' });
    expect(seen).toEqual([{ id: 'fine' }]);
    expect(placed.list().map((row) => row.id)).toEqual(['fine']);
  });
});

spec('mods.interface.Place a row in the transcript.A second call with the same id', () => {
  test('while the row is in the transcript, the same id adds no row and resolves its requestId', async () => {
    const { h, placed } = await setup();
    const first = await h.api.ui.place({ id: 'build-status' });
    expect(await h.api.ui.place({ id: 'build-status' })).toEqual(first);
    expect(placed.list()).toHaveLength(1);
  });

  test('another mod can use the same id: its row is its own', async () => {
    const { h, placed } = await setup();
    const other = await h.mod('other-mod', 'user', []);
    const mine = await h.api.ui.place({ id: 'build-status' });
    const theirs = await other.api.ui.place({ id: 'build-status' });
    expect(theirs).not.toEqual(mine);
    expect(placed.list().map((row) => row.plugin)).toEqual(['my-mod', 'other-mod']);
  });
});

/** Two rows of one mod, oldest first. */
function twoRows() {
  const rows = createPlacedRows();
  const first = rows.place('my-mod', 'a', true);
  const second = rows.place('my-mod', 'b', true);
  return { rows, first, second };
}

spec('mods.interface.Place a row in the transcript.When the row goes away', () => {
  test('when the conversation ends every row goes', () => {
    const { rows } = twoRows();
    expect(rows.end().map((row) => row.id)).toEqual(['a', 'b']);
    expect(rows.list()).toEqual([]);
  });

  test('a rewind past a row takes that row and leaves the rows before it', () => {
    const { rows, second } = twoRows();
    if (!second.isPlaced) throw new Error('not placed');
    expect(rows.rewind([second.requestId]).map((row) => row.id)).toEqual(['b']);
    expect(rows.list().map((row) => row.id)).toEqual(['a']);
  });

  test('a compaction takes every row outside fullscreen rendering, and none in it', () => {
    const { rows } = twoRows();
    expect(rows.compact('fullscreen')).toEqual([]);
    expect(rows.list()).toHaveLength(2);
    expect(rows.compact('classic')).toHaveLength(2);
    expect(rows.list()).toEqual([]);
  });

  test('to show the row again, the mod calls $.ui.place again and gets a row of its own', () => {
    const { rows, first } = twoRows();
    rows.end();
    const again = rows.place('my-mod', 'a', true);
    expect(again.isPlaced).toBe(true);
    expect(again).not.toEqual(first);
  });
});

spec('mods.limit.$.ui.place', () => {
  test('a mod holds at most 500 rows: a new id then resolves the documented reason, a held id still its row', () => {
    const rows = createPlacedRows();
    const held = Array.from({ length: 500 }, (_, i) => rows.place('my-mod', `row-${i}`, true));
    expect(held.every((result) => result.isPlaced)).toBe(true);
    expect(rows.place('my-mod', 'one-more', true)).toEqual({
      isPlaced: false,
      reason: 'a plugin holds at most 500 placed rows',
    });
    expect(rows.place('my-mod', 'row-7', true)).toEqual(held[7] ?? { isPlaced: false, reason: '' });
    // The limit is each mod's.
    expect(rows.place('other-mod', 'one-more', true).isPlaced).toBe(true);
    // A row that went makes room.
    rows.compact('classic');
    expect(rows.place('my-mod', 'one-more', true).isPlaced).toBe(true);
  });
});

spec('mods.limit.id', () => {
  test('the id of a placed row is letters, digits, _ and -, up to 64 characters, and ui.place refuses any other', async () => {
    const { h } = await setup();
    expect(await h.api.ui.place({ id: 'a'.repeat(64) })).toMatchObject({ isPlaced: true });
    expect(await h.api.ui.place({ id: 'Row_2-b' })).toMatchObject({ isPlaced: true });
    for (const id of ['a'.repeat(65), 'has space', 'dot.ted', '']) {
      expect(await rejection(h.api.ui.place({ id }))).toContain('ui.place: placed row name');
    }
    expect(await rejection(h.api.ui.place({}))).toContain('ui.place:');
    expect(await rejection(h.api.ui.place('build-status'))).toContain('ui.place:');
  });
});

spec('mods.site.Placed', () => {
  test('a hook at the Placed site receives the requestId $.ui.place returned and the row`s id, plugin and onScreen', async () => {
    const { h } = await setup();
    const { requestId } = recordOf(await h.api.ui.place({ id: 'build-status' }));
    if (typeof requestId !== 'string') throw new Error('not placed');
    const props = { id: 'build-status', plugin: 'my-mod', onScreen: true };
    const built = renderEvent({
      site: 'Placed',
      surface: 'terminal',
      requestId,
      props,
    });
    expect(built).toEqual({
      event: { component: 'Placed', surface: 'terminal', requestId, props },
    });
    expect(renderEvent({ site: 'Placed', surface: 'terminal' })).toEqual({
      problem: 'Placed needs a requestId',
    });
  });
});
