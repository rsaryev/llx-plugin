/**
 * plugins/mods/api.md § Work your mod started before the interruption: "A subagent your mod spawned
 * and later resumed with `$.session.send` that finishes before the user's next input: Its finish notice
 * waits, and reaches the conversation after that input"; "An event from a monitor your mod started: The
 * monitor keeps running. An event the monitor raises before the user's next input is dropped, except
 * the notice that the monitor ended, which arrives after that input." The host raises each notice
 * through `RunGate.notice`, and the gate holds or drops it while the session is stopped.
 */
import { expect, test } from 'bun:test';
import { createRunGate, type ModHostPorts } from '../../../src/mods/api/index.ts';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { numbers } from '../../support/mods-refusal.ts';
import { spec } from '../../support/spec.ts';

function conversation() {
  const reached: string[] = [];
  const raise = (
    gate: ReturnType<typeof createRunGate>,
    kind: 'agent.finished' | 'monitor.event' | 'monitor.ended',
    text: string,
  ) => gate.notice(kind, () => void reached.push(text));
  return { reached, raise };
}

spec('mods.apiGuide.Work your mod started before the interruption.$.session.send', () => {
  /** A mod that resumed the subagent `reviewer` with `$.session.send`, in a session whose host takes the send. */
  async function resumed() {
    const base = fakePorts().ports;
    const ports: Partial<ModHostPorts> = {
      session: { ...base.session, send: () => Promise.resolve({ isDelivered: true }) },
    };
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({ ports, options: { gate } });
    const sent = await h.api.session.send({ to: { agentId: 'reviewer' }, text: 'look again' });
    expect(sent).toEqual({ isDelivered: true });
    return { gate, ...conversation() };
  }

  test('a finish notice of the subagent that comes before the next input waits, and reaches the conversation after that input', async () => {
    const { gate, reached, raise } = await resumed();
    gate.interrupt();
    expect(raise(gate, 'agent.finished', 'reviewer finished')).toBe('held');
    expect(reached).toEqual([]);
    await gate.userInput();
    expect(reached).toEqual(['reviewer finished']);
  });

  test('with no interruption the notice reaches the conversation at once', async () => {
    const { gate, reached, raise } = await resumed();
    expect(raise(gate, 'agent.finished', 'reviewer finished')).toBe('delivered');
    expect(reached).toEqual(['reviewer finished']);
  });

  test('every notice that waited arrives, in the order they came, and only once', async () => {
    const { gate, reached, raise } = await resumed();
    gate.interrupt();
    raise(gate, 'agent.finished', 'first');
    raise(gate, 'agent.finished', 'second');
    await gate.userInput();
    await gate.userInput();
    expect(reached).toEqual(['first', 'second']);
  });

  test('a notice held before one interruption is not delivered by the end of another: it waits for the input', async () => {
    const { gate, reached, raise } = await resumed();
    gate.interrupt();
    raise(gate, 'agent.finished', 'first');
    gate.interrupt();
    expect(reached).toEqual([]);
    await gate.userInput();
    expect(reached).toEqual(['first']);
  });
});

spec(
  'mods.apiGuide.Work your mod started before the interruption.An event from a monitor your mod started',
  () => {
    test('an event the monitor raises before the next input is dropped, and the monitor keeps raising them after it', async () => {
      const gate = createRunGate(numbers().port);
      const { reached, raise } = conversation();
      expect(raise(gate, 'monitor.event', 'before the stop')).toBe('delivered');
      gate.interrupt();
      expect(raise(gate, 'monitor.event', 'during the stop')).toBe('dropped');
      await gate.userInput();
      expect(reached).toEqual(['before the stop']);
      expect(raise(gate, 'monitor.event', 'after the input')).toBe('delivered');
      expect(reached).toEqual(['before the stop', 'after the input']);
    });

    test('the notice that the monitor ended is the exception: it arrives after that input', async () => {
      const gate = createRunGate(numbers().port);
      const { reached, raise } = conversation();
      gate.interrupt();
      raise(gate, 'monitor.event', 'lost');
      expect(raise(gate, 'monitor.ended', 'the monitor ended')).toBe('held');
      expect(reached).toEqual([]);
      await gate.userInput();
      expect(reached).toEqual(['the monitor ended']);
    });
  },
);
