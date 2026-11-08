/**
 * hooks.md § PreToolUse input > Bash (the paragraphs after the table and the `bashEditDiff` table:
 * "Your PostToolUse hook then receives the changed files in `tool_response.bashEditDiff`", "Background
 * commands and read-only commands carry no diff", and the six fields `changedFiles`, `files`,
 * `moreFiles`, `unavailable`, `skipped`, `shared`). The kit reads `tool_response.bashEditDiff` of a
 * PostToolUse call: a wrong type is an error issue at `tool_response.bashEditDiff.<field>`, a
 * documented limit that the payload breaks (more than 200 paths, more than 5 diffs, a missing
 * `changedFiles`) is a warning that keeps the data (the docs call the list "best effort", so a
 * violation is something to know, not something to refuse). Nothing throws. Severities, a missing
 * `hunks` and what "reliable" means as data are judgments (spec/judgments.md), tested outside spec().
 *
 * The SDK's `BashOutput` has no `bashEditDiff` (the docs name Claude Code v2.1.269, the SDK
 * predates it): this shape is doc-only, with no compile-time tie.
 */
import { describe, expect, test } from 'bun:test';
import { bashEditDiffTrust, parseBashEditDiff } from '../../src/rules/index.ts';
import { spec } from '../support/spec.ts';

/** `tool_response` of a Bash call with the given `bashEditDiff`. */
const response = (bashEditDiff: unknown): Record<string, unknown> => ({
  stdout: '',
  stderr: '',
  interrupted: false,
  bashEditDiff,
});

const APP = '/path/to/src/app.ts';
/** The doc's own example row for `files`. */
const APP_DIFF = { filePath: APP, hunks: [{ oldStart: 1, newStart: 1, lines: ['-a', '+b'] }] };

const read = (bashEditDiff: unknown) => parseBashEditDiff(response(bashEditDiff));

const problems = (bashEditDiff: unknown): string[] =>
  read(bashEditDiff).issues.map((found) => `${found.severity} ${found.path}: ${found.message}`);

const paths = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `/repo/file-${index}.ts`);

const diffs = (count: number) => paths(count).map((filePath) => ({ filePath, hunks: [] }));

spec('tools.input.Bash.changedFiles', () => {
  test("changedFiles are the absolute paths of what the command changed: the doc's example", () => {
    const parsed = read({ changedFiles: [APP], files: [APP_DIFF] });
    expect(parsed.issues).toEqual([]);
    expect(parsed.diff?.changedFiles).toEqual([APP]);
  });

  test('exactly 200 paths are within the limit, 201 are a warning that keeps every path', () => {
    expect(read({ changedFiles: paths(200) }).issues).toEqual([]);
    const over = read({ changedFiles: paths(201) });
    expect(over.diff?.changedFiles).toHaveLength(201);
    expect(over.issues.map((found) => [found.severity, found.path])).toEqual([
      ['warning', 'tool_response.bashEditDiff.changedFiles'],
    ]);
    expect(over.issues[0]?.message).toContain('at most 200');
  });

  test('a Windows path (drive letter, UNC) is absolute, a relative path is a warning at its index', () => {
    expect(
      read({ changedFiles: ['C:\\project\\src\\app.ts', '\\\\host\\share\\a.ts', '/x'] }).issues,
    ).toEqual([]);
    expect(problems({ changedFiles: ['/ok.ts', 'src/app.ts'] })).toEqual([
      'warning tool_response.bashEditDiff.changedFiles.1: is not an absolute path',
    ]);
  });

  test('"Present whenever files holds a diff": a diff in files without changedFiles is a warning', () => {
    expect(problems({ files: [APP_DIFF] })).toEqual([
      'warning tool_response.bashEditDiff.changedFiles: is missing, it is present whenever files holds a diff or moreFiles is above zero',
    ]);
  });

  test('"or moreFiles is above zero": moreFiles above zero without changedFiles is the same warning', () => {
    expect(problems({ moreFiles: 2 })).toEqual([
      'warning tool_response.bashEditDiff.changedFiles: is missing, it is present whenever files holds a diff or moreFiles is above zero',
    ]);
  });

  test('changedFiles may be absent when files is empty and moreFiles is zero or absent', () => {
    expect(read({}).issues).toEqual([]);
    expect(read({ files: [] }).issues).toEqual([]);
    expect(read({ moreFiles: 0 }).issues).toEqual([]);
    expect(read({ unavailable: true }).issues).toEqual([]);
  });

  test('changedFiles that is not an array of text is an error', () => {
    expect(problems({ changedFiles: APP })).toEqual([
      'error tool_response.bashEditDiff.changedFiles: expected an array',
    ]);
    expect(problems({ changedFiles: [APP, 3] })).toEqual([
      'error tool_response.bashEditDiff.changedFiles.1: expected a string',
    ]);
  });
});

spec('tools.input.Bash.files', () => {
  test("files hold the diffs of changed files: the doc's example row", () => {
    const parsed = read({ changedFiles: [APP], files: [APP_DIFF] });
    expect(parsed.issues).toEqual([]);
    expect(parsed.diff?.files).toEqual([APP_DIFF]);
  });

  test('up to 5 diffs are within the limit, a sixth is a warning that keeps all six', () => {
    const five = read({ changedFiles: paths(5), files: diffs(5) });
    expect(five.issues).toEqual([]);
    const six = read({ changedFiles: paths(6), files: diffs(6) });
    expect(six.diff?.files).toHaveLength(6);
    expect(six.issues.map((found) => [found.severity, found.path])).toEqual([
      ['warning', 'tool_response.bashEditDiff.files'],
    ]);
    expect(six.issues[0]?.message).toContain('at most 5');
  });

  test('`created` is true for a file the command added and `deleted` for one it removed', () => {
    const parsed = read({
      changedFiles: ['/repo/new.ts', '/repo/old.ts'],
      files: [
        { filePath: '/repo/new.ts', hunks: [], created: true },
        { filePath: '/repo/old.ts', hunks: [], deleted: true },
      ],
    });
    expect(parsed.issues).toEqual([]);
    expect(parsed.diff?.files?.map(({ created, deleted }) => [created, deleted])).toEqual([
      [true, undefined],
      [undefined, true],
    ]);
  });

  test('a file cannot be both added and removed by one command: a warning', () => {
    expect(
      problems({
        changedFiles: [APP],
        files: [{ filePath: APP, hunks: [], created: true, deleted: true }],
      }),
    ).toEqual(['warning tool_response.bashEditDiff.files.0: is marked both created and deleted']);
  });

  test('a diff entry needs a filePath of text; created and deleted are booleans', () => {
    expect(problems({ changedFiles: [], files: [{ hunks: [] }] })).toEqual([
      'error tool_response.bashEditDiff.files.0.filePath: is required',
    ]);
    expect(problems({ changedFiles: [APP], files: [{ filePath: APP, created: 'yes' }] })).toEqual([
      'error tool_response.bashEditDiff.files.0.created: expected a boolean',
    ]);
    expect(problems({ changedFiles: [APP], files: [{ filePath: APP, deleted: 1 }] })).toEqual([
      'error tool_response.bashEditDiff.files.0.deleted: expected a boolean',
    ]);
    expect(problems({ changedFiles: [APP], files: APP })).toEqual([
      'error tool_response.bashEditDiff.files: expected an array',
    ]);
  });
});

spec('tools.input.Bash.moreFiles', () => {
  test("moreFiles counts the changed files with no diff in files: the doc's example is 2", () => {
    const parsed = read({ changedFiles: paths(7), files: diffs(5), moreFiles: 2 });
    expect(parsed.issues).toEqual([]);
    expect(parsed.diff?.moreFiles).toBe(2);
  });

  test('it is a count: a whole number from 0, anything else is an error', () => {
    expect(problems({ moreFiles: -1 })).toEqual([
      'error tool_response.bashEditDiff.moreFiles: expected a whole number from 0',
    ]);
    expect(problems({ moreFiles: 1.5 })).toEqual([
      'error tool_response.bashEditDiff.moreFiles: expected a whole number from 0',
    ]);
    expect(problems({ moreFiles: '2' })).toEqual([
      'error tool_response.bashEditDiff.moreFiles: expected a number',
    ]);
  });
});

spec('tools.input.Bash.unavailable', () => {
  test('unavailable is a boolean: set when the diff is incomplete or could not be taken', () => {
    const parsed = read({ unavailable: true, changedFiles: [APP] });
    expect(parsed.issues).toEqual([]);
    expect(parsed.diff?.unavailable).toBe(true);
  });

  test('a value that is not a boolean is an error', () => {
    expect(problems({ unavailable: 'true' })).toEqual([
      'error tool_response.bashEditDiff.unavailable: expected a boolean',
    ]);
  });

  test('an unavailable diff is an incomplete list: the trust says so', () => {
    expect(bashEditDiffTrust({ unavailable: true }).complete).toBe(false);
    expect(bashEditDiffTrust({}).complete).toBe(true);
  });
});

spec('tools.input.Bash.skipped', () => {
  test('skipped is a boolean: set for a git command that moves the working tree', () => {
    const parsed = read({ skipped: true });
    expect(parsed.issues).toEqual([]);
    expect(parsed.diff?.skipped).toBe(true);
  });

  test('"so Claude Code takes no diff": a skipped call whose files hold a diff is a warning', () => {
    expect(problems({ skipped: true, changedFiles: [APP], files: [APP_DIFF] })).toEqual([
      'warning tool_response.bashEditDiff.skipped: is set, so Claude Code takes no diff and files should be empty',
    ]);
  });

  test('a value that is not a boolean is an error', () => {
    expect(problems({ skipped: 1 })).toEqual([
      'error tool_response.bashEditDiff.skipped: expected a boolean',
    ]);
  });

  test('a skipped call has no diff at all: its list is not complete', () => {
    expect(bashEditDiffTrust({ skipped: true }).complete).toBe(false);
  });
});

spec('tools.input.Bash.shared', () => {
  test('shared is a boolean: another Bash call ran in the same repository at the same time', () => {
    const parsed = read({ changedFiles: [APP], files: [APP_DIFF], shared: true });
    expect(parsed.issues).toEqual([]);
    expect(parsed.diff?.shared).toBe(true);
  });

  test('"some listed changes may be that command\'s": a shared list is complete but not attributable', () => {
    expect(bashEditDiffTrust({ shared: true })).toEqual({ complete: true, attributable: false });
    expect(bashEditDiffTrust({})).toEqual({ complete: true, attributable: true });
  });

  test('a value that is not a boolean is an error', () => {
    expect(problems({ shared: 'yes' })).toEqual([
      'error tool_response.bashEditDiff.shared: expected a boolean',
    ]);
  });
});

describe('bash edit diff (judgments, spec/judgments.md)', () => {
  test('a call with no bashEditDiff has no diff and no issue: background and read-only commands carry none', () => {
    const none = parseBashEditDiff({ stdout: 'ok', stderr: '', interrupted: false });
    expect(none).toEqual({ diff: undefined, issues: [] });
  });

  test('a bashEditDiff that is not an object, and a tool_response that is not an object, are errors', () => {
    expect(problems('changed')).toEqual(['error tool_response.bashEditDiff: expected an object']);
    expect(problems(null)).toEqual(['error tool_response.bashEditDiff: expected an object']);
    expect(parseBashEditDiff('text')).toEqual({
      diff: undefined,
      issues: [{ severity: 'error', path: 'tool_response', message: 'expected an object' }],
    });
  });

  test('a diff entry without hunks is accepted: the table shows hunks and does not require it', () => {
    expect(read({ changedFiles: [APP], files: [{ filePath: APP, created: true }] }).issues).toEqual(
      [],
    );
  });

  test('fields the table does not list are not part of the diff', () => {
    const parsed = read({ changedFiles: [APP], files: [APP_DIFF], future: 1 });
    expect(parsed.issues).toEqual([]);
    expect(parsed.diff).not.toHaveProperty('future');
  });

  test('a limit that is broken does not make the diff unreadable: the warnings leave the data whole', () => {
    const parsed = read({ files: diffs(6), moreFiles: 1, skipped: false });
    expect(parsed.diff?.files).toHaveLength(6);
    expect(parsed.issues.every((found) => found.severity === 'warning')).toBe(true);
  });
});
