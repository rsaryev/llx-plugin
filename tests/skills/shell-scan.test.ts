/**
 * skills.md § Inject dynamic context: the inline form `` !`<command>` `` is recognized only when
 * `!` is at the start of a line or immediately after whitespace (`` KEY=!`cmd` `` stays literal);
 * a fenced block opened with ```` ```! ```` holds a multi-line command; "Substitution runs once
 * over the original file".
 */
import { describe, expect, test } from 'bun:test';
import { findInjections } from '../../src/skills/shell-scan.ts';

const commands = (text: string): string[] => findInjections(text).map((found) => found.command);

describe('inline form', () => {
  test('the docs example: three commands in a list', () => {
    const text = [
      '## Pull request context',
      '- PR diff: !`gh pr diff`',
      '- PR comments: !`gh pr view --comments`',
      '- Changed files: !`gh pr diff --name-only`',
    ].join('\n');
    expect(commands(text)).toEqual([
      'gh pr diff',
      'gh pr view --comments',
      'gh pr diff --name-only',
    ]);
  });

  test('"at the start of a line": the span begins at the `!`', () => {
    const [found] = findInjections('!`date`\nrest');
    expect(found).toMatchObject({ kind: 'inline', start: 0, end: 7, command: 'date' });
  });

  test('"or immediately after whitespace": a tab counts', () => {
    expect(commands('a\t!`one`')).toEqual(['one']);
  });

  test('"If `!` follows another character, as in KEY=!`cmd`, the placeholder is left as literal text"', () => {
    expect(commands('KEY=!`cmd`')).toEqual([]);
    expect(commands('(!`cmd`)')).toEqual([]);
    expect(commands('wow!`cmd`')).toEqual([]);
  });

  test('a span ends at the closing backtick; the next one is found separately', () => {
    expect(commands('!`a` !`b`')).toEqual(['a', 'b']);
  });

  test('a backtick span without `!` is plain Markdown code', () => {
    expect(commands('run `git status` yourself')).toEqual([]);
  });

  test('the raw text of the span is kept for messages', () => {
    const text = 'x !`gh pr diff` y';
    const [found] = findInjections(text);
    expect(text.slice(found?.start, found?.end)).toBe('!`gh pr diff`');
    expect(found?.open).toBe('!`');
    expect(found?.close).toBe('`');
  });
});

describe('fenced block', () => {
  test('the docs example: a multi-line command', () => {
    const text = '## Environment\n```!\nnode --version\ngit status --short\n```\n';
    const [found] = findInjections(text);
    expect(found).toMatchObject({ kind: 'fence', command: 'node --version\ngit status --short' });
    expect(text.slice(found?.start, found?.end)).toBe(
      '```!\nnode --version\ngit status --short\n```',
    );
  });

  test('an ordinary fenced block is not a command', () => {
    expect(commands('```bash\nrm -rf /\n```')).toEqual([]);
    expect(commands('```\nls\n```')).toEqual([]);
  });

  test('inline spans inside a command block belong to the block, not to a second command', () => {
    expect(commands('```!\necho !`date`\n```')).toEqual(['echo !`date`']);
  });

  test('CRLF files work: the block ends at its closing fence line', () => {
    expect(commands('```!\r\nls\r\n```\r\ntext')).toEqual(['ls']);
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('a block that is never closed is literal text, not a command', () => {
    expect(commands('```!\nls\nstill open')).toEqual([]);
  });

  test('an empty or blank command runs nothing and is left as written', () => {
    expect(commands('!` `')).toEqual([]);
    expect(commands('```!\n\n```')).toEqual([]);
    expect(commands('```!\n```')).toEqual([]);
  });

  test('an inline span does not cross a line', () => {
    expect(commands('!`a\nb`')).toEqual([]);
  });

  test('an opening fence needs the fence at the start of its line', () => {
    expect(commands('  ```!\nls\n```')).toEqual([]);
  });
});

describe('"Substitution runs once over the original file"', () => {
  test('spans are found in the text as written, in order, without overlap', () => {
    const found = findInjections('!`a`\n```!\nb\n```\n!`c`');
    expect(found.map((span) => span.command)).toEqual(['a', 'b', 'c']);
    for (const [index, span] of found.entries()) {
      expect(span.end).toBeGreaterThan(span.start);
      expect(span.start).toBeGreaterThanOrEqual(found[index - 1]?.end ?? 0);
    }
  });
});
