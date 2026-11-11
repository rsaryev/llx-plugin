/**
 * What one dispatch survives: an abort while prompt or agent hooks wait for a slot (hooks.md, "Hook
 * handler fields": "12 of those run at once and the rest start as running ones finish"; an abort
 * cancels "the hooks at once"), and a run port that throws. Judgments (spec/judgments.md), outside
 * `spec(...)`.
 */
import { expect, test } from 'bun:test';
import { createHookEngine, createHookRegistry } from '../../src/hooks/index.ts';
import type { ModelAnswer, ModelRequest, ModelRunner } from '../../src/ports/index.ts';
import { FACTS, session } from '../support/hooks-select.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { registerHooks } from '../../src/hooks/register.ts';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('a prompt hook still waiting for a slot when the dispatch is aborted does not start', async () => {
  const requests: ModelRequest[] = [];
  const releases: ((answer: ModelAnswer) => void)[] = [];
  const models: ModelRunner = {
    evaluate: (request) =>
      new Promise((resolve) => {
        requests.push(request);
        releases.push(resolve);
      }),
    runAgent: () => Promise.reject(new Error('no agent')),
  };
  const hooks = Array.from({ length: 13 }, () => ({ type: 'prompt', prompt: 'p' }) as const);
  const entries = registerHooks(
    { Stop: [{ hooks }] },
    {
      idPrefix: 's',
      source: { kind: 'session', label: '[run]' },
    },
  );
  const engine = createHookEngine({
    commands: scriptedRunner(),
    locations: locations(),
    environment: fakeEnvironment(),
    models,
  });
  const controller = new AbortController();
  const done = engine.dispatch(createHookRegistry(entries), {
    event: 'Stop',
    facts: FACTS.Stop,
    session: session(),
    signal: controller.signal,
  });
  await tick();
  expect(requests).toHaveLength(12);
  controller.abort();
  for (const release of releases) release({ text: '{"ok":true}' });
  const outcome = await done;
  expect(requests).toHaveLength(12);
  expect(outcome.runs.at(-1)?.status).toBe('cancelled');
});
