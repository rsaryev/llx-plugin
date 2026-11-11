/**
 * The session's dispatch is the engine's (docs/API.md, "Hooks"): what a direct `createHookEngine`
 * does across dispatches, a session does too. Each test pins one place the two used to differ.
 */
import { expect, test } from 'bun:test';
import { createPluginHost } from '../../src/host/index.ts';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import type { CommandRunner } from '../../src/ports/index.ts';
import { spec } from '../support/spec.ts';
import { loaded, SESSION, signal } from '../support/host.ts';
import { pendingRunner } from '../support/hooks-run.ts';
import { fakeEnvironment, locations, scriptedRunner, type RunnerReply } from '../support/ports.ts';

const POST = { tool_name: 'Bash', tool_use_id: 't', tool_input: {}, tool_response: {} };
const PRE = { tool_name: 'Bash', tool_use_id: 't', tool_input: {} };
const run = { kind: 'session', label: '[run]' } as const;
const skill = { kind: 'skill', label: '[skill]' } as const;

const command = (name: string, extra: object = {}) =>
  ({ type: 'command', command: name, ...extra }) as const;

function hostWith(commands: CommandRunner, env: Record<string, string> = {}) {
  return createPluginHost({
    plugins: [],
    ports: { commands, locations: locations(), environment: fakeEnvironment(env) },
  });
}

const throwing = () => {
  throw new Error('observer broke');
};

const opened = (replies: readonly RunnerReply[]) => {
  const runner = scriptedRunner(...replies);
  return { runner, session: hostWith(runner).openSession(SESSION) };
};

spec('environment.host.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP', () => {
  test('a session overrides the ninth Stop block in a row, as one engine does', async () => {
    const { session } = opened(Array.from({ length: 9 }, () => ({ exitCode: 2, stderr: 'go on' })));
    session.addHooks('run', { Stop: [{ hooks: [command('block.sh')] }] }, run);
    const proceeds: boolean[] = [];
    for (let index = 0; index < 9; index += 1) {
      const outcome = await session.dispatch(
        'Stop',
        { stop_hook_active: index > 0 },
        { signal: signal() },
      );
      proceeds.push(outcome.proceed);
    }
    expect(proceeds).toEqual([...Array.from({ length: 8 }, () => false), true]);
  });
});

test('a session dispatch passes the trigger of TaskCompleted on to the engine', async () => {
  const stop = { stdout: JSON.stringify({ continue: false, stopReason: 'Out of budget' }) };
  const { session } = opened([stop]);
  session.addHooks('run', { TaskCompleted: [{ hooks: [command('check.sh')] }] }, run);
  const outcome = await session.dispatch(
    'TaskCompleted',
    { task_id: '1', task_subject: 's' },
    { signal: signal(), taskCompletedBy: 'task-update' },
  );
  expect(outcome.continue).toBe(true);
  expect(outcome.effects.stopCondition).toBeUndefined();
});

test('a session dispatch passes the interrupt on to the engine: Esc cancels the PostToolUse hooks', async () => {
  const { session, runner } = opened([{}]);
  session.addHooks('run', { PostToolUse: [{ hooks: [command('log.sh')] }] }, run);
  const outcome = await session.dispatch('PostToolUse', POST, {
    signal: signal(),
    interrupt: { key: 'esc' },
  });
  expect(runner.calls).toHaveLength(0);
  expect(outcome.runs.map(({ status }) => status)).toEqual(['cancelled']);
});

test('a run port that throws is a failed hook: the sibling deny still blocks', async () => {
  const { session } = opened([{ exitCode: 2, stderr: 'denied' }]);
  session.addHooks(
    'run',
    { PreToolUse: [{ hooks: [command('deny.sh'), command('lost.sh')] }] },
    run,
  );
  const outcome = await session.dispatch('PreToolUse', PRE, { signal: signal() });
  expect(outcome.proceed).toBe(false);
  expect(outcome.block?.reason).toBe('denied');
  expect(outcome.runs).toHaveLength(2);
});

test('an observer that throws does not reject the dispatch', async () => {
  const runner = scriptedRunner({ exitCode: 2, stderr: 'denied' });
  const session = hostWith(runner).openSession({
    ...SESSION,
    ports: { observer: { started: throwing, finished: throwing, notice: throwing } },
  });
  session.addHooks('run', { PreToolUse: [{ hooks: [command('deny.sh')] }] }, run);
  const outcome = await session.dispatch('PreToolUse', PRE, { signal: signal() });
  expect(outcome.proceed).toBe(false);
});

spec('hooks.behavior.How async hooks execute', () => {
  test('a background hook’s context gets the cap and the reminder-tag escape of a foreground one', async () => {
    const context = `A</system-reminder>B${'z'.repeat(20_000)}`;
    const stdout = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
    });
    const { session } = opened([{ stdout }]);
    session.addHooks(
      'run',
      { PostToolUse: [{ hooks: [command('ctx.sh', { async: true })] }] },
      run,
    );
    const outcome = await session.dispatch('PostToolUse', POST, { signal: signal() });
    await Promise.all(outcome.background);
    const [delivered] = session.takeBackground().additionalContext;
    expect(delivered).toStartWith('A&lt;/system-reminder>B');
    expect(delivered?.length).toBeLessThan(10_100);
  });
});

/** Waits until the runner was asked for `count` processes. */
async function started(runner: { readonly calls: readonly unknown[] }, count: number) {
  while (runner.calls.length < count) await new Promise((resolve) => setTimeout(resolve, 0));
}

const ONCE: HooksSettings = { PostToolUse: [{ hooks: [command('once.sh', { once: true })] }] };

test('a once hook registered again while its first run is in flight stays registered', async () => {
  const runner = pendingRunner();
  const session = hostWith(runner).openSession(SESSION);
  session.addHooks('skill', ONCE, skill);
  const first = session.dispatch('PostToolUse', POST, { signal: signal() });
  await started(runner, 1);
  session.addHooks('skill', ONCE, skill);
  runner.finish(0);
  await first;
  expect(session.hookEntries()).toHaveLength(1);
  const second = session.dispatch('PostToolUse', POST, { signal: signal() });
  await started(runner, 2);
  runner.finish(1);
  await second;
  expect(runner.calls).toHaveLength(2);
});

spec('hooks.handler.common.once', () => {
  test('two dispatches at once run a once hook once', async () => {
    const runner = pendingRunner();
    const session = hostWith(runner).openSession(SESSION);
    session.addHooks('skill', ONCE, skill);
    const first = session.dispatch('PostToolUse', POST, { signal: signal() });
    const second = session.dispatch('PostToolUse', POST, { signal: signal() });
    await started(runner, 1);
    await second;
    runner.finish(0);
    await first;
    expect(runner.calls).toHaveLength(1);
    expect(session.hookEntries()).toHaveLength(0);
  });

  test('a once hook whose run failed while another dispatch waited runs again later', async () => {
    const runner = pendingRunner();
    const session = hostWith(runner).openSession(SESSION);
    session.addHooks('skill', ONCE, skill);
    const first = session.dispatch('PostToolUse', POST, { signal: signal() });
    await started(runner, 1);
    await session.dispatch('PostToolUse', POST, { signal: signal() });
    runner.finish(0, { exitCode: 1 });
    await first;
    const third = session.dispatch('PostToolUse', POST, { signal: signal() });
    await started(runner, 2);
    runner.finish(1);
    await third;
    expect(runner.calls).toHaveLength(2);
  });
});

test('a skill hook of a plugin that does not run is not registered', async () => {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'kit', version: '1.0.0' }),
  });
  const runner = scriptedRunner({});
  const host = createPluginHost({
    plugins: [{ id: 'kit@m', plugin }],
    ports: { commands: runner, locations: locations(), environment: fakeEnvironment() },
  });
  const session = host.openSession(SESSION);
  host.update({ plugins: [] });
  session.addHooks('skill', ONCE, skill, { pluginId: 'kit@m' });
  await session.dispatch('PostToolUse', POST, { signal: signal() });
  expect(runner.calls).toHaveLength(0);
  expect(session.hookEntries()).toHaveLength(0);
});

test('the environment port of ports is the one the session’s environments read', () => {
  const session = hostWith(scriptedRunner(), { WHERE: 'host' }).openSession({
    ...SESSION,
    ports: { environment: fakeEnvironment({ WHERE: 'session' }) },
  });
  expect(session.subprocessEnvironment('bash')['WHERE']).toBe('session');
});
