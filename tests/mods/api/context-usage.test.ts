/**
 * Judgment (spec/judgments.md, `src/mods/api/context-usage.ts`): reference.md, "Mods API methods" says
 * `context` has `tokens`, `window` and `percent`, and not how `percent` is rounded.
 */
import { describe, expect, test } from 'bun:test';
import { contextUsage } from '../../../src/index.ts';

describe('contextUsage', () => {
  test('names the tokens, the window and the whole percent nearest to their ratio', () => {
    expect(contextUsage({ tokens: 1_000, window: 3_000 })).toEqual({
      window: 3_000,
      tokens: 1_000,
      percent: 33,
    });
    expect(contextUsage({ tokens: 2_000, window: 3_000 }).percent).toBe(67);
  });

  test('leaves tokens and percent out while the window is not measured', () => {
    expect(contextUsage({ window: 200_000 })).toEqual({ window: 200_000 });
  });

  test('leaves percent out of a window of no size', () => {
    expect(contextUsage({ tokens: 5, window: 0 })).toEqual({ window: 0, tokens: 5 });
  });
});
