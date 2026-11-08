/**
 * skills.md § Available string substitutions (`${CLAUDE_EFFORT}`: low, medium, high, xhigh or
 * max). The SDK's `EffortLevel` is asserted equal to `EFFORT_LEVELS` at compile time; this proves
 * the runtime list is the documented one, lowest first.
 */
import { describe, expect, test } from 'bun:test';
import { EFFORT_LEVELS } from '../../src/protocol/effort.ts';

describe('EFFORT_LEVELS', () => {
  test('are the five levels skills.md lists for ${CLAUDE_EFFORT}, lowest first', () => {
    expect<readonly string[]>(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });
});
