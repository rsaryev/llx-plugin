/**
 * Background hooks (hooks.md, "Run hooks in the background", "How async hooks execute": "Claude Code
 * delivers the `additionalContext` and `systemMessage` fields from the hook's JSON response to Claude
 * on the next conversation turn"; an `asyncRewake` hook that exits 2 "wakes Claude"): the host
 * consumes `HookOutcome.background` through `settleDeliveries`, or through the session's queue,
 * `session.takeBackground()`. Integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { createBackgroundQueue } from '../../src/host/background-queue.ts';
import { createPluginHost, type PluginSession } from '../../src/host/index.ts';
import { settleDeliveries, type SettledDeliveries } from '../../src/hooks/index.ts';
import { loaded, SESSION, signal } from '../support/host.ts';
import { pendingRunner } from '../support/hooks-run.ts';
import { fakeEnvironment, locations, recordingHttp } from '../support/ports.ts';

const json = (value: unknown): string => JSON.stringify(value);

async function sessionWith(handler: object) {
  const plugin = await loaded({
    '.claude-plugin/plugin.json': json({ name: 'ci' }),
    'hooks/hooks.json': json({
      hooks: {
        PostToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: './ci.sh', ...handler }] },
        ],
      },
    }),
  });
  const runner = pendingRunner();
  const host = createPluginHost({
    plugins: [{ id: 'ci@acme', plugin }],
    ports: {
      commands: runner,
      http: recordingHttp(),
      locations: locations({ directories: ['/plugins/ci@acme', '/work/app'] }),
      environment: fakeEnvironment(),
    },
  });
  return { runner, session: host.openSession(SESSION) };
}

const done = {
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
  tool_response: {},
  tool_use_id: 't1',
};
const fire = (session: PluginSession) =>
  session.dispatch('PostToolUse', done, { signal: signal() });

const say = (text: string) =>
  json({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } });

const delivered = json({
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'Tests passed' },
  systemMessage: 'CI finished',
});

describe('an async hook', () => {
  test('does not hold the dispatch; settleDeliveries hands over its additionalContext and system message', async () => {
    const { session, runner } = await sessionWith({ async: true });
    const outcome = await fire(session);
    expect(outcome.proceed).toBe(true);
    expect(outcome.background).toHaveLength(1);
    runner.finish(0, { stdout: delivered });
    expect(await settleDeliveries(outcome.background)).toEqual({
      additionalContext: ['Tests passed'],
      systemMessages: ['CI finished'],
    });
  });
});

describe('session.takeBackground', () => {
  test('is empty while the process runs, then returns what settled since the last call, once', async () => {
    const { session, runner } = await sessionWith({ async: true });
    const outcome = await fire(session);
    expect(session.takeBackground()).toEqual({ additionalContext: [], systemMessages: [] });
    runner.finish(0, { stdout: delivered });
    await settleDeliveries(outcome.background);
    expect(session.takeBackground()).toEqual({
      additionalContext: ['Tests passed'],
      systemMessages: ['CI finished'],
    });
    expect(session.takeBackground()).toEqual({ additionalContext: [], systemMessages: [] });
  });

  test('asyncRewake with exit 2 yields a wake with the stderr, apart from the context', async () => {
    const { session, runner } = await sessionWith({ asyncRewake: true });
    const outcome = await fire(session);
    runner.finish(0, { exitCode: 2, stderr: 'deploy failed' });
    await settleDeliveries(outcome.background);
    expect(session.takeBackground()).toEqual({
      additionalContext: [],
      systemMessages: [],
      wake: 'deploy failed',
    });
  });

  test('asyncRewake with exit 2 and an empty stderr wakes with the stdout', async () => {
    const { session, runner } = await sessionWith({ asyncRewake: true });
    const outcome = await fire(session);
    runner.finish(0, { exitCode: 2, stderr: '', stdout: 'x' });
    await settleDeliveries(outcome.background);
    expect(session.takeBackground().wake).toBe('x');
  });

  test('asyncRewake with exit 0 wakes nobody', async () => {
    const { session, runner } = await sessionWith({ asyncRewake: true });
    const outcome = await fire(session);
    runner.finish(0, { exitCode: 0, stdout: 'all good' });
    await settleDeliveries(outcome.background);
    expect(session.takeBackground().wake).toBeUndefined();
  });

  test("the queue is the session's: a delivery that settles after the turn view is gone is taken from any view", async () => {
    const { session, runner } = await sessionWith({ async: true });
    const turn = session.withTurn({ promptId: 'p1' });
    const outcome = await fire(turn);
    runner.finish(0, { stdout: delivered });
    await settleDeliveries(outcome.background);
    expect(session.takeBackground().additionalContext).toEqual(['Tests passed']);
  });

  test('deliveries come in the order they settled', async () => {
    const { session, runner } = await sessionWith({ async: true });
    const first = await fire(session);
    const second = await fire(session);
    runner.finish(1, { stdout: say('second ran first') });
    runner.finish(0, { stdout: say('first ran second') });
    await settleDeliveries([...first.background, ...second.background]);
    expect(session.takeBackground().additionalContext).toEqual([
      'second ran first',
      'first ran second',
    ]);
  });

  test('a background hook that exited 1 delivers nothing, and the queue stays usable', async () => {
    const { session, runner } = await sessionWith({ async: true });
    const failed = await fire(session);
    runner.finish(0, { exitCode: 1, stderr: 'killed' });
    await settleDeliveries(failed.background);
    expect(session.takeBackground()).toEqual({ additionalContext: [], systemMessages: [] });
    const next = await fire(session);
    runner.finish(1, { stdout: delivered });
    await settleDeliveries(next.background);
    expect(session.takeBackground().additionalContext).toEqual(['Tests passed']);
  });
});

describe('session.onBackground', () => {
  test('tells an idle host of an exit 2 wake as it settles, without taking it', async () => {
    const { session, runner } = await sessionWith({ asyncRewake: true });
    const heard: SettledDeliveries[] = [];
    session.onBackground((got) => heard.push(got));
    const outcome = await fire(session);
    expect(heard).toEqual([]);
    runner.finish(0, { exitCode: 2, stderr: 'deploy failed' });
    await settleDeliveries(outcome.background);
    expect(heard).toEqual([{ additionalContext: [], systemMessages: [], wake: 'deploy failed' }]);
    expect(session.takeBackground().wake).toBe('deploy failed');
  });

  test('hears each context delivery of its own, and nothing from a hook that delivered nothing', async () => {
    const { session, runner } = await sessionWith({ async: true });
    const heard: SettledDeliveries[] = [];
    session.onBackground((got) => heard.push(got));
    const failed = await fire(session);
    runner.finish(0, { exitCode: 1, stderr: 'killed' });
    await settleDeliveries(failed.background);
    const next = await fire(session);
    runner.finish(1, { stdout: delivered });
    await settleDeliveries(next.background);
    expect(heard).toEqual([
      { additionalContext: ['Tests passed'], systemMessages: ['CI finished'] },
    ]);
  });

  test('is heard from any view of the session, and the returned function stops it', async () => {
    const { session, runner } = await sessionWith({ async: true });
    const heard: SettledDeliveries[] = [];
    const stop = session.withTurn({ promptId: 'p1' }).onBackground((d) => heard.push(d));
    const first = await fire(session);
    runner.finish(0, { stdout: say('one') });
    await settleDeliveries(first.background);
    stop();
    const second = await fire(session);
    runner.finish(1, { stdout: say('two') });
    await settleDeliveries(second.background);
    expect(heard.map((d) => d.additionalContext)).toEqual([['one']]);
  });

  test('a listener that throws hides nothing and does not stop the others', async () => {
    const { session, runner } = await sessionWith({ async: true });
    const heard: SettledDeliveries[] = [];
    session.onBackground(() => {
      throw new Error('listener bug');
    });
    session.onBackground((got) => heard.push(got));
    const outcome = await fire(session);
    runner.finish(0, { stdout: say('still here') });
    await settleDeliveries(outcome.background);
    expect(heard).toHaveLength(1);
    expect(session.takeBackground().additionalContext).toEqual(['still here']);
  });
});

describe('the background queue', () => {
  test("hands over a repeated delivery of one handler each time: the SessionStart repeat check is the host's", async () => {
    const queue = createBackgroundQueue();
    const again = {
      outcome: 'completed' as const,
      handlerId: 'start:0',
      additionalContext: 'same context',
    };
    const deliverOnce = async (): Promise<readonly string[]> => {
      const delivery = Promise.resolve(again);
      queue.add([delivery]);
      await settleDeliveries([delivery]);
      return queue.take().additionalContext;
    };
    expect(await deliverOnce()).toEqual(['same context']);
    expect(await deliverOnce()).toEqual(['same context']);
  });

  test('a promise that rejects delivers nothing and does not stop the others', async () => {
    const queue = createBackgroundQueue();
    const lost = Promise.reject(new Error('process vanished'));
    const fine = Promise.resolve({
      outcome: 'completed' as const,
      handlerId: 'a',
      additionalContext: 'still here',
    });
    queue.add([lost, fine]);
    await settleDeliveries([lost, fine]);
    expect(queue.take()).toEqual({ additionalContext: ['still here'], systemMessages: [] });
  });
});
