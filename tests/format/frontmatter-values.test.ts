/**
 * skills.md, "Frontmatter reference" and sub-agents.md list the accepted spellings (a boolean
 * field, a space- or comma-separated `allowed-tools`, a list or a string for `tools`); how a bad
 * value is reported is the kit's judgment (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import {
  readEnum,
  readFlag,
  readInteger,
  readList,
  readTable,
  readText,
} from '../../src/format/frontmatter-values.ts';

describe('readFlag', () => {
  test('reads the documented spellings in any letter case', () => {
    for (const yes of [true, 1, 'true', 'TRUE', 'Yes', 'on', '1', ' on ']) {
      expect(readFlag('k', yes)).toEqual({ value: true });
    }
    for (const no of [false, 0, 'false', 'No', 'OFF', '0']) {
      expect(readFlag('k', no)).toEqual({ value: false });
    }
  });
  test('absent is absent, without a problem', () => {
    expect(readFlag('k', undefined)).toEqual({ value: undefined });
    expect(readFlag('k', null)).toEqual({ value: undefined });
  });
  test('anything else is dropped with a problem naming the key', () => {
    for (const wrong of ['maybe', 2, [], {}, '', 'constructor', '__proto__', 'toString']) {
      const read = readFlag('background', wrong);
      expect(read.value).toBeUndefined();
      expect(read.problem?.key).toBe('background');
    }
  });
});

describe('readText', () => {
  test('trims strings and writes out numbers and booleans', () => {
    expect(readText('k', '  hello \n')).toEqual({ value: 'hello' });
    expect(readText('k', 12)).toEqual({ value: '12' });
    expect(readText('k', true)).toEqual({ value: 'true' });
  });
  test('blank and null are absent; a list or table is a problem', () => {
    expect(readText('k', '  ')).toEqual({ value: undefined });
    expect(readText('k', null)).toEqual({ value: undefined });
    expect(readText('k', ['a']).problem).toEqual({ key: 'k', reason: 'is not text' });
    expect(readText('k', {}).value).toBeUndefined();
  });
});

const BOTH = { separators: 'space-or-comma' } as const;
const COMMA = { separators: 'comma' } as const;
const GLOB = { separators: 'comma', braces: true } as const;
const readListBoth = (key: string, value: unknown) => readList(key, value, BOTH);

describe('readList', () => {
  test('splits a string on spaces and commas', () => {
    expect(readListBoth('k', 'Read Grep, Glob').value).toEqual(['Read', 'Grep', 'Glob']);
    expect(readListBoth('k', 'Read,Grep').value).toEqual(['Read', 'Grep']);
  });
  test('spaces and commas inside parentheses do not split', () => {
    expect(readListBoth('k', 'Bash(git add *) Bash(git commit -m "a, b")').value).toEqual([
      'Bash(git add *)',
      'Bash(git commit -m "a, b")',
    ]);
    expect(readListBoth('k', 'Bash(npm run *) Read').value).toEqual(['Bash(npm run *)', 'Read']);
  });
  test('nested and unbalanced parentheses stay in one item', () => {
    expect(readListBoth('k', 'A(b (c d)) E').value).toEqual(['A(b (c d))', 'E']);
    expect(readListBoth('k', 'A(b c d').value).toEqual(['A(b c d']);
    expect(readListBoth('k', 'a) b').value).toEqual(['a)', 'b']);
  });
  test('keeps the items of a YAML list whole and trimmed', () => {
    expect(readListBoth('k', ['Read', ' Bash(git add *) ', '']).value).toEqual([
      'Read',
      'Bash(git add *)',
    ]);
  });
  test('an empty string is an empty list; null is absent', () => {
    expect(readListBoth('k', '')).toEqual({ value: [] });
    expect(readListBoth('k', null)).toEqual({ value: undefined });
  });
  test('an item that is not text is dropped with a problem; a table is dropped whole', () => {
    expect(readListBoth('tools', ['Read', 3, 'Grep'])).toEqual({
      value: ['Read', 'Grep'],
      problem: { key: 'tools', reason: 'has an item that is not text' },
    });
    expect(readListBoth('tools', { a: 1 }).value).toBeUndefined();
    expect(readListBoth('tools', 5).problem?.key).toBe('tools');
  });
  test('comma mode keeps spaces inside an item and trims the items', () => {
    expect(readList('tools', 'Read, Grep Glob', COMMA).value).toEqual(['Read', 'Grep Glob']);
    expect(readList('paths', 'my dir/**', COMMA).value).toEqual(['my dir/**']);
  });
  test('braces keep a glob alternation whole when asked', () => {
    expect(readList('paths', 'src/**/*.{ts,tsx}, lib/**', GLOB).value).toEqual([
      'src/**/*.{ts,tsx}',
      'lib/**',
    ]);
    expect(readList('paths', 'a/{b,c', GLOB).value).toEqual(['a/{b,c']);
    expect(readList('paths', 'a/{b,c}, d', COMMA).value).toEqual(['a/{b', 'c}', 'd']);
  });
});

describe('readInteger', () => {
  test('reads whole numbers, as numbers or strings of digits', () => {
    expect(readInteger('maxTurns', 12)).toEqual({ value: 12 });
    expect(readInteger('maxTurns', ' 12 ')).toEqual({ value: 12 });
    expect(readInteger('maxTurns', -3)).toEqual({ value: -3 });
  });
  test('absent is absent, without a problem', () => {
    expect(readInteger('k', undefined)).toEqual({ value: undefined });
    expect(readInteger('k', null)).toEqual({ value: undefined });
  });
  test('a fraction, text, a boolean or a list is dropped with a problem', () => {
    for (const wrong of [1.5, 'ten', '1.5', '', true, [1], {}, Number.NaN, 2 ** 60]) {
      const read = readInteger('maxTurns', wrong);
      expect(read.value).toBeUndefined();
      expect(read.problem?.key).toBe('maxTurns');
    }
  });
  test('bounds are inclusive and named in the problem', () => {
    const bounds = { min: 100_000, max: 1_000_000 };
    expect(readInteger('autoCompactWindow', 100_000, bounds).value).toBe(100_000);
    expect(readInteger('autoCompactWindow', 1_000_000, bounds).value).toBe(1_000_000);
    expect(readInteger('autoCompactWindow', 99_999, bounds).problem?.reason).toBe(
      'must be at least 100000 and at most 1000000',
    );
    expect(readInteger('n', 11, { max: 10 }).problem?.reason).toBe('must be at most 10');
    expect(readInteger('n', 0, { min: 1 }).problem?.reason).toBe('must be at least 1');
  });
});

describe('readTable', () => {
  test('keeps a table; drops a list or a scalar with the documented reason', () => {
    expect(readTable('metadata', { a: 1 })).toEqual({ value: { a: 1 } });
    expect(readTable('metadata', ['a'])).toEqual({
      value: undefined,
      problem: { key: 'metadata', reason: 'is a list or a single value, not a table' },
    });
    expect(readTable('metadata', 'x').value).toBeUndefined();
    expect(readTable('metadata', null)).toEqual({ value: undefined });
  });
});

describe('readEnum', () => {
  const allowed = ['bash', 'powershell'] as const;
  test('matches a member after trimming', () => {
    expect(readEnum('shell', ' bash ', allowed)).toEqual({ value: 'bash' });
  });
  test('names the members when the value is none of them', () => {
    expect(readEnum('shell', 'zsh', allowed).problem).toEqual({
      key: 'shell',
      reason: 'is not one of: bash, powershell',
    });
    expect(readEnum('shell', 'BASH', allowed).value).toBeUndefined();
  });
  test('absent is absent; a non-text value is a problem', () => {
    expect(readEnum('shell', undefined, allowed)).toEqual({ value: undefined });
    expect(readEnum('shell', ['bash'], allowed).problem?.key).toBe('shell');
  });
});
