/**
 * The rows of hooks.md § "Decision control" that no requirement names: PreCompact, TaskCreated and
 * PostToolUseFailure `decision: "block"`, TeammateIdle and TaskCompleted `continue: false`, plus
 * § "WorktreeCreate output" (an HTTP hook returns
 * `hookSpecificOutput.worktreePath`). None has a spec id, so none counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { parseHookOutput } from '../../../src/hooks/index.ts';
import { merged, specific } from '../../support/hooks-output.ts';

describe('top-level decision: block, as the Decision control table lists it', () => {
  test.each(['PreCompact', 'TaskCreated', 'PostToolUseFailure'] as const)(
    '%s: block holds the action back, with the reason',
    (event) => {
      const outcome = merged(event, [{ decision: 'block', reason: 'not now' }]);
      expect(outcome.block).toMatchObject({ via: 'decision', reason: 'not now' });
      expect(merged(event, [{}]).block).toBeUndefined();
    },
  );

  test('TaskCreated: "Claude Code ignores continue: false from this event"', () => {
    const outcome = merged('TaskCreated', [{ continue: false, stopReason: 'x' }]);
    expect(outcome.continue).toBe(true);
    expect(outcome.stopReason).toBeUndefined();
    expect(outcome.block).toBeUndefined();
  });

  test('TaskCreated: a block still counts next to a continue: false that is ignored', () => {
    const outcome = merged('TaskCreated', [
      { continue: false, decision: 'block', reason: 'bad subject' },
    ]);
    expect(outcome.continue).toBe(true);
    expect(outcome.block).toMatchObject({ reason: 'bad subject' });
  });
});

describe.each(['TeammateIdle', 'TaskCompleted'] as const)('%s', (event) => {
  test('continue: false stops the teammate entirely, and stopReason is shown to the user', () => {
    const outcome = merged(event, [{ continue: false, stopReason: 'Build artifact missing' }]);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe('Build artifact missing');
  });

  test('no JSON stops nothing', () => {
    expect(merged(event, [{}]).continue).toBe(true);
  });

  test('it has no top-level decision: a block is discarded, not acted on', () => {
    expect(merged(event, [{ decision: 'block', reason: 'r' }]).block).toBeUndefined();
  });
});

const at = (worktreePath: string) => specific('WorktreeCreate', { worktreePath });

describe('WorktreeCreate: an HTTP hook returns hookSpecificOutput.worktreePath', () => {
  test('the path is handed on', () => {
    expect(merged('WorktreeCreate', [at('/tmp/wt')]).effects.worktreePath).toBe('/tmp/wt');
  });

  test('no path is no effect', () => {
    expect(merged('WorktreeCreate', [{}]).effects).toEqual({});
  });

  test('judgment: of several hooks the last path wins', () => {
    expect(merged('WorktreeCreate', [at('/a'), at('/b')]).effects.worktreePath).toBe('/b');
  });

  test('a path that is not a string fails validation', () => {
    expect(
      parseHookOutput('WorktreeCreate', specific('WorktreeCreate', { worktreePath: 1 })).failure,
    ).toContain('worktreePath');
  });

  test('continue, systemMessage and decision are discarded', () => {
    const outcome = merged('WorktreeCreate', [
      { ...at('/wt'), continue: false, systemMessage: 'x', decision: 'block', reason: 'r' },
    ]);
    expect(outcome.continue).toBe(true);
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.block).toBeUndefined();
  });
});
