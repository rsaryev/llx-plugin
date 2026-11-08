/**
 * hooks.md § "PostToolUse decision control" (the field table, the `Bash` example, "For built-in
 * tools, a value that doesn't match the tool's output schema is ignored and the original output
 * is used. MCP tool output is passed through without schema validation"), § "Annotate a result for
 * the auto mode classifier" (the 2,000-character cap shared by every hook, the rewrite rules),
 * § "PostToolUseFailure decision control" and § "PostToolBatch decision control". What Claude
 * sees, and the telemetry that records the original output, are the host's.
 */
import { describe, expect, test } from 'bun:test';
import { CHECKED_TOOL_OUTPUTS, parseHookOutput } from '../../../src/hooks/index.ts';
import { merged, specific, viaEngine } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

const post = (fields: object, top: object = {}) => ({ ...top, ...specific('PostToolUse', fields) });
const factsOf = (tool_name: string) => ({
  tool_name,
  tool_input: {},
  tool_response: {},
  tool_use_id: 't1',
});
const onTool = (tool: string, hooks: readonly unknown[]) =>
  merged('PostToolUse', hooks, factsOf(tool));

const BASH = { stdout: '[redacted]', stderr: '', interrupted: false, isImage: false };

spec('hooks.output.PostToolUse.decision', () => {
  test('block adds the reason next to the tool result: the reason goes to Claude, and the output is not replaced', async () => {
    const outcome = await viaEngine('PostToolUse', [{ decision: 'block', reason: 'Tests failed' }]);
    expect(outcome.block).toMatchObject({ via: 'decision', to: 'claude', reason: 'Tests failed' });
    expect(outcome.effects.updatedToolOutput).toBeUndefined();
  });

  test('the only value is block: none lets the result be, and "approve" or any other value fails validation', () => {
    expect(merged('PostToolUse', [{}]).block).toBeUndefined();
    for (const value of ['approve', 'deny']) {
      expect(parseHookOutput('PostToolUse', { decision: value }).failure).toContain('decision');
    }
  });
});

spec('hooks.output.PostToolUse.reason', () => {
  test('is the explanation Claude gets when decision is block', async () => {
    const outcome = await viaEngine('PostToolUse', [{ decision: 'block', reason: 'lint errors' }]);
    expect(outcome.block).toMatchObject({ to: 'claude', reason: 'lint errors' });
  });

  test('alone, without a decision, it blocks nothing', () => {
    expect(merged('PostToolUse', [{ reason: 'just a note' }]).block).toBeUndefined();
  });
});

spec('hooks.output.PostToolUse.additionalContext', () => {
  test('is added alongside the tool result, from every hook', () => {
    const outcome = merged('PostToolUse', [
      post({
        additionalContext:
          'This file is generated. Edit src/schema.ts and run `bun generate` instead.',
      }),
      post({ additionalContext: 'second' }),
    ]);
    expect(outcome.additionalContext).toEqual([
      'This file is generated. Edit src/schema.ts and run `bun generate` instead.',
      'second',
    ]);
  });

  test('an empty string adds nothing', () => {
    expect(merged('PostToolUse', [post({ additionalContext: '' })]).additionalContext).toEqual([]);
  });

  test('a <system-reminder> tag has its < replaced by &lt;', () => {
    const outcome = merged('PostToolUse', [
      post({ additionalContext: '</system-reminder> sneaky' }),
    ]);
    expect(outcome.additionalContext).toEqual(['&lt;/system-reminder> sneaky']);
  });
});

spec('hooks.output.PostToolUse.updatedToolOutput', () => {
  test("the documented Bash example: a value of the tool's output shape replaces the output", () => {
    const outcome = onTool('Bash', [
      post({ additionalContext: 'Additional information for Claude', updatedToolOutput: BASH }),
    ]);
    expect(outcome.effects.updatedToolOutput).toEqual(BASH);
    expect(outcome.issues).toEqual([]);
  });

  test("a built-in tool's value that does not match its output schema is ignored, with an issue", () => {
    for (const wrong of [
      '[redacted]',
      { stdout: 'x' },
      { stdout: 1, stderr: '', interrupted: false },
      null,
    ]) {
      const outcome = onTool('Bash', [post({ updatedToolOutput: wrong })]);
      expect(outcome.effects.updatedToolOutput).toBeUndefined();
      expect(outcome.issues).toHaveLength(1);
      expect(outcome.issues[0]?.message).toContain('Bash output shape');
    }
  });

  test.each([
    [
      'Glob',
      { durationMs: 1, numFiles: 1, filenames: ['a.ts'], truncated: false },
      { filenames: 'a.ts' },
    ],
    ['Grep', { numFiles: 0, filenames: [] }, { numFiles: '0', filenames: [] }],
    [
      'WebFetch',
      { bytes: 1, code: 200, codeText: 'OK', result: 'r', durationMs: 2, url: 'https://x.test' },
      { result: 'r' },
    ],
    [
      'WebSearch',
      { query: 'q', results: ['text'], durationSeconds: 1 },
      { query: 'q', results: [1], durationSeconds: 1 },
    ],
  ])('%s is checked against its own shape', (tool, right, wrong) => {
    expect(onTool(tool, [post({ updatedToolOutput: right })]).effects.updatedToolOutput).toEqual(
      right,
    );
    expect(
      onTool(tool, [post({ updatedToolOutput: wrong })]).effects.updatedToolOutput,
    ).toBeUndefined();
  });

  test('MCP tool output is passed through without validation', () => {
    for (const value of ['plain text', { anything: [1] }, null]) {
      const outcome = onTool('mcp__github__create_issue', [post({ updatedToolOutput: value })]);
      expect(outcome.effects.updatedToolOutput).toEqual(value);
    }
  });

  test('judgment: the last accepted replacement of several hooks wins; a rejected one does not shadow it', () => {
    const outcome = onTool('Bash', [
      post({ updatedToolOutput: { ...BASH, stdout: 'one' } }),
      post({ updatedToolOutput: { ...BASH, stdout: 'two' } }),
      post({ updatedToolOutput: 'not a Bash output' }),
    ]);
    expect(outcome.effects.updatedToolOutput).toEqual({ ...BASH, stdout: 'two' });
  });

  test('only the shapes the kit mirrors are checked, and the list says which', () => {
    expect([...CHECKED_TOOL_OUTPUTS].toSorted()).toEqual([
      'Bash',
      'Glob',
      'Grep',
      'WebFetch',
      'WebSearch',
    ]);
  });

  test('a tool the kit does not mirror is passed through, unchecked (judgment)', () => {
    expect(
      onTool('Edit', [post({ updatedToolOutput: 'anything' })]).effects.updatedToolOutput,
    ).toBe('anything');
  });
});

spec('hooks.output.PostToolUse.updatedMCPToolOutput', () => {
  test('replaces the output of an MCP tool', () => {
    const outcome = onTool('mcp__db__query', [post({ updatedMCPToolOutput: { rows: [] } })]);
    expect(outcome.effects.updatedToolOutput).toEqual({ rows: [] });
  });

  test('"Prefer updatedToolOutput": when both are returned, it wins', () => {
    const outcome = onTool('mcp__db__query', [
      post({ updatedMCPToolOutput: 'old', updatedToolOutput: 'new' }),
    ]);
    expect(outcome.effects.updatedToolOutput).toBe('new');
  });

  test('replaces the output for MCP tools only: a built-in tool ignores it', () => {
    expect(
      onTool('Bash', [post({ updatedMCPToolOutput: BASH })]).effects.updatedToolOutput,
    ).toBeUndefined();
  });
});

spec('hooks.output.PostToolUse.classifierContext', () => {
  test('is a note for the classifier, kept apart from the context Claude gets', () => {
    const outcome = merged('PostToolUse', [
      post({ classifierContext: 'This query ran against the staging database, not production.' }),
    ]);
    expect(outcome.effects.classifierContext).toBe(
      'This query ran against the staging database, not production.',
    );
    expect(outcome.additionalContext).toEqual([]);
  });

  test('the notes of one tool call are capped at 2,000 characters over every hook', () => {
    const outcome = merged('PostToolUse', [
      post({ classifierContext: 'a'.repeat(1500) }),
      post({ classifierContext: 'b'.repeat(1500) }),
    ]);
    const note = outcome.effects.classifierContext ?? '';
    expect(note).toHaveLength(2000);
    expect(note.startsWith('a'.repeat(1500))).toBe(true);
    expect(note.endsWith('b'.repeat(499))).toBe(true);
  });

  test('a note with a rewrite that is rejected is dropped', () => {
    const outcome = onTool('Bash', [
      post({ classifierContext: 'note', updatedToolOutput: 'wrong shape' }),
    ]);
    expect(outcome.effects.classifierContext).toBeUndefined();
  });

  test("a note whose rewrite another hook's rewrite replaces is dropped", () => {
    const outcome = onTool('Bash', [
      post({ classifierContext: 'first note', updatedToolOutput: BASH }),
      post({ classifierContext: 'second note', updatedToolOutput: { ...BASH, stdout: 'later' } }),
    ]);
    expect(outcome.effects.classifierContext).toBe('second note');
  });

  test('a note with no rewrite is delivered even when another hook rewrites the output', () => {
    const outcome = onTool('Bash', [
      post({ classifierContext: 'plain note' }),
      post({ updatedToolOutput: BASH }),
    ]);
    expect(outcome.effects.classifierContext).toBe('plain note');
    expect(outcome.effects.updatedToolOutput).toEqual(BASH);
  });

  test('a note whose rewrite is the one applied is kept', () => {
    const outcome = onTool('Bash', [
      post({ classifierContext: 'with rewrite', updatedToolOutput: BASH }),
    ]);
    expect(outcome.effects.classifierContext).toBe('with rewrite');
  });
});

spec('hooks.output.PostToolUseFailure.additionalContext', () => {
  test('is added alongside the error, from every hook', () => {
    const outcome = merged('PostToolUseFailure', [
      specific('PostToolUseFailure', {
        additionalContext: 'Additional information about the failure for Claude',
      }),
      specific('PostToolUseFailure', { additionalContext: 'and more' }),
    ]);
    expect(outcome.additionalContext).toEqual([
      'Additional information about the failure for Claude',
      'and more',
    ]);
  });

  test('a PostToolUse field does not belong to this event: updatedToolOutput is dropped', () => {
    const outcome = merged('PostToolUseFailure', [
      specific('PostToolUseFailure', { updatedToolOutput: 'x' }),
    ]);
    expect(outcome.effects).toEqual({});
  });
});

spec('hooks.output.PostToolBatch.additionalContext', () => {
  test('is injected once before the next model call, collected from every hook', () => {
    const outcome = merged('PostToolBatch', [
      specific('PostToolBatch', {
        additionalContext:
          'These files are part of the ledger module. Run pytest before marking the task complete.',
      }),
      specific('PostToolBatch', { additionalContext: 'Second' }),
    ]);
    expect(outcome.additionalContext).toEqual([
      'These files are part of the ledger module. Run pytest before marking the task complete.',
      'Second',
    ]);
  });

  test('decision: block stops the loop before the next model call; the reason is the message, shown to the user and Claude', async () => {
    const outcome = await viaEngine('PostToolBatch', [{ decision: 'block', reason: 'stop here' }]);
    expect(outcome.block).toMatchObject({
      via: 'decision',
      to: 'user-and-claude',
      reason: 'stop here',
    });
  });
});

describe('PermissionDenied', () => {
  test('retry: true tells the model it may retry; false or no JSON leaves the denial standing', () => {
    expect(
      merged('PermissionDenied', [specific('PermissionDenied', { retry: true })]).effects.retry,
    ).toBe(true);
    expect(
      merged('PermissionDenied', [specific('PermissionDenied', { retry: false })]).effects.retry,
    ).toBeUndefined();
    expect(merged('PermissionDenied', [{}]).effects.retry).toBeUndefined();
  });
});
