/** `createHookRegistry`: the immutable registry the select stage reads (no requirement id; no docs behaviour). */
import { describe, expect, test } from 'bun:test';
import { createHookRegistry } from '../../src/hooks/registry.ts';
import { entry } from '../support/hooks-select.ts';

describe('the hook registry', () => {
  const first = entry('PreToolUse');
  const second = entry('Stop');

  test('keeps entries in the order given', () => {
    expect(createHookRegistry([first, second]).entries).toEqual([first, second]);
  });

  test('`with` appends and leaves the original untouched', () => {
    const base = createHookRegistry([first]);
    expect(base.with([second]).entries).toEqual([first, second]);
    expect(base.entries).toEqual([first]);
  });

  test('`without` drops by id and leaves the original untouched', () => {
    const base = createHookRegistry([first, second]);
    expect(base.without([first.id]).entries).toEqual([second]);
    expect(base.entries).toEqual([first, second]);
  });
});
