import { describe, expect, test } from 'bun:test';
import { jsonBytes, jsonChars } from '../../src/foundation/index.ts';

describe('JSON size', () => {
  test('characters and UTF-8 bytes of the JSON text', () => {
    expect(jsonChars({ a: 'é' })).toBe('{"a":"é"}'.length);
    expect(jsonBytes({ a: 'é' })).toBe('{"a":"é"}'.length + 1);
  });
  test('a value JSON cannot write has no size', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(jsonChars(cycle)).toBeUndefined();
    expect(jsonBytes(cycle)).toBeUndefined();
    expect(jsonChars(undefined)).toBeUndefined();
    expect(jsonBytes(() => 1)).toBeUndefined();
    expect(jsonChars(10n)).toBeUndefined();
  });
});
