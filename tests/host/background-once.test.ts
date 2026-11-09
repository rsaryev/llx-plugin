/**
 * hooks.md, "Common fields": a skill's once hook is consumed only after a successful run.
 * "Run hooks in the background": async completion outlives the dispatch. Registration replacement
 * identity is a host judgment, tested outside spec (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { createPluginHost } from '../../src/host/index.ts';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import { SESSION, signal } from '../support/host.ts';
import { pendingRunner } from '../support/hooks-run.ts';
import { fakeEnvironment, locations } from '../support/ports.ts';

const hooks: HooksSettings = {
  PostToolUse: [{ hooks: [{ type: 'command', command: './check.sh', async: true, once: true }] }],
};
const facts = { tool_name: 'Bash', tool_use_id: 't', tool_input: {}, tool_response: {} };
const skill = { kind: 'skill', label: '[skill]' } as const;

function opened() {
  const runner = pendingRunner();
  const host = createPluginHost({
    plugins: [],
    ports: { commands: runner, environment: fakeEnvironment(), locations: locations() },
  });
  const session = host.openSession(SESSION);
  session.addHooks('skill', hooks, skill);
  return { session, runner };
}

test.each([0, 1, 2])('async once is consumed only for successful exit (%s)', async (exitCode) => {
  const { session, runner } = opened();
  const first = await session.dispatch('PostToolUse', facts, { signal: signal() });
  runner.finish(0, { exitCode });
  await Promise.all(first.background);
  const second = await session.dispatch('PostToolUse', facts, { signal: signal() });
  expect(runner.calls).toHaveLength(exitCode === 0 ? 1 : 2);
  runner.finish(1);
  await Promise.all(second.background);
});

test('late completion does not consume a replacement registration of the same prefix', async () => {
  const { session, runner } = opened();
  const first = await session.dispatch('PostToolUse', facts, { signal: signal() });
  session.addHooks('skill', hooks, skill);
  runner.finish(0);
  await Promise.all(first.background);
  const second = await session.dispatch('PostToolUse', facts, { signal: signal() });
  expect(runner.calls).toHaveLength(2);
  runner.finish(1);
  await Promise.all(second.background);
});
