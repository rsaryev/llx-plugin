/**
 * hooks.md § "Timeouts" (a hook that reaches its `timeout` is canceled and its output discarded;
 * on `PreToolUse` it does not block; `PreModelSwitch` does), § "PreModelSwitch timeouts and other
 * exit codes", § "SessionEnd" and env-vars.md `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`. The port
 * cancels the process; the proof is the limit it receives and what the engine does with the
 * cancellation, end to end through a dispatch.
 */
import { describe, expect, test } from 'bun:test';
import type { RunnerReply } from '../../support/ports.ts';
import { entry, pluginSource, settingsSource } from '../../support/hooks-select.ts';
import { engineSession } from '../../support/hooks-session.ts';
import { spec } from '../../support/spec.ts';

const DENY = JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
});
const TIMED_OUT: RunnerReply = { exitCode: null, timedOut: true, stdout: DENY, stderr: 'late' };

const preTool = (more: object = {}, type: 'command' | 'http' = 'command') =>
  entry('PreToolUse', {
    handler:
      type === 'command'
        ? { type: 'command', command: './gate.sh', ...more }
        : { type: 'http', url: 'http://h/x', ...more },
  });

spec('hooks.behavior.Timeouts', () => {
  test('a command hook that reaches its timeout is canceled and its output is discarded: no decision', async () => {
    const { fire, runner } = engineSession([preTool({ timeout: 5 })], [TIMED_OUT]);
    const outcome = await fire('PreToolUse');
    expect(runner.calls[0]?.timeoutMs).toBe(5000);
    expect(outcome.runs[0]?.status).toBe('timed-out');
    expect(outcome.effects.permissionDecision).toBeUndefined();
    expect(outcome.feedback).toEqual([]);
  });

  test('on PreToolUse a timed-out hook does not block the tool call; the call continues through the permission flow', async () => {
    const { fire } = engineSession([preTool()], [TIMED_OUT]);
    const outcome = await fire('PreToolUse');
    expect(outcome.proceed).toBe(true);
    expect(outcome.block).toBeUndefined();
  });

  test('onFailure "block" makes the timeout block the call', async () => {
    const { fire } = engineSession([preTool({ onFailure: 'block' })], [TIMED_OUT]);
    const outcome = await fire('PreToolUse');
    expect(outcome.proceed).toBe(false);
    expect(outcome.block?.via).toBe('timeout');
  });

  test('an http hook that reaches its timeout is canceled the same way', async () => {
    const hook = preTool({ timeout: 7 }, 'http');
    const open = engineSession([hook], [], {
      http: [{ failure: 'timeout', message: 'timed out' }],
    });
    const outcome = await open.fire('PreToolUse');
    expect(open.http.requests[0]?.timeoutMs).toBe(7000);
    expect(outcome.runs[0]?.status).toBe('timed-out');
    expect(outcome.proceed).toBe(true);
    const guarded = engineSession([preTool({ timeout: 7, onFailure: 'block' }, 'http')], [], {
      http: [{ failure: 'timeout', message: 'timed out' }],
    });
    expect((await guarded.fire('PreToolUse')).proceed).toBe(false);
  });

  test('apart from async: a command hook run with async: true has no timeout at all', async () => {
    const { fire, runner } = engineSession(
      [
        entry('PostToolUse', {
          handler: { type: 'command', command: './bg.sh', async: true, timeout: 5 },
        }),
      ],
      [{}],
    );
    await fire('PostToolUse');
    expect(runner.calls[0]).not.toHaveProperty('timeoutMs');
  });

  test('a timeout that has not been reached changes nothing: the hook decides as usual', async () => {
    const { fire } = engineSession([preTool({ timeout: 5 })], [{ exitCode: 2, stderr: 'no' }]);
    expect((await fire('PreToolUse')).block?.reason).toBe('no');
  });
});

const switchHook = (more: object = {}) =>
  entry('PreModelSwitch', { handler: { type: 'command', command: './switch.sh', ...more } });

spec('hooks.behavior.PreModelSwitch timeouts and other exit codes', () => {
  test('a hook that does not respond before its timeout blocks the switch; the default is 30 seconds', async () => {
    const { fire, runner } = engineSession([switchHook()], [{ exitCode: null, timedOut: true }]);
    const outcome = await fire('PreModelSwitch');
    expect(runner.calls[0]?.timeoutMs).toBe(30_000);
    expect(outcome.proceed).toBe(false);
    expect(outcome.block?.via).toBe('timeout');
  });

  test('an exit code other than 0 or 2 without valid JSON is a non-blocking error: the switch goes ahead', async () => {
    const { fire } = engineSession([switchHook()], [{ exitCode: 1, stderr: 'oops' }]);
    const outcome = await fire('PreModelSwitch');
    expect(outcome.proceed).toBe(true);
    expect(outcome.notices[0]?.message).toContain('Failed with non-blocking status code: oops');
  });

  test('except for hooks whose failure blocks it', async () => {
    const { fire } = engineSession(
      [switchHook({ onFailure: 'block' })],
      [{ exitCode: 1, stderr: 'oops' }],
    );
    expect((await fire('PreModelSwitch')).proceed).toBe(false);
  });

  test('a hook that answers in time does not block', async () => {
    const { fire } = engineSession([switchHook()], [{ exitCode: 0 }]);
    expect((await fire('PreModelSwitch')).proceed).toBe(true);
  });
});

const endHook = (timeout?: number, source = settingsSource, command = './end.sh') =>
  entry('SessionEnd', {
    source,
    handler: { type: 'command', command, ...(timeout === undefined ? {} : { timeout }) },
  });

async function limits(
  entries: ReturnType<typeof endHook>[],
  environment: Record<string, string> = {},
) {
  const { fire, runner } = engineSession(
    entries,
    entries.map(() => ({})),
    { environment },
  );
  await fire('SessionEnd');
  return runner.calls.map((call) => call.timeoutMs);
}

spec('environment.host.CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS', () => {
  test('by default the budget is 1.5 seconds', async () => {
    expect(await limits([endHook()])).toEqual([1500]);
  });

  test('automatically raised to the highest per-hook timeout in settings files, up to 60 seconds', async () => {
    expect(await limits([endHook(20)])).toEqual([20_000]);
    expect(await limits([endHook(300)])).toEqual([60_000]);
  });

  test('timeouts on plugin-provided hooks do not raise the budget', async () => {
    const plugin = endHook(30, pluginSource('p'), './plugin.sh');
    expect(await limits([plugin])).toEqual([1500]);
    expect(await limits([plugin, endHook(20)])).toEqual([20_000, 20_000]);
  });

  test('set in milliseconds it overrides the budget, and is the timeout of each hook without its own', async () => {
    const env = { CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS: '5000' };
    expect(await limits([endHook()], env)).toEqual([5000]);
  });

  test('a hook with its own timeout keeps it, and the override replaces the automatic raise', async () => {
    const env = { CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS: '5000' };
    expect(await limits([endHook(2), endHook(undefined, settingsSource, './b.sh')], env)).toEqual([
      2000, 5000,
    ]);
    expect(await limits([endHook(30)], env)).toEqual([5000]);
  });

  test('only SessionEnd reads it: another event keeps its own default', async () => {
    const { fire, runner } = engineSession(
      [entry('Stop', { handler: { type: 'command', command: './s.sh' } })],
      [{}],
      { environment: { CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS: '5000' } },
    );
    await fire('Stop');
    expect(runner.calls[0]?.timeoutMs).toBe(600_000);
  });
});

describe('SessionEnd output is discarded (hooks.md, "SessionEnd")', () => {
  test('a hook that reaches the budget is canceled without blocking the exit', async () => {
    const { fire } = engineSession([endHook()], [{ exitCode: null, timedOut: true }]);
    const outcome = await fire('SessionEnd');
    expect(outcome.proceed).toBe(true);
    expect(outcome.runs[0]?.status).toBe('timed-out');
  });
});
