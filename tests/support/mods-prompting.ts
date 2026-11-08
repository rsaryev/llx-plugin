import type { ModHostPorts } from '../../src/mods/api/index.ts';
import { fakePorts } from '../../src/testing/mods/index.ts';

/** A prompt port that records what reaches it and, while `holding`, does not answer: the session is busy. */
export function prompting() {
  const submitted: { text: string; from?: string; asUser?: true }[] = [];
  const state = { holding: false, turns: 0 };
  const release: (() => void)[] = [];
  const base = fakePorts().ports;
  const ports: Partial<ModHostPorts> = {
    session: {
      ...base.session,
      turns: () => Promise.resolve(state.turns),
      usage: () => Promise.resolve({ cost: 0 }),
    },
    prompts: {
      ...base.prompts,
      submit: (prompt) => {
        submitted.push(prompt);
        if (!state.holding) return Promise.resolve({});
        return new Promise((resolve) => release.push(() => resolve({})));
      },
    },
  };
  return { submitted, state, release, ports };
}
