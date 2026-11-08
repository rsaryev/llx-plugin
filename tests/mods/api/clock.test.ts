/**
 * `$.clock`.
 * plugins/mods/api.md § Run work in the background (`$.clock.every` and `$.clock.after` take the
 * place of `setInterval` and `setTimeout`, with the delay in milliseconds first: `$.clock.after(5000,
 * fn)` calls `fn` once, five seconds from now; "Each returns a timer with a `cancel()` method, and
 * `await $.clock.now()` gives the time in milliseconds"; "If the callback throws, the error goes to
 * the debug log and the timer runs again at the next interval"), § Stop background work ("Timers
 * stop after the module reloads"); plugins/mods/test.md § Test a timer (`mock.clock(on)` answers
 * `$.clock`).
 */
import { expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { flush, fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods, timerOf } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

spec('mods.api.$.clock', () => {
  test('$.clock has now, sleep, after and every; now gives milliseconds from the Clock port', async () => {
    const h = await apiHarness();
    expectMethods(h.api.clock, MODS_API.clock);
    expect(await h.api.clock.now()).toBe(0);
    h.clock.advance(1234);
    expect(await h.api.clock.now()).toBe(1234);
  });

  test('after(5000, fn) calls fn once, five seconds from now, and returns a timer with cancel()', async () => {
    const h = await apiHarness();
    let calls = 0;
    const timer = await h.api.clock.after(5000, () => (calls += 1));
    expect(Object.keys(timerOf(timer))).toEqual(['cancel']);
    h.clock.advance(4999);
    expect(calls).toBe(0);
    h.clock.advance(1);
    expect(calls).toBe(1);
    h.clock.advance(60_000);
    expect(calls).toBe(1);
  });

  test('every(ms, fn) repeats until it is cancelled', async () => {
    const h = await apiHarness();
    let calls = 0;
    const timer = timerOf(await h.api.clock.every(60_000, () => (calls += 1)));
    h.clock.advance(60_000);
    h.clock.advance(60_000);
    expect(calls).toBe(2);
    timer.cancel();
    h.clock.advance(180_000);
    expect(calls).toBe(2);
    expect(h.clock.pending()).toBe(0);
  });

  test('a timer cancelled before it fires never fires', async () => {
    const h = await apiHarness();
    let calls = 0;
    const timer = timerOf(await h.api.clock.after(100, () => (calls += 1)));
    timer.cancel();
    h.clock.advance(1000);
    expect(calls).toBe(0);
  });

  test('a callback that throws goes to the debug log and the timer runs again at the next interval', async () => {
    const h = await apiHarness();
    let calls = 0;
    await h.api.clock.every(1000, () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return Promise.reject(new Error('later'));
    });
    h.clock.advance(1000);
    h.clock.advance(1000);
    await flush();
    expect(calls).toBe(2);
    expect(h.debug).toEqual([
      'my-mod: $.clock.every callback threw: boom',
      'my-mod: $.clock.every callback threw: later',
    ]);
  });

  test('timers stop when the module is unloaded', async () => {
    const h = await apiHarness();
    let calls = 0;
    await h.api.clock.every(1000, () => (calls += 1));
    await h.api.clock.after(500, () => (calls += 10));
    h.handle.dispose();
    h.clock.advance(10_000);
    expect(calls).toBe(0);
    expect(h.clock.pending()).toBe(0);
  });

  test('sleep resolves after the delay on the Clock port', async () => {
    const h = await apiHarness();
    let woke = false;
    const sleeping = Promise.resolve(h.api.clock.sleep(250)).then(() => (woke = true));
    await flush();
    expect(woke).toBe(false);
    h.clock.advance(250);
    await sleeping;
    expect(woke).toBe(true);
  });

  test('a delay or a callback of the wrong kind rejects', async () => {
    const h = await apiHarness();
    expect(await rejection(h.api.clock.after('soon', () => 1))).toContain('$.clock.after');
    expect(await rejection(h.api.clock.every(1000, 'not a function'))).toContain('$.clock.every');
    expect(await rejection(h.api.clock.sleep(-1))).toContain('$.clock.sleep');
  });

  test('a mock clock is a hook on clock.now, as mock.clock(on) is', async () => {
    const h = await apiHarness();
    await h.mod('mock', 'prepend', [fn('clock.now', () => ({ value: 5000 }))]);
    expect(await h.api.clock.now()).toBe(5000);
  });
});
