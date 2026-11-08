/**
 * Judgments of how an event's blocks are assembled (spec/judgments.md, `src/hooks/assemble.ts`):
 * hooks.md § "Exit code 2" says the stderr is the block message and a blocking decision's reason
 * replaces it, and says nothing of several hooks. Outside `spec(...)`: a judgment never counts as
 * compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { assemble } from '../../src/hooks/assemble.ts';
import type { HandlerVerdict, MergedOutput } from '../../src/hooks/index.ts';
import { exited, verdictOf } from '../support/hooks-verdict.ts';
import { entry } from '../support/hooks-select.ts';

const merged = (block?: MergedOutput['block']): MergedOutput => ({
  ...(block === undefined ? {} : { block }),
  continue: true,
  systemMessages: [],
  additionalContext: [],
  terminalSequences: [],
  effects: {},
});

const exit2From = (id: string, stderr: string): HandlerVerdict =>
  verdictOf('PreToolUse', exited(2, stderr), {
    entry: entry('PreToolUse', { handler: { type: 'command', command: id } }),
  });

describe('assembling blocks', () => {
  test('an exit-2 block wins over a JSON decision block, whichever hook comes first', () => {
    const decider = verdictOf('PreToolUse', exited(0));
    const blocker = exit2From('./exit2.sh', 'stderr says no');
    const decision = { via: 'decision', by: decider.handler.id, reason: 'json says no' } as const;
    const outcome = assemble('PreToolUse', [decider, blocker], merged(decision), []);
    expect(outcome.block).toMatchObject({
      via: 'exit2',
      by: blocker.handler.id,
      reason: 'stderr says no',
    });
  });

  test("a JSON decision of another hook does not replace an exit-2 hook's reason", () => {
    const blocker = exit2From('./exit2.sh', 'stderr says no');
    const other = entry('PreToolUse');
    const decision = { via: 'decision', by: other.id, reason: 'json says no' } as const;
    const outcome = assemble('PreToolUse', [blocker], merged(decision), []);
    expect(outcome.block?.reason).toBe('stderr says no');
  });

  test('a blocking decision of the same hook replaces the exit-2 reason', () => {
    const blocker = exit2From('./exit2.sh', 'stderr says no');
    const decision = { via: 'decision', by: blocker.handler.id, reason: 'json says no' } as const;
    const outcome = assemble('PreToolUse', [blocker], merged(decision), []);
    expect(outcome.block).toMatchObject({
      via: 'exit2',
      to: 'claude',
      reason: 'json says no',
      message: 'json says no',
    });
  });

  test('a `continue: false` block of the same hook is a stop reason and does not replace the stderr', () => {
    const blocker = exit2From('./exit2.sh', 'stderr says no');
    const stop = { via: 'continue-false', by: blocker.handler.id, reason: 'stopped' } as const;
    const outcome = assemble('PreToolUse', [blocker], merged(stop), []);
    expect(outcome.block?.reason).toBe('stderr says no');
  });

  test('on an event that shows no one its block, a decision reason is not shown either', () => {
    const blocker = verdictOf('ConfigChange', exited(2, 'stderr'));
    const decision = { via: 'decision', by: blocker.handler.id, reason: 'json says no' } as const;
    const outcome = assemble('ConfigChange', [blocker], merged(decision), []);
    expect(outcome.block).toMatchObject({ to: 'none', reason: '', message: '' });
    const alone = assemble('ConfigChange', [], merged({ ...decision, by: 'x' }), []);
    expect(alone.block).toMatchObject({ via: 'decision', to: 'none', reason: '', message: '' });
  });
});
