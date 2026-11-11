/**
 * Toasts.
 * plugins/mods/reference.md § Limits (`$.ui.toast`: 4 seconds unless `{ timeoutMs }`; in the classic
 * renderer a newer toast takes the place of the mod's older one); plugins/mods/troubleshoot.md § A
 * toast doesn't appear (`timeoutMs is a whole number of ms, 1 to 60000`; `gave way, cut short`,
 * `gave way, unseen`, `left the stack, never drawn`; a pane holding toasts); plugins/mods/interface.md
 * § Hold toasts behind a dialog ("In the terminal, the hold lasts while that pane is the one showing,
 * and a toast raised in that time waits until the hold ends"). The kit queues; what the app draws is
 * the app's, so no test claims it. That a toast's time stands still during a hold is a judgment
 * (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { createToastBoard, uiRules } from '../../../src/mods/ui/index.ts';
import { fixedClock } from '../../support/ports.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';
import { flush } from '../../support/mods-chain.ts';
import { parseToast } from '../../../src/mods/ui/toast.ts';

spec(
  [
    'mods.limit.$.ui.toast',
    `mods.troubleshoot.A toast doesn't appear.A pane is holding toasts`,
    `mods.troubleshoot.A toast doesn't appear.The line for the call is missing`,
    `mods.troubleshoot.A toast doesn't appear.The toast is under the prompt`,
    `mods.troubleshoot.A toast doesn't appear.The toast ran out of time undrawn`,
    `mods.troubleshoot.A toast doesn't appear.Your mod raised a newer toast`,
    'mods.apiGuide.Show something without starting a turn.$.ui.toast(text)',
  ],
  () => {
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
        rules: uiRules,
        ui: uiOver(iface),
      });
      h.api.ui.toast('build finished');
      h.api.ui.toast('too long', { timeoutMs: 60_001 });
      await flush();
      expect(h.debug).toEqual([
        '$.ui.toast (first-mod): build finished',
        'first-mod: $.ui.toast dropped: timeoutMs is a whole number of ms, 1 to 60000',
      ]);
      expect(h.ui?.toasts.visible()).toEqual([{ plugin: 'first-mod', text: 'build finished' }]);
      expect(h.api.ui.toast(3)).toBeUndefined();
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

    test('a toast raised while a hold lasts waits until the hold ends, even when the hold outlasts its timeout', () => {
      const b = board('fullscreen');
      b.held.value = true;
      b.toasts.syncHold();
      show(b, 'a', 'raised during', 4000);
      show(b, 'a', 'raised before', 4000);
      b.clock.advance(10_000);
      expect(b.toasts.visible()).toEqual([]);
      expect(b.debug).toEqual([]);
      b.held.value = false;
      b.toasts.syncHold();
      expect(b.toasts.visible().map((t) => t.text)).toEqual(['raised during', 'raised before']);
      b.clock.advance(3999);
      expect(b.toasts.visible()).toHaveLength(2);
      b.clock.advance(1);
      expect(b.toasts.visible()).toEqual([]);
    });

    test('a toast already showing when a hold begins keeps the time it had left', () => {
      const b = board('fullscreen');
      show(b, 'a', 'showing', 4000);
      b.clock.advance(3000);
      b.held.value = true;
      b.toasts.syncHold();
      b.clock.advance(60_000);
      b.held.value = false;
      b.toasts.syncHold();
      expect(b.toasts.visible().map((t) => t.text)).toEqual(['showing']);
      b.clock.advance(1000);
      expect(b.toasts.visible()).toEqual([]);
    });

    test('a pane that holds toasts holds the toasts of $.ui.toast while it is open, in the terminal', async () => {
      const { iface } = fakeInterface();
      const h = await apiHarness({ rules: uiRules, ui: uiOver(iface) });
      await h.api.ui.open({ id: 'dialog', holdToasts: true });
      h.api.ui.toast('later', { timeoutMs: 1000 });
      await flush();
      h.clock.advance(5000);
      expect(h.ui?.toasts.visible()).toEqual([]);
      await h.api.ui.close({ id: 'dialog' });
      expect(h.ui?.toasts.visible()).toEqual([{ plugin: 'my-mod', text: 'later' }]);
      h.clock.advance(1000);
      expect(h.ui?.toasts.visible()).toEqual([]);
    });

    test('the other apps do not hold toasts', async () => {
      const { iface } = fakeInterface({ surface: () => 'desktop' });
      const h = await apiHarness({ rules: uiRules, ui: uiOver(iface) });
      await h.api.ui.open({ id: 'dialog', holdToasts: true });
      h.api.ui.toast('now');
      await flush();
      expect(h.ui?.toasts.visible()).toEqual([{ plugin: 'my-mod', text: 'now' }]);
    });
  },
);
