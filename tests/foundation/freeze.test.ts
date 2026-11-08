import { describe, expect, test } from 'bun:test';
import { deepFreeze } from '../../src/foundation/index.ts';

const run = (): number => 1;

describe('deepFreeze', () => {
  test('freezes objects and arrays at every level, in place, and returns the same value', () => {
    const value = { a: { b: [1, { c: 2 }] }, list: [[1]] };
    const frozen = deepFreeze(value);
    expect(frozen).toBe(value);
    for (const part of [value, value.a, value.a.b, value.a.b[1], value.list, value.list[0]]) {
      expect(Object.isFrozen(part)).toBe(true);
    }
  });
  test('reaches 100000 levels without recursing, and survives a cycle and a shared object', () => {
    let deep: unknown = 'leaf';
    for (let level = 0; level < 100_000; level += 1) deep = [deep];
    expect(Object.isFrozen(deepFreeze(deep))).toBe(true);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const shared = { x: 1 };
    deepFreeze({ cycle, one: shared, two: shared });
    expect(Object.isFrozen(cycle)).toBe(true);
    expect(Object.isFrozen(shared)).toBe(true);
  });
  test('leaves what is not plain data alone: functions, class instances and typed arrays', () => {
    class Box {
      value = 1;
    }
    const box = new Box();
    const bytes = new Uint8Array(4);
    deepFreeze({ box, bytes, run });
    expect(Object.isFrozen(box)).toBe(false);
    expect(Object.isFrozen(bytes)).toBe(false);
    expect(Object.isFrozen(run)).toBe(false);
  });
  test('primitives pass through', () => {
    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze('x')).toBe('x');
  });
});
