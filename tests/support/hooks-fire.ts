/** Fires one event through the real engine over fakes of the ports and of the output stage. */
import {
  createHookEngine,
  createHookRegistry,
  type HookObserver,
  type RegisteredHandler,
} from '../../src/hooks/index.ts';
import type { EventFactsOf } from '../../src/hooks/index.ts';
import { ifEvaluatorFor } from '../../src/hooks/select/if-guard.ts';
import type { HookHandler } from '../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { FACTS, session } from './hooks-select.ts';
import { fakeOutput } from './hooks-verdict.ts';
import type { HttpReply } from './http.ts';
import { fakeEnvironment, locations, recordingHttp, scriptedRunner } from './ports.ts';
import { matchContext } from './rule-context.ts';
import type { RunnerReply } from './runner.ts';

export const cmd = (more: object = {}): HookHandler => ({
  type: 'command',
  command: './guard.sh',
  ...more,
});

export async function fire<E extends HookEvent>(
  event: E,
  entries: readonly RegisteredHandler[],
  replies: readonly RunnerReply[],
  options: { observer?: HookObserver; facts?: EventFactsOf<E>; http?: HttpReply[] } = {},
) {
  const runner = scriptedRunner(...replies);
  const engine = createHookEngine(
    {
      commands: runner,
      locations: locations(),
      environment: fakeEnvironment(),
      ...(options.http === undefined ? {} : { http: recordingHttp(...options.http) }),
      ...(options.observer === undefined ? {} : { observer: options.observer }),
    },
    { output: fakeOutput, ifEvaluator: ifEvaluatorFor(matchContext) },
  );
  const facts: EventFactsOf<E> = options.facts ?? FACTS[event];
  const outcome = await engine.dispatch(createHookRegistry(entries), {
    event,
    facts,
    session: session(),
    signal: new AbortController().signal,
  });
  return { outcome, runner };
}
