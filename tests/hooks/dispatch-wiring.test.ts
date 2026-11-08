/**
 * The dispatch end to end over the real stages and fakes (hooks.md § "Hook lifecycle", § "Run
 * hooks in the background", § "Exit code output"): merging the outputs of several hooks, `once`,
 * the observer, background hooks, an event no hook handles. The rules of the docs that have an id
 * are proven in dispatch.test.ts; the wiring around them is tested here outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  createHookEngine,
  createHookRegistry,
  type HookNotice,
  type HookObserver,
} from '../../src/hooks/index.ts';
import { cmd, fire } from '../support/hooks-fire.ts';
import { pendingRunner } from '../support/hooks-run.ts';
import { entry, FACTS, session, skillSource } from '../support/hooks-select.ts';
import { fakeOutput } from '../support/hooks-verdict.ts';
import { fakeEnvironment, locations } from '../support/ports.ts';

describe('the dispatch', () => {
  test('every selected hook runs and their outputs merge', async () => {
    const first = entry('UserPromptSubmit', { handler: cmd() });
    const second = entry('UserPromptSubmit', {
      handler: { type: 'command', command: './other.sh' },
    });
    const { outcome } = await fire(
      'UserPromptSubmit',
      [first, second],
      [{ stdout: 'branch is main' }, { stdout: JSON.stringify({ systemMessage: 'careful' }) }],
    );
    expect(outcome.additionalContext).toEqual(['branch is main']);
    expect(outcome.systemMessages).toEqual(['careful']);
    expect(outcome.runs.map((run) => run.status)).toEqual(['success', 'success']);
  });

  test('a block by one hook does not hide the output of the others', async () => {
    const blocker = entry('Stop', { handler: cmd() });
    const other = entry('Stop', { handler: { type: 'command', command: './b.sh' } });
    const { outcome } = await fire(
      'Stop',
      [blocker, other],
      [
        { exitCode: 2, stderr: 'keep going' },
        { stdout: JSON.stringify({ systemMessage: 'note' }) },
      ],
    );
    expect(outcome.block?.by).toBe(blocker.id);
    expect(outcome.systemMessages).toEqual(['note']);
  });

  test('continue: false stops with the reason; it is not a block of the action', async () => {
    const hook = entry('PostToolUse', { handler: cmd() });
    const json = JSON.stringify({ continue: false, stopReason: 'Build failed' });
    const { outcome } = await fire('PostToolUse', [hook], [{ stdout: json }]);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe('Build failed');
    expect(outcome.proceed).toBe(true);
  });

  test('PostToolUse exit 2: Claude sees the stderr although the tool already ran', async () => {
    const hook = entry('PostToolUse', { handler: cmd() });
    const { outcome } = await fire('PostToolUse', [hook], [{ exitCode: 2, stderr: 'lint failed' }]);
    expect(outcome.proceed).toBe(true);
    expect(outcome.feedback).toEqual([
      {
        handlerId: hook.id,
        to: 'claude',
        text: 'PostToolUse:Edit hook error: [./guard.sh]: lint failed',
      },
    ]);
  });

  test('the observer hears of each finished handler and each notice', async () => {
    const finished: string[] = [];
    const notices: HookNotice[] = [];
    const observer: HookObserver = {
      finished: (info) => finished.push(`${info.handlerId}:${info.status}`),
      notice: (notice) => notices.push(notice),
    };
    const hook = entry('PreToolUse', { handler: cmd() });
    await fire('PreToolUse', [hook], [{ exitCode: 1, stderr: 'boom' }], { observer });
    expect(finished).toEqual([`${hook.id}:non-blocking-error`]);
    expect(notices).toHaveLength(1);
  });

  test('once: a successful skill hook is consumed, one that failed or blocked stays', async () => {
    const hook = entry('PreToolUse', { handler: cmd({ once: true }), source: skillSource });
    expect((await fire('PreToolUse', [hook], [{}])).outcome.consumedOnce).toEqual([hook.id]);
    expect((await fire('PreToolUse', [hook], [{ exitCode: 2 }])).outcome.consumedOnce).toEqual([]);
    expect((await fire('PreToolUse', [hook], [{ exitCode: 1 }])).outcome.consumedOnce).toEqual([]);
    expect((await fire('PreToolUse', [hook], [{ timedOut: true }])).outcome.consumedOnce).toEqual(
      [],
    );
  });

  test('an async hook does not hold the dispatch: its result arrives later', async () => {
    const runner = pendingRunner();
    const engine = createHookEngine(
      { commands: runner, locations: locations(), environment: fakeEnvironment() },
      { output: fakeOutput },
    );
    const hook = entry('PostToolUse', { handler: cmd({ async: true }) });
    const outcome = await engine.dispatch(createHookRegistry([hook]), {
      event: 'PostToolUse',
      facts: FACTS.PostToolUse,
      session: session(),
      signal: new AbortController().signal,
    });
    expect(outcome.proceed).toBe(true);
    expect(outcome.background).toHaveLength(1);
    const response = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'Tests passed' },
      systemMessage: 7,
    });
    runner.finish(0, { stdout: `running\n${response}\n` });
    // "drops any field whose value has the wrong type": the systemMessage is a number.
    expect(await outcome.background[0]).toEqual({
      handlerId: hook.id,
      additionalContext: 'Tests passed',
    });
  });

  test('asyncRewake: exit code 2 wakes Claude with the stderr', async () => {
    const runner = pendingRunner();
    const engine = createHookEngine(
      { commands: runner, locations: locations(), environment: fakeEnvironment() },
      { output: fakeOutput },
    );
    const hook = entry('PostToolUse', { handler: cmd({ asyncRewake: true }) });
    const outcome = await engine.dispatch(createHookRegistry([hook]), {
      event: 'PostToolUse',
      facts: FACTS.PostToolUse,
      session: session(),
      signal: new AbortController().signal,
    });
    runner.finish(0, { exitCode: 2, stderr: 'deploy failed' });
    expect(await outcome.background[0]).toEqual({ handlerId: hook.id, wake: 'deploy failed' });
  });

  test('an event with no hook, and an input that fails its schema, run nothing', async () => {
    const none = await fire('Stop', [], []);
    expect(none.outcome.proceed).toBe(true);
    expect(none.outcome.runs).toEqual([]);
    const hook = entry('PreToolUse', { handler: cmd() });
    const bad = await fire('PreToolUse', [hook], [], { facts: { tool_name: 5 } });
    expect(bad.runner.calls).toHaveLength(0);
    expect(bad.outcome.issues.some((issue) => issue.severity === 'error')).toBe(true);
  });

  test('a Monitor call that reached a Bash matcher gives the hook a Bash call, its effects ignored', async () => {
    const hook = entry('PreToolUse', { matcher: 'Bash', handler: cmd() });
    const facts = {
      ...FACTS.PreToolUse,
      tool_name: 'Monitor',
      tool_input: { description: 'tail', timeout_ms: 1000, command: 'tail -f app.log' },
    };
    const allow = JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow' } });
    const { runner, outcome } = await fire('PreToolUse', [hook], [{ stdout: allow }], { facts });
    const sent = runner.calls[0]?.stdin;
    expect(typeof sent === 'string' ? JSON.parse(sent).tool_name : undefined).toBe('Bash');
    expect(outcome.runs).toHaveLength(1);
  });
});
