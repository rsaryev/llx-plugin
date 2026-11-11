/** UTF-8 sizes: one byte count and one cut that never splits a character, for every limit in bytes. */
import { expect, test } from 'bun:test';
import { prefixWithinBytes, utf8Length } from '../../src/format/utf8.ts';
import { cutOutput } from '../../src/mods/api/output-cut.ts';

test('utf8Length counts UTF-8 bytes, not UTF-16 units', () => {
  expect(utf8Length('')).toBe(0);
  expect(utf8Length('abc')).toBe(3);
  expect(utf8Length('é')).toBe(2);
  expect(utf8Length('😀')).toBe(4);
});

test('a cut inside a character leaves the characters before it whole', () => {
  expect(prefixWithinBytes('a😀b', 3)).toBe('a');
  expect(prefixWithinBytes('a😀b', 5)).toBe('a😀');
  expect(prefixWithinBytes('abc', 10)).toBe('abc');
});

test('a text that really ends in U+FFFD keeps it when the cut falls after it', () => {
  expect(cutOutput('ab�cd', 5)).toEqual({ text: 'ab�', isTruncated: true });
  expect(cutOutput('a😀', 3)).toEqual({ text: 'a', isTruncated: true });
});
