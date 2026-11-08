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
import { apiHarness, expectMethods } from '../../support/mods-api.ts';
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

  test('after(5000, fn) calls fn once, five seconds from now, and returns a timer with cancel() at once', async () => {
    const h = await apiHarness();
    let calls = 0;
    const timer = h.api.clock.after(5000, () => (calls += 1));
    expect(Object.keys(timer)).toEqual(['cancel']);
    await flush();
    h.clock.advance(4999);
    expect(calls).toBe(0);
    h.clock.advance(1);
    expect(calls).toBe(1);
    h.clock.advance(60_000);
    expect(calls).toBe(1);
  });

  test('every(ms, fn) repeats until timer.cancel() is called, with no await in between (as test.md does)', async () => {
    const h = await apiHarness();
    let calls = 0;
    const timer = h.api.clock.every(60_000, () => (calls += 1));
    await flush();
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
    const timer = h.api.clock.after(100, () => (calls += 1));
    await flush();
    timer.cancel();
    h.clock.advance(1000);
    expect(calls).toBe(0);
  });

  test('a timer cancelled while its event is still in flight is never armed', async () => {
    const h = await apiHarness();
    let calls = 0;
    const timer = h.api.clock.every(100, () => (calls += 1));
    timer.cancel();
    await flush();
    expect(h.clock.pending()).toBe(0);
    h.clock.advance(1000);
    expect(calls).toBe(0);
  });

  test('a hook on clock.after sees the delay and can change it', async () => {
    const h = await apiHarness();
    await h.mod('slower', 'prepend', [fn('clock.after', (_$, e, next) => next({ ...e, ms: 400 }))]);
    let calls = 0;
    h.api.clock.after(100, () => (calls += 1));
    await flush();
    h.clock.advance(399);
    expect(calls).toBe(0);
    h.clock.advance(1);
    expect(calls).toBe(1);
  });

  test('a hook that refuses the timer arms nothing and the reason goes to the debug log', async () => {
    const h = await apiHarness();
    await h.mod('policy', 'prepend', [fn('clock.every', () => ({ deny: 'no timers' }))]);
    let calls = 0;
    h.api.clock.every(100, () => (calls += 1));
    await flush();
    h.clock.advance(1000);
    expect(calls).toBe(0);
    expect(h.debug).toEqual(['my-mod: my-mod: $.clock.every: no timers']);
  });

  test('a callback that throws goes to the debug log and the timer runs again at the next interval', async () => {
    const h = await apiHarness();
    let calls = 0;
    h.api.clock.every(1000, () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return Promise.reject(new Error('later'));
    });
    await flush();
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
    h.api.clock.every(1000, () => (calls += 1));
    h.api.clock.after(500, () => (calls += 10));
    await flush();
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
    expect(() => h.api.clock.after('soon', () => 1)).toThrow('$.clock.after');
    expect(() => h.api.clock.every(1000, 'not a function')).toThrow('$.clock.every');
    expect(await rejection(h.api.clock.sleep(-1))).toContain('$.clock.sleep');
  });

  test('a mock clock is a hook on clock.now, as mock.clock(on) is', async () => {
    const h = await apiHarness();
    await h.mod('mock', 'prepend', [fn('clock.now', () => ({ value: 5000 }))]);
    expect(await h.api.clock.now()).toBe(5000);
  });
});
