/**
 * Redraws and `$.state` subscriptions; toasts are in toast.test.ts.
 * plugins/mods/interface.md § Redraw a site ("How often a site can redraw": "Calls that come
 * faster than the limit are coalesced into one redraw. That redraw runs your hook once, and the hook
 * reads your data as it is at that moment, so the latest value shows and the values in between
 * don't"); plugins/mods/reference.md § Limits (`$.ui.invalidate('ui.render')`: 10 a second, 30 in the
 * terminal for the visible pane, the expanded band and the hint line); plugins/mods/interface.md §
 * Keep a value in `$.state` ("a `ui.render` hook can read state and can't write it"). The kit
 * throttles; what the app draws is the app's, so no test claims it. The window the throttle uses (a minimum gap) is a judgment (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { createRedrawGate, withUiRules } from '../../../src/mods/ui/index.ts';
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

  // Judgment (spec/judgments.md): a ui.render hook "can read state and can't write it"; the kit does not refuse the write, it only asks for no redraw for a value the drawing in progress read.
  test('judgment: a ui.render hook that writes a value it read does not redraw its own site in a loop', async () => {
    const { iface, calls } = fakeInterface();
    const h = await apiHarness({ rules: withUiRules, ui: uiOver(iface) });
    const key = { plugin: 'counter', key: 'count' };
    await h.mod('counter', 'user', [
      fn('ui.render', async ($) => {
        const count = await $.state.get(key);
        await $.state.set(key, Number(count ?? 0) + 1);
        return node('Text', { children: [`Count: ${String(count)}`] });
      }),
    ]);
    await h.ui?.draw({ site: 'Pane', surface: 'terminal', requestId: 'counter' });
    h.clock.advance(1000);
    expect(calls.filter((c) => c.name === 'redraw')).toHaveLength(0);
    expect(await h.api.state.get(key)).toBe(1);
  });
});
