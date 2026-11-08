/**
 * Redraws and toasts.
 * plugins/mods/interface.md § Redraw a site ("How often a site can redraw": "Calls that come
 * faster than the limit are coalesced into one redraw. That redraw runs your hook once, and the hook
 * reads your data as it is at that moment, so the latest value shows and the values in between
 * don't"); plugins/mods/reference.md § Limits (`$.ui.invalidate('ui.render')`: 10 a second, 30 in the
 * terminal for the visible pane, the expanded band and the hint line; `$.ui.toast`: 4 seconds unless
 * `{ timeoutMs }`; in the classic renderer a newer toast takes the place of the mod's older one);
 * plugins/mods/troubleshoot.md § A toast doesn't appear (`timeoutMs is a whole number of ms, 1 to
 * 60000`; `gave way, cut short`, `gave way, unseen`, `left the stack, never drawn`; a pane holding
 * toasts). The kit throttles and queues; what the app draws is the app's, so no test claims it.
 * The window the throttle uses (a minimum gap) is a judgment (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import {
  createRedrawGate,
  createToastBoard,
  parseToast,
  withUiRules,
} from '../../../src/mods/ui/index.ts';
import { fixedClock } from '../../support/clock.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fn } from '../../support/mods-chain.ts';
import { rejection } from '../../support/rejection.ts';
import { fakeInterface, node, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

/** Calls once a millisecond for two seconds; the most redraws any one second of it held, and the total. */
function redrawsPerSecond(rate: 'default' | 'terminal-visible'): { most: number; total: number } {
  const clock = fixedClock();
  const times: number[] = [];
  const gate = createRedrawGate(clock, rate, () => times.push(clock.now()));
  for (let ms = 0; ms < 2000; ms += 1) {
    gate.invalidate();
    clock.advance(1);
  }
  const most = Math.max(...times.map((at) => times.filter((t) => t >= at && t < at + 1000).length));
  return { most, total: times.length };
}

// The id holds both kinds of quote, so a template literal names it (the SP2 gate reads quoted literals; spec() checks the id when the file runs).
spec(`mods.limit.$.ui.invalidate('ui.render')`, () => {
  test('redraws are throttled to 10 a second', () => {
    // never more than 10 in any second, and calls every millisecond keep it at the limit
    expect(redrawsPerSecond('default').most).toBe(10);
    expect(redrawsPerSecond('default').total).toBeGreaterThan(18);
  });

  test('in the terminal, for the visible pane, the expanded band and the hint line, to 30 a second', () => {
    expect(redrawsPerSecond('terminal-visible')).toMatchObject({ most: 30 });
    expect(redrawsPerSecond('terminal-visible').total).toBeGreaterThan(55);
  });

  test('calls that come sooner are coalesced into one redraw that reads the latest data, not the values between', () => {
    const clock = fixedClock();
    let data = 0;
    const drawn: number[] = [];
    const gate = createRedrawGate(clock, 'default', () => drawn.push(data));
    data = 1;
    gate.invalidate();
    data = 2;
    gate.invalidate();
    data = 3;
    gate.invalidate();
    expect(drawn).toEqual([1]);
    clock.advance(99);
    expect(drawn).toEqual([1]);
    clock.advance(1);
    expect(drawn).toEqual([1, 3]);
    clock.advance(1000);
    expect(drawn).toEqual([1, 3]);
    expect(clock.pending()).toBe(0);
  });

  test('a call after the wait redraws at once', () => {
    const clock = fixedClock();
    let redraws = 0;
    const gate = createRedrawGate(clock, 'default', () => (redraws += 1));
    gate.invalidate();
    clock.advance(100);
    gate.invalidate();
    expect(redraws).toBe(2);
  });

  test("$.ui.invalidate('ui.render') asks the host to draw the sites again, at the rate of what is redrawn", async () => {
    let visible = false;
    let now = () => 0;
    const times: number[] = [];
    const { iface } = fakeInterface({
      isTerminalVisible: () => visible,
      redraw: () => void times.push(now()),
    });
    const h = await apiHarness({
      rules: withUiRules,
      ui: uiOver(iface),
    });
    now = () => h.clock.now();
    const run = async (): Promise<number> => {
      times.length = 0;
      for (let ms = 0; ms < 2000; ms += 1) {
        await h.api.ui.invalidate('ui.render');
        h.clock.advance(1);
      }
      return Math.max(...times.map((at) => times.filter((t) => t >= at && t < at + 1000).length));
    };
    expect(await run()).toBe(10);
    visible = true;
    expect(await run()).toBe(30);
    expect(await rejection(h.api.ui.invalidate('other'))).toBe(
      "$.ui.invalidate: takes 'ui.render'",
    );
  });
});

spec('mods.limit.$.ui.toast', () => {
  test('a toast is shown for 4 seconds unless { timeoutMs } says otherwise', () => {
    expect(parseToast('hi', undefined)).toEqual({ toast: { text: 'hi', timeoutMs: 4000 } });
    expect(parseToast('hi', { timeoutMs: 1500 })).toEqual({
      toast: { text: 'hi', timeoutMs: 1500 },
    });
    const clock = fixedClock();
    const board = createToastBoard({
      clock,
      renderer: () => 'fullscreen',
      isHeld: () => false,
      debug: () => undefined,
    });
    board.show('my-mod', { text: 'done', timeoutMs: 4000 });
    clock.advance(3999);
    expect(board.visible()).toEqual([{ plugin: 'my-mod', text: 'done' }]);
    clock.advance(1);
    expect(board.visible()).toEqual([]);
  });

  test('timeoutMs is a whole number of milliseconds, 1 to 60000, and anything else is dropped with the documented reason', () => {
    for (const timeoutMs of [1, 60_000, 4000]) {
      expect(parseToast('x', { timeoutMs })).toEqual({ toast: { text: 'x', timeoutMs } });
    }
    for (const timeoutMs of [0, -1, 60_001, 1.5, '5', Number.NaN, Infinity, null]) {
      expect(parseToast('x', { timeoutMs })).toEqual({
        problem: 'timeoutMs is a whole number of ms, 1 to 60000',
      });
    }
  });

  test('$.ui.toast writes the documented debug lines: the toast raised, or why it was dropped', async () => {
    const { iface } = fakeInterface();
    const h = await apiHarness({
      plugin: 'first-mod',
      rules: withUiRules,
      ui: uiOver(iface),
    });
    await h.api.ui.toast('build finished');
    await h.api.ui.toast('too long', { timeoutMs: 60_001 });
    expect(h.debug).toEqual([
      '$.ui.toast (first-mod): build finished',
      'first-mod: $.ui.toast dropped: timeoutMs is a whole number of ms, 1 to 60000',
    ]);
    expect(h.ui?.toasts.visible()).toEqual([{ plugin: 'first-mod', text: 'build finished' }]);
    expect(await rejection(h.api.ui.toast(3))).toBeUndefined();
  });

  const board = (renderer: 'classic' | 'fullscreen', held = { value: false }) => {
    const clock = fixedClock();
    const debug: string[] = [];
    const toasts = createToastBoard({
      clock,
      renderer: () => renderer,
      isHeld: () => held.value,
      debug: (line) => debug.push(line),
    });
    return { clock, debug, toasts, held };
  };
  const show = (b: ReturnType<typeof board>, plugin: string, text: string, timeoutMs = 4000) =>
    b.toasts.show(plugin, { text, timeoutMs });

  test('in the classic renderer a mod`s newer toast takes the place of its older one that is showing', () => {
    const b = board('classic');
    show(b, 'a', 'first');
    show(b, 'a', 'second');
    expect(b.toasts.visible()).toEqual([{ plugin: 'a', text: 'second' }]);
    expect(b.debug).toEqual(['$.ui.toast (a): first gave way, cut short']);
  });

  test('or one that is waiting to show: gave way, unseen; another mod`s toast is not replaced', () => {
    const b = board('classic');
    show(b, 'a', 'a-first');
    show(b, 'b', 'b-first');
    show(b, 'b', 'b-second');
    expect(b.debug).toEqual(['$.ui.toast (b): b-first gave way, unseen']);
    expect(b.toasts.visible()).toEqual([{ plugin: 'a', text: 'a-first' }]);
    b.clock.advance(4000);
    expect(b.toasts.visible()).toEqual([]);
  });

  test('in fullscreen rendering a newer toast does not take the place of an older one, and at most three are drawn', () => {
    const b = board('fullscreen');
    for (const text of ['1', '2', '3', '4']) show(b, 'a', text);
    expect(b.toasts.visible().map((t) => t.text)).toEqual(['1', '2', '3']);
    expect(b.debug).toEqual([]);
  });

  test('in fullscreen rendering a toast can run out of time before it is drawn: the debug line says it never was', () => {
    const b = board('fullscreen');
    for (const text of ['1', '2', '3']) show(b, 'a', text, 60_000);
    show(b, 'a', 'late', 1000);
    b.clock.advance(1000);
    expect(b.debug).toEqual(['$.ui.toast (a): late left the stack, never drawn']);
    expect(b.toasts.visible().map((t) => t.text)).toEqual(['1', '2', '3']);
  });

  test('a pane that holds toasts holds them while it shows, and they appear when the hold ends', () => {
    const b = board('fullscreen');
    show(b, 'a', 'wait');
    b.held.value = true;
    expect(b.toasts.visible()).toEqual([]);
    b.held.value = false;
    expect(b.toasts.visible().map((t) => t.text)).toEqual(['wait']);
  });
});

spec('mods.api.$.state', () => {
  test('a ui.render hook that reads a $.state value subscribes its site: writing the value redraws, and a value it did not read does not', async () => {
    const { iface, calls } = fakeInterface();
    const h = await apiHarness({ rules: withUiRules, ui: uiOver(iface) });
    await h.mod('counter', 'user', [
      fn('ui.render', async ($) => {
        const count = await $.state.get({ plugin: 'counter', key: 'count' });
        return node('Text', { children: [`Count: ${String(count)}`] });
      }),
    ]);
    const redraws = () => calls.filter((c) => c.name === 'redraw').length;
    await h.api.state.set({ plugin: 'counter', key: 'count' }, 1);
    expect(redraws()).toBe(0);
    await h.ui?.draw({ site: 'Pane', surface: 'terminal', requestId: 'counter' });
    await h.api.state.set({ plugin: 'counter', key: 'other' }, 1);
    expect(redraws()).toBe(0);
    await h.api.state.set({ plugin: 'counter', key: 'count' }, 2);
    expect(redraws()).toBe(1);
    // The value is read again by the redraw: still subscribed after the next drawing.
    await h.ui?.draw({ site: 'Pane', surface: 'terminal', requestId: 'counter' });
    h.clock.advance(1000);
    await h.api.state.set({ plugin: 'counter', key: 'count' }, 3);
    expect(redraws()).toBe(2);
  });
});
