/**
 * plugins/mods/api.md § Work your mod started before the interruption ("A prompt from
 * `$.prompt.submit` still in the queue: Dropped. The call resolves with `{ drop: 'the prompt was
 * removed from the queue before it ran' }`. A command from `$.command.run` still in the queue:
 * Dropped. The call rejects with an error whose message includes `the command was removed from the
 * queue before it ran`. A foreground Bash or PowerShell command from `$.tool.call` that was already
 * running when the user stopped the turn and reaches its timeout before their next input: "Stopped at
 * its timeout instead of moving to the background. The call resolves with `isError` set, and the
 * output includes the line `Ended instead of moving to the background: plugins' input is held, by a
 * Stop or by the host's limits.`").
 */
import { expect, test } from 'bun:test';
import { createRunGate, HELD_AT_TIMEOUT, type ModHostPorts } from '../../../src/mods/api/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { flush } from '../../support/mods-chain.ts';
import { numbers } from '../../support/mods-refusal.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

function waiting(kind: 'prompts' | 'commands') {
  const queues: AbortSignal[] = [];
  const release: (() => void)[] = [];
  const hold = (queue?: AbortSignal) =>
    new Promise<{ drop?: string }>((resolve) => {
      if (queue) queues.push(queue);
      release.push(() => resolve({}));
    });
  const base = fakePorts().ports;
  const ports: Partial<ModHostPorts> =
    kind === 'prompts'
      ? { prompts: { ...base.prompts, submit: (_prompt, queue) => hold(queue) } }
      : { commands: { builtIns: () => [], run: (_command, queue) => hold(queue) } };
  return { queues, release, ports };
}

spec('mods.apiGuide.Work your mod started before the interruption.$.prompt.submit', () => {
  test('a prompt still in the queue when the user stops the turn resolves with { drop: "the prompt was removed from the queue before it ran" }', async () => {
    const queue = waiting('prompts');
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({ ports: queue.ports, options: { gate } });
    const pending = h.api.prompt.submit({ text: 'later' });
    await flush();
    gate.interrupt();
    expect(await pending).toEqual({ drop: 'the prompt was removed from the queue before it ran' });
  });

  test('the host is told to take it out of its queue: the signal it was given aborts', async () => {
    const queue = waiting('prompts');
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({ ports: queue.ports, options: { gate } });
    const pending = h.api.prompt.submit({ text: 'later' });
    await flush();
    expect(queue.queues[0]?.aborted).toBe(false);
    gate.interrupt();
    await pending;
    expect(queue.queues[0]?.aborted).toBe(true);
  });

  test('a prompt whose turn already started is not dropped by a later interruption', async () => {
    const queue = waiting('prompts');
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({ ports: queue.ports, options: { gate } });
    const pending = h.api.prompt.submit({ text: 'now' });
    await flush();
    queue.release[0]?.();
    expect(await pending).toEqual({});
    gate.interrupt();
    expect(queue.queues[0]?.aborted).toBe(false);
  });
});

spec('mods.apiGuide.Work your mod started before the interruption.$.command.run', () => {
  test('a command still in the queue when the user stops the turn rejects with "the command was removed from the queue before it ran"', async () => {
    const queue = waiting('commands');
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({ ports: queue.ports, options: { gate } });
    const pending = rejection(h.api.command.run({ command: 'tally' }));
    await flush();
    gate.interrupt();
    expect(await pending).toContain('the command was removed from the queue before it ran');
  });

  test('a command that finished before the interruption keeps its result', async () => {
    const queue = waiting('commands');
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({ ports: queue.ports, options: { gate } });
    const pending = h.api.command.run({ command: 'tally' });
    await flush();
    queue.release[0]?.();
    expect(await pending).toEqual({});
    gate.interrupt();
  });
});

spec('mods.apiGuide.Work your mod started before the interruption.$.tool.call', () => {
  const HELD =
    "Ended instead of moving to the background: plugins' input is held, by a Stop or by the host's limits.";

  /**
   * A host whose foreground Bash is already running when `call` returns its promise, and reaches its
   * timeout when the test says: it asks the kit whether input is held then, and ends the command
   * with `isError` and the line of the page when it is. The ending is the host's; the question is the kit's.
   */
  async function running() {
    let timeout: () => void = () => undefined;
    const reachesTimeout = new Promise<void>((resolve) => {
      timeout = resolve;
    });
    const base = fakePorts().ports;
    const ports: Partial<ModHostPorts> = {
      tools: {
        ...base.tools,
        call: async (_call, _signal, held) => {
          await reachesTimeout;
          if (held !== undefined && (await held())) {
            return { isError: true, output: `partial output\n${HELD_AT_TIMEOUT}` };
          }
          return { output: 'finished' };
        },
      },
    };
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({ ports, options: { gate } });
    const pending = h.api.tool.call({ tool: 'Bash', command: 'make test' });
    await flush();
    return { gate, pending, timeout };
  }

  test('a command already running when the user stops the turn, at its timeout before their next input, resolves with isError and the line of the page', async () => {
    const { gate, pending, timeout } = await running();
    gate.interrupt();
    timeout();
    expect(await pending).toEqual({ isError: true, output: `partial output\n${HELD}` });
  });

  test("a command that reaches its timeout after the user's next input is not ended", async () => {
    const { gate, pending, timeout } = await running();
    gate.interrupt();
    await gate.userInput();
    timeout();
    expect(await pending).toEqual({ output: 'finished' });
  });

  test('a command that reaches its timeout with no interruption is not ended', async () => {
    const { pending, timeout } = await running();
    timeout();
    expect(await pending).toEqual({ output: 'finished' });
  });

  test('a limit holds the input too: the run past --max-turns ends the command at its timeout', async () => {
    const world = numbers({ turns: 3, cost: 0 });
    const gate = createRunGate(world.port, { maxTurns: 3 });
    const base = fakePorts().ports;
    const asked: boolean[] = [];
    const ports: Partial<ModHostPorts> = {
      tools: {
        ...base.tools,
        call: async (_call, _signal, held) => {
          asked.push((await held?.()) ?? false);
          return {};
        },
      },
    };
    const h = await apiHarness({ ports, options: { gate } });
    await h.api.tool.call({ tool: 'Bash', command: 'make test' });
    expect(asked).toEqual([true]);
  });
});
