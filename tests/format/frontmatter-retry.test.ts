/**
 * Claude Code retries frontmatter its YAML parser refuses with the plain value of each top-level
 * `key: value` line quoted when it holds a character plain YAML cannot. What the retry leaves
 * alone stays an error. Every case is an input run through `claude plugin validate` 2.1.319
 * (spec/judgments.md, "oracle 2.1.319").
 */
import { describe, expect, test } from 'bun:test';
import { parseFrontmatter } from '../../src/format/index.ts';

const read = (...lines: string[]) => parseFrontmatter(`---\n${lines.join('\n')}\n---\nbody`);
const loads = (...lines: string[]): boolean => read(...lines).state === 'ok';

describe('values the retry reads as the text written', () => {
  test('a colon, flow brackets, a star or an at sign inside a plain value', () => {
    expect(read('description: Does X: then Y').fields.description).toBe('Does X: then Y');
    expect(read('argument-hint: [filename] [format]').fields['argument-hint']).toBe(
      '[filename] [format]',
    );
    expect(read('tools: *').fields.tools).toBe('*');
    expect(read('tags: [a, @b]', 'other: x: y').fields.tags).toBe('[a, @b]');
  });

  test('an unclosed flow bracket is the text written (oracle 2.1.322: the skill is listed, the agent is named `[`)', () => {
    expect(read('name: [', 'description: d').fields).toEqual({ name: '[', description: 'd' });
    expect(read('tools: [a, b').fields.tools).toBe('[a, b');
  });

  test('a quoted start followed by more text, when the text holds such a character', () => {
    expect(loads('hint: "a: b" c')).toBe(true);
    expect(loads('hint: "a: b" or c')).toBe(true);
    expect(loads('hint: "<t>" --o "A, B" [--c "p, c"]')).toBe(true);
  });

  test('a flow map that parses is a string once the retry has run (it is quoted too)', () => {
    expect(read('metadata: {"a": 1}', 'description: a: b').fields.metadata).toBe('{"a": 1}');
    expect(read('metadata: {"a": 1}').fields.metadata).toEqual({ a: 1 });
  });
});

describe('what the retry does not touch', () => {
  test('a value wrapped in one kind of quote, whatever is inside', () => {
    expect(loads('hint: "a" or "b"')).toBe(false);
    expect(loads('hint: "a: b" or "c"')).toBe(false);
    expect(loads('hint: "a \\q"')).toBe(false);
  });

  test('a value with no special character, and an unterminated quote', () => {
    expect(loads('hint: "a" b')).toBe(false);
    expect(loads('hint: "unclosed')).toBe(false);
  });

  test('an indented line, and the marker of a block scalar (the retry breaks the lines after it)', () => {
    expect(loads('top:', '  tags: [a, @b]')).toBe(false);
    expect(loads('description: >', '  folded text', 'argument-hint: [a] [b]')).toBe(false);
  });
});

test('a duplicate key loads and the later value wins', () => {
  expect(read('a: 1', 'a: 2').fields).toEqual({ a: 2 });
});
