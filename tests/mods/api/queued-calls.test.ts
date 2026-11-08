/**
 * plugins/mods/api.md § Work your mod started before the interruption ("A prompt from
 * `$.prompt.submit` still in the queue: Dropped. The call resolves with `{ drop: 'the prompt was
 * removed from the queue before it ran' }`. A command from `$.command.run` still in the queue:
 * Dropped. The call rejects with an error whose message includes `the command was removed from the
 * queue before it ran`").
 */
import { expect, test } from 'bun:test';
import { createRunGate, type ModHostPorts } from '../../../src/mods/api/index.ts';
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
