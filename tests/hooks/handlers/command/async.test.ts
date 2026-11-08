/**
 * hooks.md § Command hook fields (`async`: "runs in the background without blocking";
 * `asyncRewake`: "runs in the background and wakes Claude on exit code 2. The hook's stderr, or
 * stdout if stderr is empty, is shown to Claude as a system reminder"), § Run hooks in the
 * background ("Claude Code doesn't enforce `timeout` on it. Claude Code still enforces `timeout`
 * on a hook you run with `asyncRewake`"; "receives the same JSON input via stdin as a synchronous
 * hook"), "Limitations" ("an `asyncRewake` hook that exits with code 2 wakes Claude immediately
 * even when the session is idle"). The SDK type adds that `asyncRewake` "Implies async".
 *
 * Delivering the background output on the next turn is the host's (it holds the session); the kit
 * returns the run as a promise the engine reads when the process ends.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import {
  pendingRunner,
  planFor,
  pluginCommand,
  runContext,
  settingsCommand,
} from '../../../support/hooks-run.ts';
import { scriptedRunner } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';

/** Starts the hook against a runner whose process does not end until the test says so. */
async function start(
  hook: Partial<Parameters<typeof settingsCommand>[0]>,
  input = '{"tool_name":"Write"}',
) {
  const runner = pendingRunner();
  const entry = settingsCommand({ command: './run-tests.sh', ...hook });
  const result = await runHandler(entry, runContext({ runner, input, timeouts: planFor(entry) }));
  return { runner, result };
}

const settled = async (run: Awaited<ReturnType<typeof start>>['result']['run']) => {
  if (run.kind !== 'background') throw new Error(`not a background run: ${run.kind}`);
  return run.done;
};

spec('hooks.handler.command.async', () => {
  test('returns at once, before the process ends, so Claude is not blocked', async () => {
    const { runner, result } = await start({ async: true });
    expect(result.run.kind).toBe('background');
    expect(runner.calls).toHaveLength(1);
  });

  test('the process gets the same JSON input on stdin as a synchronous hook', async () => {
    const { runner } = await start({ async: true }, '{"tool_name":"Write","tool_input":{}}');
    expect(runner.calls[0]?.stdin).toBe('{"tool_name":"Write","tool_input":{}}');
  });

  test('the timeout is not enforced: the port gets no limit', async () => {
    const { runner } = await start({ async: true, timeout: 5 });
    expect(runner.calls[0]).not.toHaveProperty('timeoutMs');
  });

  test('the same hook without async is awaited and gets its limit', async () => {
    const runner = scriptedRunner({ stdout: 'ok' });
    const entry = settingsCommand({ command: './run-tests.sh', timeout: 5 });
    const result = await runHandler(entry, runContext({ runner, timeouts: planFor(entry) }));
    expect(result.run).toEqual({ kind: 'exited', exitCode: 0, stdout: 'ok', stderr: '' });
    expect(runner.calls[0]?.timeoutMs).toBe(5000);
  });

  test('once the process ends, done carries its exit code and output for the engine to read', async () => {
    const { runner, result } = await start({ async: true });
    runner.finish(0, { exitCode: 0, stdout: '{"systemMessage":"Tests passed"}' });
    expect((await settled(result.run)).run).toEqual({
      kind: 'exited',
      exitCode: 0,
      stdout: '{"systemMessage":"Tests passed"}',
      stderr: '',
    });
  });

  test('exit code 2 of an async hook does not wake Claude: only asyncRewake does', async () => {
    const { runner, result } = await start({ async: true });
    runner.finish(0, { exitCode: 2, stderr: 'tests failed' });
    expect(await settled(result.run)).toEqual({
      run: { kind: 'exited', exitCode: 2, stdout: '', stderr: 'tests failed' },
    });
  });

  test('a process that cannot start is reported when it settles', async () => {
    const { runner, result } = await start({ async: true });
    runner.finish(0, { exitCode: null, startError: 'no such file' });
    expect((await settled(result.run)).run).toEqual({
      kind: 'not-started',
      message: 'no such file',
    });
  });

  test('a refused hook (shell-form ${user_config.*}) does not start a background process', async () => {
    const runner = pendingRunner();
    const result = await runHandler(
      pluginCommand({ command: './n.sh ${user_config.x}', async: true }),
      runContext({ runner }),
    );
    expect(result.run.kind).toBe('skipped');
    expect(runner.calls).toHaveLength(0);
  });
});

spec('hooks.handler.command.asyncRewake', () => {
  describe('implies async', () => {
    test('runs in the background even without async: true', async () => {
      const { result, runner } = await start({ asyncRewake: true });
      expect(result.run.kind).toBe('background');
      expect(runner.calls).toHaveLength(1);
    });

    test('the process gets the JSON input on stdin', async () => {
      const { runner } = await start({ asyncRewake: true }, '{"a":1}');
      expect(runner.calls[0]?.stdin).toBe('{"a":1}');
    });
  });

  test('the timeout is still enforced: the port gets the limit', async () => {
    const { runner } = await start({ asyncRewake: true, timeout: 20 });
    expect(runner.calls[0]?.timeoutMs).toBe(20_000);
  });

  test('with both flags the timeout is enforced too', async () => {
    const { runner } = await start({ async: true, asyncRewake: true });
    expect(runner.calls[0]?.timeoutMs).toBe(600_000);
  });

  test('exit code 2 wakes Claude with the stderr', async () => {
    const { runner, result } = await start({ asyncRewake: true });
    runner.finish(0, { exitCode: 2, stderr: 'build broke', stdout: 'ignored' });
    expect((await settled(result.run)).wake).toBe('build broke');
  });

  test('exit code 2 with an empty stderr wakes Claude with the stdout', async () => {
    const { runner, result } = await start({ asyncRewake: true });
    runner.finish(0, { exitCode: 2, stderr: '', stdout: 'deploy failed' });
    expect((await settled(result.run)).wake).toBe('deploy failed');
  });

  test('any other exit code does not wake Claude', async () => {
    for (const exitCode of [0, 1, 3]) {
      const { runner, result } = await start({ asyncRewake: true });
      runner.finish(0, { exitCode, stderr: 'noise' });
      expect((await settled(result.run)).wake).toBeUndefined();
    }
  });

  test('a timeout does not wake Claude and discards the output', async () => {
    const { runner, result } = await start({ asyncRewake: true });
    runner.finish(0, { exitCode: null, timedOut: true, stdout: 'partial', stderr: 'x' });
    expect(await settled(result.run)).toEqual({ run: { kind: 'timed-out' } });
  });
});

describe('judgment: the wake text', () => {
  test('exit code 2 with no stderr and no stdout does not wake Claude with a blank reminder', async () => {
    const { runner, result } = await start({ asyncRewake: true });
    runner.finish(0, { exitCode: 2, stderr: '', stdout: '' });
    expect((await settled(result.run)).wake).toBeUndefined();
  });

  test('exit code 2 with only whitespace on both streams does not wake Claude either', async () => {
    const { runner, result } = await start({ asyncRewake: true });
    runner.finish(0, { exitCode: 2, stderr: ' \n', stdout: '\t' });
    expect((await settled(result.run)).wake).toBeUndefined();
  });

  test('a stderr of only whitespace is empty: the stdout wakes Claude', async () => {
    const { runner, result } = await start({ asyncRewake: true });
    runner.finish(0, { exitCode: 2, stderr: ' \n', stdout: 'from stdout' });
    expect((await settled(result.run)).wake).toBe('from stdout');
  });

  test('a run that was cancelled does not wake Claude', async () => {
    const { runner, result } = await start({ asyncRewake: true });
    runner.finish(0, { exitCode: null });
    expect(await settled(result.run)).toEqual({ run: { kind: 'cancelled' } });
  });
});
