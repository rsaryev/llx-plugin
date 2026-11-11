/**
 * tools-reference.md § Read tool behavior ("returns the contents with line numbers"; "Reading an
 * empty file returns a notice that the file exists but its contents are empty, and an `offset` past
 * the last line returns a notice giving the file's line count") and hooks.md § Read (`offset`
 * "Optional line number to start reading from", `limit` "Optional number of lines to read").
 * Large-file limits count tokens and bytes, which the host measures; the kit windows the lines.
 * The base of `offset` (the docs give 10 and no base), the wording of the notices and how a file's
 * lines are counted are judgments, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { readWindow } from '../../src/rules/index.ts';
import { spec } from '../support/spec.ts';

const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');

spec('tools.input.Read.offset', () => {
  test('a read without an offset starts at the first line and carries line numbers', () => {
    const read = readWindow('alpha\nbeta\ngamma\n', {});
    expect(read.issues).toEqual([]);
    expect(read.notice).toBeUndefined();
    expect(read.lines).toEqual([
      { number: 1, text: 'alpha' },
      { number: 2, text: 'beta' },
      { number: 3, text: 'gamma' },
    ]);
  });

  test('"line number to start reading from": the hooks.md example, 10, starts at line 10', () => {
    const read = readWindow(lines(30), { offset: 10 });
    expect(read.lines[0]).toEqual({ number: 10, text: 'line 10' });
    expect(read.lines.at(-1)).toEqual({ number: 30, text: 'line 30' });
    expect(read.lines).toHaveLength(21);
  });

  test('the last line can be read by naming its number', () => {
    const read = readWindow(lines(5), { offset: 5 });
    expect(read.lines).toEqual([{ number: 5, text: 'line 5' }]);
    expect(read.notice).toBeUndefined();
  });

  test('"an `offset` past the last line returns a notice giving the file\'s line count"', () => {
    const read = readWindow(lines(5), { offset: 6 });
    expect(read.lines).toEqual([]);
    expect(read.lineCount).toBe(5);
    expect(read.notice).toContain('5 lines');
    expect(readWindow(lines(5), { offset: 500 }).notice).toContain('5 lines');
  });

  test('an offset inside the file gives no notice', () => {
    expect(readWindow(lines(5), { offset: 3 }).notice).toBeUndefined();
  });
});

spec('tools.input.Read.limit', () => {
  test('"number of lines to read": the hooks.md example, 50, reads the first 50 lines', () => {
    const read = readWindow(lines(120), { limit: 50 });
    expect(read.lines).toHaveLength(50);
    expect(read.lines[0]?.number).toBe(1);
    expect(read.lines.at(-1)).toEqual({ number: 50, text: 'line 50' });
  });

  test('offset and limit together read a page: the way to read "a larger file in pages"', () => {
    const read = readWindow(lines(500), { offset: 101, limit: 100 });
    expect(read.lines[0]?.number).toBe(101);
    expect(read.lines.at(-1)?.number).toBe(200);
    expect(read.lines).toHaveLength(100);
  });

  test('a limit past the end returns what is left, with no notice', () => {
    const read = readWindow(lines(5), { offset: 4, limit: 50 });
    expect(read.lines.map((line) => line.number)).toEqual([4, 5]);
    expect(read.notice).toBeUndefined();
  });

  test('the line count is that of the whole file whatever the window', () => {
    expect(readWindow(lines(120), { offset: 10, limit: 5 }).lineCount).toBe(120);
  });
});

spec(['tools.tool.Read', 'tools.input.Read.offset'], () => {
  test('"Reading an empty file returns a notice that the file exists but its contents are empty"', () => {
    const read = readWindow('', {});
    expect(read.lines).toEqual([]);
    expect(read.lineCount).toBe(0);
    expect(read.notice).toContain('empty');
    expect(readWindow('', { offset: 5 }).notice).toContain('empty');
  });

  test('a file with content is not reported empty, and a file of one blank line is not empty', () => {
    expect(readWindow('x', {}).notice).toBeUndefined();
    const blank = readWindow('\n', {});
    expect(blank.notice).toBeUndefined();
    expect(blank.lines).toEqual([{ number: 1, text: '' }]);
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in the Read tool', () => {
  test('offset is 1-based, an offset below 1 or one that is not an integer is an issue and reads from the start', () => {
    for (const offset of [0, -3, 1.5, Number.NaN]) {
      const read = readWindow(lines(3), { offset });
      expect(read.issues).toHaveLength(1);
      expect(read.issues[0]?.path).toBe('tool_input.offset');
      expect(read.lines).toHaveLength(3);
    }
  });

  test('a limit below 1 or one that is not an integer is an issue and reads to the end', () => {
    for (const limit of [0, -1, 2.5]) {
      const read = readWindow(lines(3), { limit });
      expect(read.issues).toHaveLength(1);
      expect(read.issues[0]?.path).toBe('tool_input.limit');
      expect(read.lines).toHaveLength(3);
    }
  });

  test('a line ends at a newline or a carriage return and newline; a final newline starts no line', () => {
    expect(readWindow('a\r\nb\r\n', {}).lines.map((line) => line.text)).toEqual(['a', 'b']);
    expect(readWindow('a\nb', {}).lineCount).toBe(2);
    expect(readWindow('a\nb\n', {}).lineCount).toBe(2);
    expect(readWindow('a\n\n', {}).lineCount).toBe(2);
  });
});
