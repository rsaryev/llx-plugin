import { createRunGate, type ModHostPorts, type RunGate } from '../../src/mods/api/index.ts';
import { fakePorts } from '../../src/testing/mods/index.ts';
import { apiHarness } from './mods-api.ts';

export const STOPPED = 'the session was stopped and nobody has sent input since';

/** The session's numbers: the turns so far and the spend, which a test moves. */
export function numbers(start = { turns: 0, cost: 0 }) {
  const state = { ...start };
  return {
    state,
    port: {
      turns: () => Promise.resolve(state.turns),
      usage: () => Promise.resolve({ cost: state.cost }),
    },
  };
}

/** The host side of a prompt and a command: what reached it, and the signals of the queue. */
export function recording() {
  const reached: { prompts: string[]; commands: string[]; agents: number; tools: string[] } = {
    prompts: [],
    commands: [],
    agents: 0,
    tools: [],
  };
  const queues: AbortSignal[] = [];
  const base = fakePorts().ports;
  const ports: Partial<ModHostPorts> = {
    prompts: {
      ...base.prompts,
      submit: (prompt, queue) => {
        reached.prompts.push(prompt.text);
        if (queue) queues.push(queue);
        return Promise.resolve({});
      },
    },
    commands: {
      builtIns: () => [],
      run: (command, queue) => {
        reached.commands.push(command.command);
        if (queue) queues.push(queue);
        return Promise.resolve({ text: 'ran' });
      },
    },
    agents: {
      list: () => Promise.resolve([]),
      spawn: () => ((reached.agents += 1), Promise.resolve({ agentId: 'a-1' })),
    },
    tools: {
      call: (call) => (reached.tools.push(String(call.tool)), Promise.resolve({ text: 'done' })),
      check: () => Promise.resolve({}),
    },
  };
  return { reached, queues, ports };
}

export async function interrupted() {
  const { reached, queues, ports } = recording();
  const gate: RunGate = createRunGate(numbers().port);
  const h = await apiHarness({ ports, options: { gate } });
  return { h, gate, reached, queues };
}
