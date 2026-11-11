/** Judgment (spec/judgments.md, the URL pattern and tool pattern rows): the one `*` wildcard of the kit. */
import { expect, test } from 'bun:test';
import { escapeRegExp, matchesWildcard, wildcardSource } from '../../src/format/wildcard.ts';

test('a pattern without `*` matches only the same text', () => {
  expect(matchesWildcard('a.com', 'a.com')).toBe(true);
  expect(matchesWildcard('a.com', 'b.a.com')).toBe(false);
});

test('`*` matches any run of characters, none included, and the whole text must match', () => {
  expect(matchesWildcard('*.a.com', 'x.a.com')).toBe(true);
  expect(matchesWildcard('*.a.com', 'a.com')).toBe(false);
  expect(matchesWildcard('a*b*c', 'abc')).toBe(true);
  expect(matchesWildcard('a*b*c', 'axxbyyc')).toBe(true);
  expect(matchesWildcard('a*b*c', 'acb')).toBe(false);
  expect(matchesWildcard('ab*ba', 'aba')).toBe(false);
  expect(matchesWildcard('*', '')).toBe(true);
  expect(matchesWildcard('**', 'x')).toBe(true);
});

test('every regular-expression character of a literal is escaped, `*` and `?` included', () => {
  const literal = 'a.b+c?d^e$f{g}h(i)j|k[l]m\\n*o/p';
  expect(new RegExp(`^${escapeRegExp(literal)}$`).test(literal)).toBe(true);
  expect(new RegExp(`^${escapeRegExp('a*')}$`).test('aaa')).toBe(false);
});

test('the regular-expression source of a `*` pattern takes what a `*` may match', () => {
  expect(new RegExp(`^${wildcardSource('a*.c')}$`).test('a/b\n.c')).toBe(true);
  expect(new RegExp(`^${wildcardSource('a*.c', '[^/]*')}$`).test('a/b.c')).toBe(false);
  expect(new RegExp(`^${wildcardSource('a?.c')}$`).test('ab.c')).toBe(false);
});
