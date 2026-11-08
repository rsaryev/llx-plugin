/**
 * The outcome of a hook's stdout against its exit code: hooks.md § "Exit code output" (the table
 * and the three bullets above it), § "Exit code 0" (the stdout parsing rule and the events that
 * show plain stdout to Claude), § "Other exit codes" (the notice line) and § "Timeouts". No
 * requirement id names these rules, so the tests sit outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { HandlerVerdict } from '../../../src/hooks/index.ts';
import { readAsyncResponse, readStdout } from '../../../src/hooks/index.ts';
import { exited, verdictOf } from '../../support/hooks-verdict.ts';

const VALID = JSON.stringify({ systemMessage: 'hi' });
const INVALID = '{"nonsense": true}';
const ANY_OTHER = 7;

const run = (code: number, stdout: string, stderr = 'boom\nsecond line') =>
  verdictOf('PreToolUse', exited(code, stderr, stdout));

const outcome = (verdict: HandlerVerdict): string =>
  verdict.block !== undefined ? 'blocking' : verdict.status;

describe('the table: stdout against exit code (PreToolUse)', () => {
  test('valid JSON: exit 0 applies the fields', () => {
    const verdict = run(0, VALID);
    expect(outcome(verdict)).toBe('success');
    expect(verdict.output).toEqual({ systemMessage: 'hi' });
  });

  test('valid JSON: exit 2 blocks and the fields are still read, they cannot override the block', () => {
    const verdict = run(2, VALID);
    expect(outcome(verdict)).toBe('blocking');
    expect(verdict.output).toEqual({ systemMessage: 'hi' });
    expect(verdict.block?.reason).toBe('boom\nsecond line');
  });

  test('valid JSON: any other exit code is a success, the fields alone decide', () => {
    const verdict = run(1, VALID);
    expect(outcome(verdict)).toBe('success');
    expect(verdict.output).toEqual({ systemMessage: 'hi' });
  });

  test('JSON that fails validation: exit 0 is a non-blocking error carrying the validation message', () => {
    const verdict = run(0, INVALID);
    expect(outcome(verdict)).toBe('non-blocking-error');
    expect(verdict.output).toBeUndefined();
    expect(verdict.notice?.message).toBe(
      'PreToolUse:Bash hook error: [./hook.sh]: Unrecognized field: nonsense',
    );
  });

  test('JSON that fails validation: exit 2 blocks, the stderr is the reason', () => {
    const verdict = run(2, INVALID);
    expect(outcome(verdict)).toBe('blocking');
    expect(verdict.block?.reason).toBe('boom\nsecond line');
    expect(verdict.output).toBeUndefined();
  });

  test('JSON that fails validation: any other exit code is a non-blocking error with the validation message', () => {
    const verdict = run(ANY_OTHER, INVALID);
    expect(outcome(verdict)).toBe('non-blocking-error');
    expect(verdict.notice?.message).toContain('Unrecognized field: nonsense');
  });

  test('JSON that cannot be parsed is the same row as JSON that fails validation', () => {
    const verdict = run(0, '{"a": }');
    expect(outcome(verdict)).toBe('non-blocking-error');
    expect(verdict.notice?.message).toMatch(/^PreToolUse:Bash hook error: \[\.\/hook\.sh\]: .+/);
  });

  for (const [name, stdout] of [
    ['nothing', ''],
    ['plain text', 'all good'],
  ] as const) {
    test(`${name}: exit 0 is a success`, () => {
      expect(outcome(run(0, stdout))).toBe('success');
    });
    test(`${name}: exit 2 blocks, the stderr is the reason`, () => {
      expect(run(2, stdout).block?.reason).toBe('boom\nsecond line');
    });
    test(`${name}: any other exit code is a non-blocking error carrying the first line of the stderr`, () => {
      const verdict = run(1, stdout);
      expect(outcome(verdict)).toBe('non-blocking-error');
      expect(verdict.notice?.message).toBe(
        'PreToolUse:Bash hook error: [./hook.sh]: Failed with non-blocking status code: boom',
      );
    });
  }

  test('the example of "Other exit codes": exit 1 with "something broke" on stderr', () => {
    const verdict = verdictOf('PreToolUse', exited(1, 'something broke\n'));
    expect(verdict.notice?.message).toContain(
      'Failed with non-blocking status code: something broke',
    );
  });

  test('a shell that could not find the script reports its message', () => {
    const stderr = '/bin/sh: /path/to/hook.sh: No such file or directory';
    const verdict = verdictOf('PreToolUse', exited(127, stderr));
    expect(verdict.block).toBeUndefined();
    expect(verdict.notice?.message).toContain(`Failed with non-blocking status code: ${stderr}`);
  });

  test('a hook that cannot start is a non-blocking error: the action goes ahead', () => {
    const verdict = verdictOf('PreToolUse', { kind: 'not-started', message: 'spawn nope ENOENT' });
    expect(outcome(verdict)).toBe('non-blocking-error');
    expect(verdict.notice?.message).toContain('spawn nope ENOENT');
  });

  test('a timed-out hook renders no decision', () => {
    const verdict = verdictOf('PreToolUse', { kind: 'timed-out' });
    expect(verdict.block).toBeUndefined();
    expect(verdict.output).toBeUndefined();
    expect(verdict.status).toBe('timed-out');
  });
});

describe('how stdout is read (Exit code 0)', () => {
  test('one JSON object, on one line or several, with only whitespace around it', () => {
    expect(readStdout('  {"a":1}\n').json).toEqual({ a: 1 });
    expect(readStdout('{\n  "a": 1,\n  "b": 2\n}\n').json).toEqual({ a: 1, b: 2 });
  });

  test('output that does not start with { is plain text; so are an array and a quoted string', () => {
    for (const text of ['hello', '[1,2]', '"quoted"', 'note\n{"a":1}']) {
      const reading = readStdout(text);
      expect(reading.json).toBeUndefined();
      expect(reading.parseFailure).toBeUndefined();
    }
  });

  test('output that starts with { and does not end with } is plain text', () => {
    const reading = readStdout('{"a":1} trailing');
    expect(reading.json).toBeUndefined();
    expect(reading.parseFailure).toBeUndefined();
  });

  test('{...} that is not valid JSON is a parse failure', () => {
    expect(readStdout('{not json}').parseFailure).toBeDefined();
    expect(readStdout('{"a":1}\nnoise\n{"b":2}').parseFailure).toBeDefined();
  });

  test('several lines that each parse: plain text when no line sets a field', () => {
    for (const text of ['{}\n{}', '{}\n{}\n{}']) {
      const reading = readStdout(text);
      expect(reading.json).toBeUndefined();
      expect(reading.parseFailure).toBeUndefined();
    }
  });

  test('several lines that each parse: a parse failure when one line sets a field', () => {
    expect(readStdout('{"continue":false}\n{}').parseFailure).toBeDefined();
    expect(readStdout('{}\n{"systemMessage":"x"}').parseFailure).toBeDefined();
  });

  test('an async hook may print other text when the response fits on one line', () => {
    expect(readAsyncResponse('building...\n{"systemMessage":"done"}\n')).toEqual({
      systemMessage: 'done',
    });
    expect(readAsyncResponse('{\n  "systemMessage": "done"\n}')).toEqual({ systemMessage: 'done' });
    expect(readAsyncResponse('just text')).toBeUndefined();
  });
});

describe('plain stdout that reaches Claude (Exit code 0)', () => {
  test('UserPromptSubmit, UserPromptExpansion, SessionStart and PostModelSwitch add it as context', () => {
    for (const event of [
      'UserPromptSubmit',
      'UserPromptExpansion',
      'SessionStart',
      'PostModelSwitch',
    ] as const) {
      const verdict = verdictOf(event, exited(0, '', 'branch is main\n'));
      expect(verdict.plainText).toEqual({ text: 'branch is main', as: 'context' });
    }
  });

  test('"It doesn\'t add stdout it failed to parse"', () => {
    const verdict = verdictOf('SessionStart', exited(0, '', '{"nonsense":1}'));
    expect(verdict.plainText).toBeUndefined();
  });

  test('PreCompact: stdout becomes the instructions for the compaction summary', () => {
    const verdict = verdictOf('PreCompact', exited(0, '', 'keep the plan'));
    expect(verdict.plainText).toEqual({ text: 'keep the plan', as: 'compaction-instructions' });
  });

  test('on other events stdout goes to the debug log', () => {
    expect(verdictOf('PreToolUse', exited(0, '', 'noise')).plainText).toBeUndefined();
    expect(verdictOf('SessionStart', exited(1, 'e', 'noise')).plainText).toBeUndefined();
  });
});

describe('WorktreeCreate command hooks print a path, not JSON', () => {
  test('stdout is kept for the engine and is not read as JSON', () => {
    const verdict = verdictOf('WorktreeCreate', exited(0, '', '{"not":"json"}\n/work/wt\n'));
    expect(verdict.status).toBe('success');
    expect(verdict.stdout).toBe('{"not":"json"}\n/work/wt\n');
  });
});
