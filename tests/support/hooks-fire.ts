/** Fires one event through the real engine over fakes of the ports and of the output stage. */
import {
  createHookEngine,
  createHookRegistry,
  type HookObserver,
  type OutputStage,
  type RegisteredHandler,
} from '../../src/hooks/index.ts';
import type { EventFactsOf } from '../../src/hooks/index.ts';
import { ifEvaluatorFor } from '../../src/hooks/select/if-guard.ts';
import type { HookHandler } from '../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { FACTS, session } from './hooks-select.ts';
import { fakeOutput } from './hooks-verdict.ts';
import type { HttpReply } from './ports.ts';
import { fakeEnvironment, locations, recordingHttp, scriptedRunner } from './ports.ts';
import { matchContext } from './rule-context.ts';
import type { RunnerReply } from './ports.ts';

export const cmd = (more: object = {}): HookHandler => ({
  type: 'command',
  command: './guard.sh',
  ...more,
});

interface FireOptions {
  observer?: HookObserver;
  http?: HttpReply[];
  /** The output stage; the stand-in `fakeOutput` when absent. */
  output?: OutputStage;
}

async function fireWith(
  event: HookEvent,
  entries: readonly RegisteredHandler[],
  replies: readonly RunnerReply[],
  options: FireOptions & { facts?: object },
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
    { output: options.output ?? fakeOutput, ifEvaluator: ifEvaluatorFor(matchContext) },
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the one place a test hands the engine facts typed only as an object, such as an example read from the docs; the engine validates them
  const facts = (options.facts ?? FACTS[event]) as EventFactsOf<typeof event>;
  const outcome = await engine.dispatch(createHookRegistry(entries), {
    event,
    facts,
    session: session(),
    signal: new AbortController().signal,
  });
  return { outcome, runner };
}

/** `event` fired with the facts of the event's type, or with any object (an example, a bad value). */
export function fire<E extends HookEvent>(
  event: E,
  entries: readonly RegisteredHandler[],
  replies: readonly RunnerReply[],
  options?: FireOptions & { facts?: EventFactsOf<E> },
): ReturnType<typeof fireWith>;
export function fire(
  event: HookEvent,
  entries: readonly RegisteredHandler[],
  replies: readonly RunnerReply[],
  options?: FireOptions & { facts?: object },
): ReturnType<typeof fireWith>;
export function fire(
  event: HookEvent,
  entries: readonly RegisteredHandler[],
  replies: readonly RunnerReply[],
  options: FireOptions & { facts?: object } = {},
): ReturnType<typeof fireWith> {
  return fireWith(event, entries, replies, options);
}
