/**
 * tools-reference.md § Grep tool behavior ("Three output modes control what comes back:
 * `files_with_matches` ... This is the default.") and hooks.md § Grep (`output_mode` "`content`,
 * `files_with_matches`, or `count`. Defaults to `files_with_matches`"); § Glob tool behavior
 * ("Results are sorted by modification time and capped at 100 files. If the cap is hit, Claude
 * sees a truncation flag in the result"). Searching and walking the disk are the host's (ripgrep,
 * the file system). The `content` and `count` modes ("When the tool's `offset` parameter points
 * past the last match ... Grep returns `No entries at this offset`"; "The total covers every match
 * even when the tool's `head_limit` or `offset` parameters truncate the listed per-file entries"),
 * `multiline` ("By default, patterns match within a single line") and the Glob paragraphs on
 * `.gitignore` (`CLAUDE_CODE_GLOB_NO_IGNORE=false`) and a null byte ("returns an error asking
 * Claude to remove it"). The direction of the modification-time sort and a value that is not a mode
 * are judgments, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  capGlobMatches,
  effectiveGrepMultiline,
  effectiveGrepOutputMode,
  globRespectsIgnore,
  GLOB_RESULT_CAP,
  GREP_OUTPUT_MODES,
  NO_ENTRIES_AT_OFFSET,
  parseToolInput,
  totalGrepCount,
  validateGlobInput,
  windowGrepContent,
  windowGrepCounts,
} from '../../src/rules/index.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

spec('tools.input.Grep.output_mode', () => {
  test('without an output_mode a search returns file paths only: files_with_matches', () => {
    expect(effectiveGrepOutputMode({ pattern: 'TODO.*fix' })).toBe('files_with_matches');
    expect(effectiveGrepOutputMode({ pattern: 'x', output_mode: undefined })).toBe(
      'files_with_matches',
    );
  });

  test('each of the three documented modes is used as sent, the hooks.md example "content" included', () => {
    expect(effectiveGrepOutputMode({ output_mode: 'content' })).toBe('content');
    expect(effectiveGrepOutputMode({ output_mode: 'files_with_matches' })).toBe(
      'files_with_matches',
    );
    expect(effectiveGrepOutputMode({ output_mode: 'count' })).toBe('count');
  });

  test('a mode the table does not list is an issue of parseToolInput and reads as the default', () => {
    const parsed = parseToolInput('Grep', { pattern: 'x', output_mode: 'lines' });
    expect(parsed.issues.map((found) => found.path)).toEqual(['tool_input.output_mode']);
    expect(effectiveGrepOutputMode(parsed.input)).toBe('files_with_matches');
  });

  test('an input that is not an object reads as the default', () => {
    expect(effectiveGrepOutputMode(undefined)).toBe('files_with_matches');
    expect(effectiveGrepOutputMode('content')).toBe('files_with_matches');
  });
});

const hits = Array.from({ length: 5 }, (_, index) => `a.ts:${index + 1}:hit`);

spec('tools.tool.Grep', () => {
  test('the one list of output modes is the three the docs name, in the table and in the default', () => {
    expect(GREP_OUTPUT_MODES).toEqual(['content', 'files_with_matches', 'count']);
    const parsed = parseToolInput('Grep', { pattern: 'x', output_mode: 'count' });
    expect(parsed.issues).toEqual([]);
  });

  test('content: an offset past the last match of a pattern that has matches returns "No entries at this offset"', () => {
    expect(NO_ENTRIES_AT_OFFSET).toBe('No entries at this offset');
    const past = windowGrepContent(hits, { offset: 5 });
    expect(past.lines).toEqual([]);
    expect(past.notice).toBe('No entries at this offset');
    expect(windowGrepContent(hits, { offset: 99 }).notice).toBe(NO_ENTRIES_AT_OFFSET);
  });

  test('content: an offset on a match lists from there and carries no notice', () => {
    const window = windowGrepContent(hits, { offset: 4 });
    expect(window.lines).toEqual(['a.ts:5:hit']);
    expect(window.notice).toBeUndefined();
  });

  test('content: head_limit lists the first N entries after the offset', () => {
    expect(windowGrepContent(hits, { offset: 1, head_limit: 2 }).lines).toEqual([
      'a.ts:2:hit',
      'a.ts:3:hit',
    ]);
  });

  test('count: the total covers every match even when head_limit and offset truncate the entries', () => {
    const counts = [
      { path: 'a.ts', count: 3 },
      { path: 'b.ts', count: 4 },
      { path: 'c.ts', count: 5 },
    ];
    const cut = windowGrepCounts(counts, { offset: 1, head_limit: 1 });
    expect(cut.entries).toEqual([{ path: 'b.ts', count: 4 }]);
    expect(cut.total).toBe(12);
    expect(totalGrepCount(counts)).toBe(12);
    expect(windowGrepCounts(counts, { offset: 3 }).total).toBe(12);
  });

  test('multiline defaults to false: patterns match within a single line', () => {
    expect(effectiveGrepMultiline({ pattern: 'a.*b' })).toBe(false);
    expect(effectiveGrepMultiline({ pattern: 'a.*b', multiline: false })).toBe(false);
    expect(effectiveGrepMultiline({ pattern: 'a.*b', multiline: true })).toBe(true);
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in Grep', () => {
  test('without head_limit a window holds 250 entries and 0 means no limit (the SDK type)', () => {
    const many = Array.from({ length: 300 }, (_, index) => `l${index}`);
    expect(windowGrepContent(many, {}).lines).toHaveLength(250);
    expect(windowGrepContent(many, { head_limit: 0 }).lines).toHaveLength(300);
  });

  test('a pattern with no match has no notice, and an offset or limit that is not a whole number counts as absent', () => {
    expect(windowGrepContent([], { offset: 3 })).toEqual({ lines: [], notice: undefined });
    expect(windowGrepContent(hits, { offset: -1, head_limit: 1.5 }).lines).toHaveLength(5);
  });

  test('only the value true turns multiline on, and an input that is not an object is single-line', () => {
    expect(effectiveGrepMultiline({ multiline: 'true' })).toBe(false);
    expect(effectiveGrepMultiline('x')).toBe(false);
  });
});

const file = (name: string, mtimeMs: number) => ({ path: name, mtimeMs });

spec('tools.tool.Glob', () => {
  test('"capped at 100 files": 100 matches are all returned, with no truncation flag', () => {
    const matches = Array.from({ length: 100 }, (_, index) => file(`f${index}.ts`, index));
    const capped = capGlobMatches(matches);
    expect(GLOB_RESULT_CAP).toBe(100);
    expect(capped.paths).toHaveLength(100);
    expect(capped.truncated).toBe(false);
  });

  test('"If the cap is hit, Claude sees a truncation flag": 101 matches keep 100 and flag it', () => {
    const matches = Array.from({ length: 101 }, (_, index) => file(`f${index}.ts`, index));
    const capped = capGlobMatches(matches);
    expect(capped.paths).toHaveLength(100);
    expect(capped.truncated).toBe(true);
  });

  test('a short result is not flagged', () => {
    const capped = capGlobMatches([file('old.ts', 1), file('new.ts', 3)]);
    expect(capped.paths).toHaveLength(2);
    expect(capped.truncated).toBe(false);
  });

  test('a pattern or path with a null byte is an error at that field, one per field', () => {
    expect(validateGlobInput({ pattern: '**/*.ts' })).toEqual([]);
    const pattern = validateGlobInput({ pattern: 'a\u0000b', path: '/src' });
    expect(pattern.map((issue) => issue.path)).toEqual(['tool_input.pattern']);
    expect(pattern[0]?.severity).toBe('error');
    expect(pattern[0]?.message).toContain('remove');
    const both = validateGlobInput({ pattern: '\u0000', path: 'x\u0000' });
    expect(both.map((issue) => issue.path)).toEqual(['tool_input.pattern', 'tool_input.path']);
  });

  test('Glob does not respect .gitignore unless CLAUDE_CODE_GLOB_NO_IGNORE is false', () => {
    expect(globRespectsIgnore(fakeEnvironment({}))).toBe(false);
    expect(globRespectsIgnore(fakeEnvironment({ CLAUDE_CODE_GLOB_NO_IGNORE: 'false' }))).toBe(true);
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in Glob', () => {
  test('only the text false makes Glob respect .gitignore, and a non-string input has no null byte', () => {
    expect(globRespectsIgnore(fakeEnvironment({ CLAUDE_CODE_GLOB_NO_IGNORE: 'true' }))).toBe(false);
    expect(globRespectsIgnore(fakeEnvironment({ CLAUDE_CODE_GLOB_NO_IGNORE: '0' }))).toBe(false);
    expect(validateGlobInput('x')).toEqual([]);
    expect(validateGlobInput({ pattern: 1 })).toEqual([]);
  });

  test('the files that survive the cap are the most recently modified', () => {
    const matches = Array.from({ length: 150 }, (_, index) => ({
      path: `f${index}.ts`,
      mtimeMs: index,
    }));
    const capped = capGlobMatches(matches.toReversed());
    expect(capped.paths).toContain('f149.ts');
    expect(capped.paths).toContain('f50.ts');
    expect(capped.paths).not.toContain('f49.ts');
  });

  test('files of the same modification time keep their order of arrival', () => {
    const capped = capGlobMatches([
      { path: 'b.ts', mtimeMs: 5 },
      { path: 'a.ts', mtimeMs: 5 },
    ]);
    expect(capped.paths).toEqual(['b.ts', 'a.ts']);
  });
});
