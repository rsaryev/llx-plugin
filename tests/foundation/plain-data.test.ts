import { describe, expect, test } from 'bun:test';
import { plainDataProblem, walkPlainData } from '../../src/foundation/index.ts';

const stats = (value: unknown) => {
  const walked = walkPlainData(value);
  return 'stats' in walked ? walked.stats : undefined;
};

describe('walkPlainData', () => {
  test('counts levels (a scalar is 0, an array or object is a level), nodes and characters', () => {
    expect(stats('x')?.depth).toBe(0);
    expect(stats([1])?.depth).toBe(1);
    expect(stats([[1]])?.depth).toBe(2);
    expect(stats([])?.depth).toBe(1);
    expect(stats({ ab: ['cde'] })).toEqual({ depth: 2, nodes: 3, chars: 2 + 3 });
  });
  test('reports the first limit gone past', () => {
    expect(plainDataProblem([[[1]]], { maxDepth: 2 })).toBe('depth');
    expect(plainDataProblem([[[1]]], { maxDepth: 3 })).toBeUndefined();
    expect(plainDataProblem([1, 2, 3], { maxNodes: 3 })).toBe('nodes');
    expect(plainDataProblem(['abcd'], { maxChars: 3 })).toBe('chars');
  });
  test('measures 200000 levels without recursing, and ends on a cycle', () => {
    let deep: unknown = 0;
    for (let level = 0; level < 200_000; level += 1) deep = [deep];
    expect(plainDataProblem(deep, { maxDepth: 28_000 })).toBe('depth');
    const items: unknown[] = [];
    const cycle = { items };
    items.push(cycle);
    expect(plainDataProblem(cycle, { maxDepth: 5 })).toBeUndefined();
  });
});
