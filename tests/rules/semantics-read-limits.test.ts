/**
 * tools-reference.md § Read tool behavior ("Read refuses an image file larger than 128 MB", "Claude
 * Code refuses to read a notebook file over 100 MB", "Read refuses a file whose extension it treats
 * as binary, such as `.xlsx`, `.parquet`, `.heic`, or `.zip`") and § Large files ("By default one
 * call returns at most 25,000 tokens, or the value you set in
 * `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`, and refuses a whole file over 256 KB"; "Whole file over
 * the token limit: the first page of the file, with a `PARTIAL view` notice"; "an `offset` or `limit`
 * read over the token limit: an error"; `allow_large` "is sized against the room left in the
 * session's context window"); env-vars.md (`CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`). Counting
 * tokens and measuring the file are the host's; the kit decides from the numbers. What the docs
 * leave open (the unit of a megabyte, the other binary extensions, a read over the context room,
 * the wording) is a judgment, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  classifyReadSize,
  classifyReadTarget,
  partialViewNotice,
  READ_TOO_LARGE_MESSAGE,
  readTokenLimit,
} from '../../src/rules/index.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const env = (record: Record<string, string> = {}) => fakeEnvironment(record);
const MB = 1024 * 1024;
const sizing = (over: Partial<Parameters<typeof classifyReadSize>[0]> = {}) => ({
  bytes: 1_000,
  tokens: 100,
  windowed: false,
  allowLarge: false,
  ...over,
});

spec('tools.tool.Read', () => {
  test('one call returns at most 25,000 tokens, or the value of CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS', () => {
    expect(readTokenLimit(env())).toBe(25_000);
    expect(readTokenLimit(env({ CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS: '60000' }))).toBe(60_000);
  });

  test('a whole file over 256 KB is refused, however few its tokens', () => {
    expect(classifyReadSize(sizing({ bytes: 256 * 1024 }), env())).toBe('whole');
    expect(classifyReadSize(sizing({ bytes: 256 * 1024 + 1 }), env())).toBe('refused');
    expect(
      classifyReadSize(
        sizing({ bytes: 300_000 }),
        env({ CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS: '99' }),
      ),
    ).toBe('refused');
  });

  test('a whole file over the token limit gives its first page, a partial view', () => {
    expect(classifyReadSize(sizing({ tokens: 25_000 }), env())).toBe('whole');
    expect(classifyReadSize(sizing({ tokens: 25_001 }), env())).toBe('partial');
    const raised = env({ CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS: '50000' });
    expect(classifyReadSize(sizing({ tokens: 40_000 }), raised)).toBe('whole');
  });

  test('the PARTIAL view notice says how much of the file arrived and how to read more with offset and limit', () => {
    const notice = partialViewNotice(500, 4_000);
    expect(notice).toStartWith('PARTIAL view');
    expect(notice).toContain('500');
    expect(notice).toContain('4000');
    expect(notice).toContain('offset');
    expect(notice).toContain('limit');
  });

  test('an offset or limit read over the token limit is an error, and one within it is read', () => {
    expect(classifyReadSize(sizing({ windowed: true, tokens: 25_001 }), env())).toBe('refused');
    expect(classifyReadSize(sizing({ windowed: true, tokens: 25_000 }), env())).toBe('whole');
    expect(READ_TOO_LARGE_MESSAGE).toContain('offset');
    expect(READ_TOO_LARGE_MESSAGE).toContain('Grep');
  });

  test('a window of a file over 256 KB is not refused for its size', () => {
    expect(classifyReadSize(sizing({ windowed: true, bytes: 900_000, tokens: 2_000 }), env())).toBe(
      'whole',
    );
  });

  test('allow_large sizes the read against the room left in the context window, not the default limits', () => {
    const large = { allowLarge: true, bytes: 900_000, tokens: 80_000 };
    expect(classifyReadSize(sizing({ ...large, contextRoomTokens: 150_000 }), env())).toBe('whole');
    expect(
      classifyReadSize(sizing({ ...large, windowed: true, contextRoomTokens: 150_000 }), env()),
    ).toBe('whole');
    expect(classifyReadSize(sizing({ ...large, contextRoomTokens: 60_000 }), env())).toBe(
      'refused',
    );
  });

  test('"Read refuses a file whose extension it treats as binary": .xlsx, .parquet, .heic and .zip', () => {
    for (const path of ['/d/a.xlsx', '/d/a.parquet', '/d/a.heic', '/d/a.zip', '/d/A.ZIP']) {
      expect(classifyReadTarget({ path, bytes: 10 })?.reason).toBe('binary-extension');
    }
    expect(classifyReadTarget({ path: '/d/a.ts', bytes: 10 })).toBeUndefined();
    expect(classifyReadTarget({ path: '/d/zip', bytes: 10 })).toBeUndefined();
  });

  test('an image over 128 MB is refused, one at 128 MB is not, and a non-image of that size is not an image', () => {
    expect(classifyReadTarget({ path: '/d/a.png', bytes: 128 * MB + 1 })?.reason).toBe(
      'image-too-large',
    );
    expect(classifyReadTarget({ path: '/d/a.webp', bytes: 128 * MB })).toBeUndefined();
    expect(classifyReadTarget({ path: '/d/a.log', bytes: 200 * MB })).toBeUndefined();
  });

  test('a notebook over 100 MB is refused', () => {
    expect(classifyReadTarget({ path: '/d/n.ipynb', bytes: 100 * MB + 1 })?.reason).toBe(
      'notebook-too-large',
    );
    expect(classifyReadTarget({ path: '/d/n.ipynb', bytes: 100 * MB })).toBeUndefined();
  });
});

describe('judgments (spec/judgments.md): what the docs leave open in Read limits', () => {
  test('a variable that is not a positive integer leaves the 25,000-token default', () => {
    for (const value of ['0', '-5', '1.5', 'many']) {
      expect(readTokenLimit(env({ CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS: value }))).toBe(25_000);
    }
  });

  test('allow_large without a measured room has no effect', () => {
    expect(classifyReadSize(sizing({ allowLarge: true, tokens: 30_000 }), env())).toBe('partial');
  });

  test('a path with no extension, or a dot only in a directory, is not binary', () => {
    expect(classifyReadTarget({ path: '/d.zip/file', bytes: 1 })).toBeUndefined();
    expect(classifyReadTarget({ path: 'C:\\d\\a.zip', bytes: 1 })?.reason).toBe('binary-extension');
  });

  test('every refusal carries a message', () => {
    expect(classifyReadTarget({ path: 'a.zip', bytes: 1 })?.message).toContain('binary');
    expect(classifyReadTarget({ path: 'a.png', bytes: 129 * MB })?.message).toContain('128 MB');
    expect(classifyReadTarget({ path: 'a.ipynb', bytes: 101 * MB })?.message).toContain('100 MB');
  });
});
