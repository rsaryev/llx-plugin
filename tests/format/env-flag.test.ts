/**
 * env-vars.md § Variables: "For variables that turn a behavior on or off, set `1`, `true`, `yes`,
 * or `on` to turn it on and `0`, `false`, `no`, or `off` to turn it off, in any casing." Judgment
 * (spec/judgments.md): surrounding blanks are ignored, as a shell `export X=" 1"` is still meant on.
 */
import { expect, test } from 'bun:test';
import { isFalsyEnv, isTruthyEnv } from '../../src/format/env-flag.ts';

test('the four on spellings, in any casing, turn a switch on', () => {
  for (const value of ['1', 'true', 'TRUE', 'Yes', 'oN']) expect(isTruthyEnv(value)).toBe(true);
});

test('anything else is not on: the off spellings, the empty string, an unset variable, other text', () => {
  for (const value of ['0', 'false', 'no', 'off', '', undefined, '2', 'enabled']) {
    expect(isTruthyEnv(value)).toBe(false);
  }
});

test('the four off spellings, in any casing, turn a switch off', () => {
  for (const value of ['0', 'False', 'NO', 'off']) expect(isFalsyEnv(value)).toBe(true);
  for (const value of ['', undefined, '1', 'nope']) expect(isFalsyEnv(value)).toBe(false);
});

test('surrounding blanks are ignored (judgment)', () => {
  expect(isTruthyEnv(' 1 ')).toBe(true);
  expect(isFalsyEnv('\toff\n')).toBe(true);
});
