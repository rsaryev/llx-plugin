/**
 * Panes: `$.ui.open` and where a pane appears.
 * plugins/mods/interface.md § Open a pane at the right time (the fields; "`focus`, `closeOnEscape`,
 * and `holdToasts` are optional and accept only `true` ... Passing `false` throws an error such as
 * `ui.open: focus is true or left out`"), § When a pane waits for a wider terminal (opened by
 * something the user did: any width; by the mod itself: 144 columns, 110 once the user opened it);
 * plugins/mods/reference.md § Limits ("A pane opened without the user asking"). Whether something
 * is the user's doing is the host's (`ModInterface.origin`); the kit decides placement from it.
 */
import { expect, test } from 'bun:test';
import { placePane, withUiRules, type Viewport } from '../../../src/mods/ui/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fn } from '../../support/mods-chain.ts';
import { rejection } from '../../support/rejection.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const width = (columns: number): Viewport => ({ columns, rows: 40, isFullscreen: true });

async function harness(origin: 'user' | 'mod', columns: number | undefined) {
  const view = { columns };
  const { iface } = fakeInterface({
    origin: () => origin,
    viewport: () => (view.columns === undefined ? undefined : width(view.columns)),
  });
  const h = await apiHarness({
    rules: withUiRules,
    ui: uiOver(iface),
  });
  return { h, view, ui: h.ui };
}

spec('mods.limit.A pane opened without the user asking', () => {
  test('a pane opened by something the user did is placed at any width', () => {
    for (const columns of [1, 40, 109, 143]) {
      expect(
        placePane({
          origin: 'user',
          surface: 'terminal',
          viewport: width(columns),
          hasUserOpened: false,
        }),
      ).toEqual({ isPlaced: true });
    }
  });

  test('a pane a mod opens by itself is placed from 144 columns and waits below that, with a reason', () => {
    const at = (columns: number) =>
      placePane({
        origin: 'mod',
        surface: 'terminal',
        viewport: width(columns),
        hasUserOpened: false,
      });
    expect(at(144)).toEqual({ isPlaced: true });
    expect(at(200)).toEqual({ isPlaced: true });
    const waiting = at(143);
    expect(waiting.isPlaced).toBe(false);
    expect(
      !waiting.isPlaced && typeof waiting.reason === 'string' && waiting.reason.length > 0,
    ).toBe(true);
  });

  test('after the user opened that pane once themselves 110 columns is enough', () => {
    const at = (columns: number) =>
      placePane({
        origin: 'mod',
        surface: 'terminal',
        viewport: width(columns),
        hasUserOpened: true,
      });
    expect(at(110)).toEqual({ isPlaced: true });
    expect(at(109).isPlaced).toBe(false);
  });

  test('$.ui.open resolves to { isPlaced: true } when the pane appears and { isPlaced: false, reason } when it waits', async () => {
    const { h } = await harness('mod', 100);
    const result = await h.api.ui.open({ id: 'timer-pane' });
    expect(result).toMatchObject({ isPlaced: false, reason: expect.any(String) });
    const { h: wide } = await harness('mod', 144);
    expect(await wide.api.ui.open({ id: 'timer-pane' })).toEqual({ isPlaced: true });
  });

  test('once the user opened that pane themselves, the same pane opened by the mod needs only 110, and another pane still needs 144', async () => {
    const { ui } = await harness('mod', 100);
    const at = (columns: number) => ({ surface: 'terminal', viewport: width(columns) }) as const;
    expect(ui?.panes.open('my-mod', { id: 'tabs' }, 'user', at(60))).toEqual({ isPlaced: true });
    expect(ui?.panes.open('my-mod', { id: 'tabs' }, 'mod', at(110))).toEqual({ isPlaced: true });
    expect(ui?.panes.open('my-mod', { id: 'tabs' }, 'mod', at(109)).isPlaced).toBe(false);
    expect(ui?.panes.open('my-mod', { id: 'other' }, 'mod', at(110)).isPlaced).toBe(false);
  });

  test('a waiting pane appears when the user opens it or widens the terminal', async () => {
    const { h, ui } = await harness('mod', 100);
    await h.api.ui.open({ id: 'waiting' });
    expect(ui?.panes.list().map((p) => [p.id, p.isPlaced])).toEqual([['waiting', false]]);
    expect(ui?.panes.resize({ surface: 'terminal', viewport: width(120) })).toEqual([]);
    expect(ui?.panes.resize({ surface: 'terminal', viewport: width(144) })).toEqual(['waiting']);
    expect(ui?.panes.list().map((p) => p.isPlaced)).toEqual([true]);
    // the user opening it places it at any width
    const { h: narrow, ui: narrowUi } = await harness('mod', 60);
    await narrow.api.ui.open({ id: 'waiting' });
    narrowUi?.panes.open('my-mod', { id: 'waiting' }, 'user', {
      surface: 'terminal',
      viewport: width(60),
    });
    expect(narrowUi?.panes.list().map((p) => p.isPlaced)).toEqual([true]);
  });
});

spec('mods.api.$.ui', () => {
  test('focus, closeOnEscape and holdToasts accept only true: false throws, naming the field', async () => {
    const { h } = await harness('user', 200);
    expect(await rejection(h.api.ui.open({ id: 'p', focus: false }))).toBe(
      'ui.open: focus is true or left out',
    );
    expect(await rejection(h.api.ui.open({ id: 'p', closeOnEscape: false }))).toBe(
      'ui.open: closeOnEscape is true or left out',
    );
    expect(await rejection(h.api.ui.open({ id: 'p', holdToasts: false }))).toBe(
      'ui.open: holdToasts is true or left out',
    );
    expect(
      await h.api.ui.open({ id: 'p', focus: true, closeOnEscape: true, holdToasts: true }),
    ).toEqual({
      isPlaced: true,
    });
    expect(await h.api.ui.open({ id: 'p' })).toEqual({ isPlaced: true });
  });

  test('$.ui.open takes id, title, focus, closeOnEscape, holdToasts, rows and columns, and records them', async () => {
    const { h, ui } = await harness('user', 200);
    await h.api.ui.open({
      id: 'hello-tabs',
      title: 'Hello tabs',
      focus: true,
      rows: 8,
      columns: 40,
    });
    expect(ui?.panes.list()[0]?.request).toEqual({
      id: 'hello-tabs',
      title: 'Hello tabs',
      focus: true,
      rows: 8,
      columns: 40,
    });
  });

  test('the pane id is a name: letters, digits, _ and -, up to 64 characters', async () => {
    const { h } = await harness('user', 200);
    expect(await h.api.ui.open({ id: 'a'.repeat(64) })).toEqual({ isPlaced: true });
    expect(await rejection(h.api.ui.open({ id: 'a'.repeat(65) }))).toContain('ui.open: pane name');
    expect(await rejection(h.api.ui.open({ id: 'has space' }))).toContain('ui.open: pane name');
    expect(await rejection(h.api.ui.open({}))).toContain('ui.open:');
  });

  test('a pane that holds toasts holds them while it shows, and only while it is open', async () => {
    const { h, ui } = await harness('user', 200);
    await h.api.ui.open({ id: 'dialog', holdToasts: true });
    expect(ui?.panes.holdsToasts()).toBe(true);
    await h.api.ui.close({ id: 'dialog' });
    expect(ui?.panes.holdsToasts()).toBe(false);
  });

  test('an open is an event: a hook before the mod can rewrite or refuse it', async () => {
    const { h, ui } = await harness('user', 200);
    await h.mod('policy', 'prepend', [
      fn('ui.open', (_$, e, next) => (e.id === 'blocked' ? { deny: 'no panes here' } : next(e))),
    ]);
    expect(await rejection(h.api.ui.open({ id: 'blocked' }))).toContain('no panes here');
    expect(ui?.panes.list()).toEqual([]);
    await h.api.ui.open({ id: 'fine' });
    expect(ui?.panes.list().map((p) => p.id)).toEqual(['fine']);
  });
});
