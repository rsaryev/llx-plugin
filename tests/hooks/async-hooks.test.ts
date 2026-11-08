/**
 * hooks.md § "Configure an async hook" (`async: true` on a command hook only; `timeout` not
 * enforced on it, still enforced on `asyncRewake`; teardown kills the hook with outcome
 * `cancelled`) and § "How async hooks execute" (the process starts and the dispatch goes on; the
 * `additionalContext` and `systemMessage` of the JSON response reach Claude later; the response is
 * alone on stdout or on one line of its own; a field of the wrong type is dropped). The docs'
 * `run-tests.sh` example is the hook under test.
 */
import { expect, test } from 'bun:test';
import { readHooksFile } from '../../src/format/index.ts';
import { createHookEngine, createHookRegistry } from '../../src/hooks/index.ts';
import type { HookHandlerOf } from '../../src/protocol/hook-config.ts';
import { entry, FACTS, session } from '../support/hooks-select.ts';
import { file, firstHandler, warningsOf } from '../support/hooks-read.ts';
import { pendingRunner } from '../support/hooks-run.ts';
import { fakeEnvironment, locations } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

/** Lets the engine reach the runner. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

type Command = HookHandlerOf<'command'>;
const SCRIPT: Command = { type: 'command', command: '/path/to/lint-check.sh' };

const RUN_TESTS: Command = {
  type: 'command',
  command: '/path/to/run-tests.sh',
  async: true,
} as const;

/** Dispatches a PostToolUse over a runner whose process the test ends. */
async function dispatch(
  handler: Partial<Command> = RUN_TESTS,
  signal = new AbortController().signal,
) {
  const runner = pendingRunner();
  const engine = createHookEngine({
    commands: runner,
    locations: locations(),
    environment: fakeEnvironment(),
  });
  const hook = entry('PostToolUse', { matcher: 'Write', handler: { ...SCRIPT, ...handler } });
  const outcome = await engine.dispatch(createHookRegistry([hook]), {
    event: 'PostToolUse',
    facts: { ...FACTS.PostToolUse, tool_name: 'Write' },
    session: session(),
    signal,
  });
  return { runner, outcome, hook };
}

const context = (text: string) =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } });

spec('hooks.behavior.Configure an async hook', () => {
  test('async: true runs the command in the background: Claude continues at once, before the script ends', async () => {
    const { runner, outcome } = await dispatch();
    expect(outcome.proceed).toBe(true);
    expect(outcome.runs[0]?.status).toBe('background');
    expect(runner.calls).toHaveLength(1);
    expect(outcome.background).toHaveLength(1);
  });

  test('the field is only available on command hooks: another type loses it with a warning', () => {
    const result = readHooksFile(
      file({ PreToolUse: [{ hooks: [{ type: 'http', url: 'http://h/x', async: true }] }] }),
    );
    expect(firstHandler(result)).toEqual({ type: 'http', url: 'http://h/x' });
    expect(warningsOf(result).map((found) => found.path)).toEqual([
      'hooks.PreToolUse[0].hooks[0].async',
    ]);
  });

  test('without async the same hook is awaited: the dispatch reads its result', async () => {
    const runner = pendingRunner();
    const engine = createHookEngine({
      commands: runner,
      locations: locations(),
      environment: fakeEnvironment(),
    });
    const hook = entry('PostToolUse', { handler: { ...SCRIPT, command: './run-tests.sh' } });
    const pending = engine.dispatch(createHookRegistry([hook]), {
      event: 'PostToolUse',
      facts: FACTS.PostToolUse,
      session: session(),
      signal: new AbortController().signal,
    });
    await tick();
    runner.finish(0, { stdout: '' });
    expect((await pending).runs[0]?.status).toBe('success');
  });

  test('Claude Code does not enforce timeout on it, and still enforces it on a hook run with asyncRewake', async () => {
    const plain = await dispatch({ ...RUN_TESTS, timeout: 5 });
    expect(plain.runner.calls[0]).not.toHaveProperty('timeoutMs');
    const rewake = await dispatch({ command: './r.sh', asyncRewake: true, timeout: 5 });
    expect(rewake.runner.calls[0]?.timeoutMs).toBe(5000);
  });

  test('a hook still running at teardown is finalized with outcome cancelled', async () => {
    const controller = new AbortController();
    const { runner, outcome } = await dispatch(RUN_TESTS, controller.signal);
    controller.abort();
    runner.finish(0, { exitCode: null });
    expect(await outcome.background[0]).toMatchObject({ outcome: 'cancelled' });
  });

  test('an asyncRewake hook that reaches its timeout is finalized with outcome timed-out', async () => {
    const { runner, outcome } = await dispatch({
      command: './r.sh',
      asyncRewake: true,
      timeout: 5,
    });
    runner.finish(0, { exitCode: null, timedOut: true });
    expect(await outcome.background[0]).toMatchObject({ outcome: 'timed-out' });
  });

  test('a hook whose process did not start is finalized with outcome failed', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, { exitCode: null, startError: 'spawn ./run-tests.sh ENOENT' });
    const delivery = await outcome.background[0];
    expect(delivery).toMatchObject({ outcome: 'failed' });
    expect(delivery).not.toHaveProperty('wake');
  });

  test('a hook that finishes normally is completed', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, { stdout: '' });
    expect(await outcome.background[0]).toMatchObject({ outcome: 'completed' });
  });
});

spec(['hooks.behavior.How async hooks execute', 'hooks.behavior.Limitations'], () => {
  test('the hook receives the same JSON input via stdin as a synchronous hook', async () => {
    const { runner } = await dispatch();
    const sync = pendingRunner();
    const engine = createHookEngine({
      commands: sync,
      locations: locations(),
      environment: fakeEnvironment(),
    });
    const hook = entry('PostToolUse', { matcher: 'Write', handler: { ...SCRIPT } });
    void engine.dispatch(createHookRegistry([hook]), {
      event: 'PostToolUse',
      facts: { ...FACTS.PostToolUse, tool_name: 'Write' },
      session: session(),
      signal: new AbortController().signal,
    });
    await tick();
    expect(runner.calls[0]?.stdin).toBe(sync.calls[0]?.stdin);
    expect(JSON.parse(runner.calls[0]?.stdin ?? '').hook_event_name).toBe('PostToolUse');
  });

  test('after the process exits, the additionalContext and systemMessage of its JSON response are delivered to Claude', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, {
      stdout: JSON.stringify({
        systemMessage: 'Tests passed',
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'All green' },
      }),
    });
    expect(await outcome.background[0]).toMatchObject({
      additionalContext: 'All green',
      systemMessage: 'Tests passed',
    });
  });

  test("neither is shown to the user the way a synchronous hook's systemMessage is: no notice, no merged message", async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, { stdout: JSON.stringify({ systemMessage: 'quiet' }) });
    await outcome.background[0];
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.notices).toEqual([]);
  });

  test('the response may be alone on stdout and span several lines (pretty-printed)', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, { stdout: JSON.stringify({ systemMessage: 'done' }, null, 2) });
    expect(await outcome.background[0]).toMatchObject({ systemMessage: 'done' });
  });

  test('or on one line of its own, with other text around it (jq -c)', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, { stdout: `building...\n${context('Tests failed')}\nbye\n` });
    expect(await outcome.background[0]).toMatchObject({ additionalContext: 'Tests failed' });
  });

  test('other text around a response that spans several lines is not a response', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, { stdout: `log line\n{\n  "systemMessage": "lost"\n}\n` });
    const delivery = await outcome.background[0];
    expect(delivery).not.toHaveProperty('systemMessage');
  });

  test('a field whose value has the wrong type is dropped instead of delivered', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, {
      stdout: JSON.stringify({
        systemMessage: 42,
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'kept' },
      }),
    });
    const delivery = await outcome.background[0];
    expect(delivery).toMatchObject({ additionalContext: 'kept' });
    expect(delivery).not.toHaveProperty('systemMessage');
  });

  test('a hookSpecificOutput.additionalContext of the wrong type is dropped, and a systemMessage beside it kept', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, {
      stdout: JSON.stringify({
        systemMessage: 'kept',
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: ['no'] },
      }),
    });
    const delivery = await outcome.background[0];
    expect(delivery).toMatchObject({ systemMessage: 'kept' });
    expect(delivery).not.toHaveProperty('additionalContext');
  });

  test('a response with a hookSpecificOutput that is not an object loses it; both wrong types leave a bare completion', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, {
      stdout: JSON.stringify({ systemMessage: false, hookSpecificOutput: 'additionalContext' }),
    });
    expect(await outcome.background[0]).toEqual({
      handlerId: expect.any(String),
      outcome: 'completed',
      exitCode: 0,
    });
  });

  test('response fields that would control the action have no effect: it already completed', async () => {
    const { runner, outcome } = await dispatch();
    runner.finish(0, {
      stdout: JSON.stringify({ decision: 'block', reason: 'late', continue: false }),
    });
    expect(await outcome.background[0]).toEqual({
      handlerId: expect.any(String),
      outcome: 'completed',
      exitCode: 0,
    });
    expect(outcome.proceed).toBe(true);
    expect(outcome.continue).toBe(true);
  });

  test('an asyncRewake hook that exits 2 wakes Claude with its stderr, an async one does not', async () => {
    const rewake = await dispatch({ command: './r.sh', asyncRewake: true });
    rewake.runner.finish(0, { exitCode: 2, stderr: 'deploy failed' });
    expect(await rewake.outcome.background[0]).toMatchObject({ wake: 'deploy failed' });
    const plain = await dispatch();
    plain.runner.finish(0, { exitCode: 2, stderr: 'deploy failed' });
    expect(await plain.outcome.background[0]).not.toHaveProperty('wake');
  });

  test('"stderr, or stdout if stderr is empty": an asyncRewake exit 2 with an empty stderr wakes Claude with its stdout', async () => {
    const { runner, outcome } = await dispatch({ command: './r.sh', asyncRewake: true });
    runner.finish(0, { exitCode: 2, stderr: '', stdout: 'tests are red' });
    expect(await outcome.background[0]).toMatchObject({ wake: 'tests are red' });
  });

  test('a stderr of only whitespace is empty (judgment): stdout wakes Claude; a blank stdout too means nothing to say', async () => {
    const spaces = await dispatch({ command: './r.sh', asyncRewake: true });
    spaces.runner.finish(0, { exitCode: 2, stderr: ' \n\t', stdout: 'from stdout' });
    expect(await spaces.outcome.background[0]).toMatchObject({ wake: 'from stdout' });
    const blank = await dispatch({ command: './r.sh', asyncRewake: true });
    blank.runner.finish(0, { exitCode: 2, stderr: '  ', stdout: '\n' });
    expect(await blank.outcome.background[0]).not.toHaveProperty('wake');
  });

  test('an asyncRewake exit other than 2 does not wake Claude, even with stderr', async () => {
    const { runner, outcome } = await dispatch({ command: './r.sh', asyncRewake: true });
    runner.finish(0, { exitCode: 1, stderr: 'warning' });
    expect(await outcome.background[0]).not.toHaveProperty('wake');
  });
});

// hooks.md, Common fields: `once` is consumed by the first successful run, not a failed background
// command. The exit code lets a host distinguish these deliveries, all of which are `completed`.
spec('hooks.handler.common.once', () => {
  test.each([0, 1, 2])(
    'the completed background delivery carries exit code %s',
    async (exitCode) => {
      const { runner, outcome } = await dispatch();
      runner.finish(0, { exitCode });
      expect(await outcome.background[0]).toMatchObject({ outcome: 'completed', exitCode });
    },
  );
});
