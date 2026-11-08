/**
 * tools-reference.md § Grep tool behavior ("Three output modes control what comes back:
 * `files_with_matches` ... This is the default.") and hooks.md § Grep (`output_mode` "`content`,
 * `files_with_matches`, or `count`. Defaults to `files_with_matches`"); § Glob tool behavior
 * ("Results are sorted by modification time and capped at 100 files. If the cap is hit, Claude
 * sees a truncation flag in the result"). Searching and walking the disk are the host's (ripgrep,
 * the file system). The direction of the modification-time sort and a value that is not a mode are
 * judgments, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  capGlobMatches,
  effectiveGrepOutputMode,
  GLOB_RESULT_CAP,
  parseToolInput,
} from '../../src/rules/index.ts';
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

spec('tools.tool.Grep', () => {
  test('the default mode of a call that sets only the pattern is the paths-only mode', () => {
    expect(effectiveGrepOutputMode({ pattern: 'interface\\{\\}', glob: '*.go' })).toBe(
      'files_with_matches',
    );
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
});

describe('judgments (spec/judgments.md): what the docs leave open in Glob', () => {
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
