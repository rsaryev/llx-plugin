/**
 * Judgment (spec/judgments.md, `src/rules/tools/responses/structured-patch.ts`): agent-sdk/typescript.md
 * types an `Edit` or `Write` result's `structuredPatch` as hunks of `{ oldStart, oldLines, newStart,
 * newLines, lines }` and says nothing of how a host derives them from its own diff.
 */
import { describe, expect, test } from 'bun:test';
import { structuredPatchOf } from '../../src/entry/rules.ts';

const header = ['Index: a.txt', '='.repeat(10), '--- a.txt', '+++ a.txt'];

describe('structuredPatchOf', () => {
  test('reads a hunk of a unified diff and skips the file headers', () => {
    const diff = [...header, '@@ -1,2 +1,2 @@', ' line', '-old', '+new', ''].join('\n');
    expect(structuredPatchOf(diff)).toEqual([
      { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: [' line', '-old', '+new'] },
    ]);
  });

  test('reads several hunks, with a count left out meaning one', () => {
    const diff = ['@@ -1 +1 @@', '-a', '+b', '@@ -9,3 +9,4 @@', ' x', '+y', ' z', ' w', ''].join(
      '\n',
    );
    expect(structuredPatchOf(diff)).toEqual([
      { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] },
      { oldStart: 9, oldLines: 3, newStart: 9, newLines: 4, lines: [' x', '+y', ' z', ' w'] },
    ]);
  });

  test('keeps a no-newline marker with the line it follows, and a blank context line as a space', () => {
    const diff = ['@@ -1,2 +1,2 @@', '', '-a', '\\ No newline at end of file', '+b'].join('\n');
    expect(structuredPatchOf(diff)[0]?.lines).toEqual([
      ' ',
      '-a',
      '\\ No newline at end of file',
      '+b',
    ]);
  });

  test('an empty diff, or text with no hunk, has none', () => {
    expect(structuredPatchOf('')).toEqual([]);
    expect(structuredPatchOf('not a diff\n')).toEqual([]);
  });
});
