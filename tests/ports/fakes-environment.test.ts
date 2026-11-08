/** The fakes of the clock, locations, environment and scratch ports. */
import { describe, expect, test } from 'bun:test';
import { fakeEnvironment, fixedClock, locations, memoryScratch } from '../support/ports.ts';
import { rejection } from '../support/rejection.ts';

describe('fixedClock', () => {
  test('stands still and moves only by advance, firing due timers in order', () => {
    const clock = fixedClock(1000);
    const fired: string[] = [];
    clock.setTimer(() => fired.push('late'), 50);
    clock.setTimer(() => fired.push('early'), 10);
    const cancel = clock.setTimer(() => fired.push('cancelled'), 20);
    cancel();
    expect(clock.now()).toBe(1000);
    clock.advance(30);
    expect(fired).toEqual(['early']);
    expect(clock.now()).toBe(1030);
    expect(clock.pending()).toBe(1);
    clock.advance(20);
    expect(fired).toEqual(['early', 'late']);
  });
  test('a timer set from a callback fires in the same advance when it is due', () => {
    const clock = fixedClock();
    const fired: number[] = [];
    clock.setTimer(() => clock.setTimer(() => fired.push(clock.now()), 5), 5);
    clock.advance(10);
    expect(fired).toEqual([10]);
  });
  test('sleep resolves on advance and rejects with the reason on abort', async () => {
    const clock = fixedClock();
    const slept = clock.sleep(100);
    clock.advance(100);
    await slept;
    const controller = new AbortController();
    const aborted = clock.sleep(100, controller.signal);
    controller.abort(new Error('stop'));
    expect(await rejection(aborted)).toBe('stop');
    expect(clock.pending()).toBe(0);
    expect(await rejection(clock.sleep(1, controller.signal))).toBe('stop');
  });
});

describe('locations', () => {
  test('answers fixed paths, joins them and records data folders asked for', async () => {
    const where = locations({ directories: ['/work/app/.claude'] });
    expect(where.homeDir()).toBe('/home/user');
    expect(where.projectDir()).toBe('/work/app');
    expect(where.pluginRoot('demo@market')).toBe('/plugins/demo@market');
    expect(await where.pluginData('demo@market')).toBe('/data/demo@market');
    expect(where.dataCreated).toEqual(['demo@market']);
    expect(where.joinPath('/plugins/demo/', './skills/a')).toBe('/plugins/demo/skills/a');
    expect(await where.existingDirectory(['/nope', '/work/app/.claude'])).toBe('/work/app/.claude');
    expect(await where.existingDirectory(['/nope'])).toBeUndefined();
  });
});

describe('fakeEnvironment and memoryScratch', () => {
  test('the environment answers its own variables only, and snapshots a copy', () => {
    const env = fakeEnvironment({ HOME: '/h' });
    expect(env.get('HOME')).toBe('/h');
    expect(env.get('toString')).toBeUndefined();
    expect(env.snapshot()).toEqual({ HOME: '/h' });
    expect(env.snapshot()).not.toBe(env.snapshot());
  });
  test('scratch returns a distinct path for every write and keeps the content', async () => {
    const scratch = memoryScratch();
    const first = await scratch.write('hook.txt', 'a');
    const second = await scratch.write('hook.txt', 'b');
    expect(first).not.toBe(second);
    expect(scratch.files.get(second)).toBe('b');
  });
});
