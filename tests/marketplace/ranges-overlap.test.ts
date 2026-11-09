/**
 * plugins/dependencies.md § Combine constraints from several plugins (the three-row table: `~2.1`
 * and `~3.0` "has conflicting version requirements"). `rangesOverlap` is the question that table
 * asks of the ranges before any tag is looked at, exported so a host that fetches a dependency at
 * the combined range can skip the fetch for ranges no version meets and let `combineRanges` report
 * the conflict. The export is a packaging choice, not documented behaviour, so this file is outside
 * `spec(...)` (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { rangesOverlap } from '../../src/index.ts';

describe('judgments (outside spec)', () => {
  test('ranges that share a version overlap', () => {
    expect(rangesOverlap(['^2.0', '>=2.1'])).toBe(true);
    expect(rangesOverlap(['^2.0.0 || ^3.0.0', '~3.1'])).toBe(true);
  });

  test('ranges no version satisfies do not overlap', () => {
    expect(rangesOverlap(['~2.1', '~3.0'])).toBe(false);
    expect(rangesOverlap(['^1.0.0', '^2.0.0'])).toBe(false);
  });

  test('too many alternatives to intersect are undecided', () => {
    const wide = Array.from({ length: 7 }, (_, index) => `^${index}.0.0`).join(' || ');
    expect(rangesOverlap([wide, wide, wide])).toBeUndefined();
  });
});
