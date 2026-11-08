/** Fires one event through the real engine and output stage with a `prompt` or `agent` hook whose model answers from a script. */
import { createHookEngine, createHookRegistry } from '../../src/hooks/index.ts';
import type { EventFactsOf } from '../../src/hooks/index.ts';
import type { HookHandler } from '../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { FACTS, entry, session } from './hooks-select.ts';
import type { ModelReply } from './ports.ts';
import { fakeEnvironment, fakeModel, locations, scriptedRunner } from './ports.ts';

/** What a model hook's model answered: the response schema as JSON text. */
export const answer = (body: object): ModelReply => ({ text: JSON.stringify(body) });

export async function fireModelHook<E extends HookEvent>(
  event: E,
  handler: HookHandler,
  reply: ModelReply,
  options: {
    readonly facts?: EventFactsOf<E>;
    readonly taskCompletedBy?: 'task-update' | 'teammate-turn';
  } = {},
) {
  const models = fakeModel(reply);
  const engine = createHookEngine({
    commands: scriptedRunner(),
    locations: locations(),
    environment: fakeEnvironment(),
    models,
  });
  const outcome = await engine.dispatch(createHookRegistry([entry(event, { handler })]), {
    event,
    facts: options.facts ?? FACTS[event],
    session: session(),
    signal: new AbortController().signal,
    ...(options.taskCompletedBy === undefined ? {} : { taskCompletedBy: options.taskCompletedBy }),
  });
  return { outcome, models };
}

export const promptHook = (more: object = {}): HookHandler => ({
  type: 'prompt',
  prompt: 'Is everything done? $ARGUMENTS',
  ...more,
});

export const agentHook: HookHandler = {
  type: 'agent',
  prompt: 'Verify the tests pass. $ARGUMENTS',
};
