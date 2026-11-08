/**
 * env-vars.md `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`: "Maximum number of consecutive times a Stop or
 * SubagentStop hook may block the turn from ending before Claude Code overrides it and ends the
 * turn anyway (default: 8). Set to `0` to disable the cap." hooks.md ("Stop decision control")
 * names the same "8-consecutive-continuation cap" for `additionalContext`. The count is kept by
 * the engine across dispatches, so these tests fire the same engine several times.
 */
import { expect, test } from 'bun:test';
import type { RunnerReply } from '../../support/ports.ts';
import { entry } from '../../support/hooks-select.ts';
import { engineSession } from '../../support/hooks-session.ts';
import { spec } from '../../support/spec.ts';

const gate = (event: 'Stop' | 'SubagentStop' = 'Stop') =>
  entry(event, { handler: { type: 'command', command: './gate.sh' } });
const KEEP_GOING: RunnerReply = { exitCode: 2, stderr: 'run the tests first' };
const AGAIN = { facts: { stop_hook_active: true } } as const;

/** Fires `times` Stop events that are all held back and reports which of them the engine honoured. */
async function holds(times: number, environment: Record<string, string> = {}) {
  const { fire } = engineSession(
    [gate()],
    Array.from({ length: times }, () => KEEP_GOING),
    { environment },
  );
  const results: boolean[] = [];
  for (let n = 0; n < times; n += 1) {
    const outcome = await fire('Stop', AGAIN);
    results.push(!outcome.proceed);
  }
  return results;
}

spec('environment.host.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP', () => {
  test('by default a Stop hook may keep the turn open 8 times in a row; the 9th block is overridden', async () => {
    const results = await holds(10);
    expect(results.slice(0, 8)).toEqual(Array(8).fill(true));
    expect(results.slice(8)).toEqual([false, true]);
  });

  test('the override ends the turn and says so with a warning naming the variable', async () => {
    const { fire } = engineSession([gate()], Array(3).fill(KEEP_GOING), {
      environment: { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '2' },
    });
    await fire('Stop', AGAIN);
    await fire('Stop', AGAIN);
    const third = await fire('Stop', AGAIN);
    expect(third.proceed).toBe(true);
    expect(third.block).toBeUndefined();
    expect(third.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('CLAUDE_CODE_STOP_HOOK_BLOCK_CAP'),
      }),
    ]);
  });

  test('the variable sets the cap: 3 holds three times', async () => {
    expect(await holds(5, { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '3' })).toEqual([
      true,
      true,
      true,
      false,
      true,
    ]);
  });

  test('0 disables the cap', async () => {
    const results = await holds(12, { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '0' });
    expect(results.every(Boolean)).toBe(true);
  });

  test('a Stop that does not block ends the run of blocks: the count starts again', async () => {
    const replies: RunnerReply[] = [
      KEEP_GOING,
      KEEP_GOING,
      { exitCode: 0 },
      KEEP_GOING,
      KEEP_GOING,
    ];
    const { fire } = engineSession([gate()], replies, {
      environment: { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '2' },
    });
    const seen: boolean[] = [];
    for (let n = 0; n < replies.length; n += 1) seen.push(!(await fire('Stop', AGAIN)).proceed);
    expect(seen).toEqual([true, true, false, true, true]);
  });

  test('a Stop of a fresh turn (stop_hook_active is false) is the first block again', async () => {
    const { fire } = engineSession([gate()], Array(4).fill(KEEP_GOING), {
      environment: { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '1' },
    });
    expect((await fire('Stop', AGAIN)).proceed).toBe(false);
    expect((await fire('Stop', AGAIN)).proceed).toBe(true);
    expect((await fire('Stop', { facts: { stop_hook_active: false } })).proceed).toBe(false);
  });

  test('a block by a JSON decision counts like exit 2', async () => {
    const json = JSON.stringify({ decision: 'block', reason: 'keep going' });
    const { fire } = engineSession([gate()], [{ stdout: json }, { stdout: json }], {
      environment: { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '1' },
    });
    expect((await fire('Stop', AGAIN)).proceed).toBe(false);
    expect((await fire('Stop', AGAIN)).proceed).toBe(true);
  });

  test('additionalContext keeps the conversation going and counts toward the same cap', async () => {
    const json = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'Stop', additionalContext: 'run the tests' },
    });
    const { fire } = engineSession([gate()], [{ stdout: json }, { stdout: json }], {
      environment: { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '1' },
    });
    expect((await fire('Stop', AGAIN)).effects.continuesTurn).toBe(true);
    const capped = await fire('Stop', AGAIN);
    expect(capped.effects.continuesTurn).toBeUndefined();
  });

  test('SubagentStop is capped too, apart from the main agent and from other subagents', async () => {
    const stop = entry('SubagentStop', { handler: { type: 'command', command: './sub.sh' } });
    const { fire } = engineSession([stop], Array(4).fill(KEEP_GOING), {
      environment: { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '1' },
    });
    const facts = (agent: string) => ({
      facts: {
        stop_hook_active: true,
        agent_id: agent,
        agent_type: 'reviewer',
        agent_transcript_path: '/t',
        last_assistant_message: '',
      },
    });
    expect((await fire('SubagentStop', facts('a1'))).proceed).toBe(false);
    expect((await fire('SubagentStop', facts('a2'))).proceed).toBe(false);
    expect((await fire('SubagentStop', facts('a1'))).proceed).toBe(true);
  });

  test('other events are not capped: a PreToolUse hook that blocks always blocks', async () => {
    const pre = entry('PreToolUse', { handler: { type: 'command', command: './g.sh' } });
    const { fire } = engineSession([pre], Array(12).fill(KEEP_GOING), {
      environment: { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: '1' },
    });
    for (let n = 0; n < 12; n += 1) expect((await fire('PreToolUse')).proceed).toBe(false);
  });
});

test('a value that is not a whole number is the default of 8 (judgment)', async () => {
  const results = await holds(9, { CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: 'many' });
  expect(results).toEqual([...Array(8).fill(true), false]);
});
