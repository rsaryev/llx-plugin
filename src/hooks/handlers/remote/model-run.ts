import type { ModelAnswer, ModelRequest, PortFailure } from '../../../ports/index.ts';
import type { HandlerEntry, HandlerResult, RunContext } from '../context.ts';
import { handlerTimeoutMs } from '../timeouts.ts';
import { failureRun } from './failure-run.ts';
import { composePrompt } from './prompt-text.ts';
import { parseVerdict, responseInstruction } from './prompt-response.ts';

/**
 * What `prompt` and `agent` hooks share: the prompt with the hook input, the request the model
 * port gets, and the verdict read from its answer. They differ in the port call, the tools and
 * whether `impossible` counts, which the caller gives.
 */

export interface ModelCall {
  /** Reads `impossible` ("Agent hooks and other events ignore it"). */
  readonly impossible: boolean;
  readonly call: (request: ModelRequest) => Promise<ModelAnswer | PortFailure>;
}

export async function runModelHook(
  entry: HandlerEntry<'prompt'> | HandlerEntry<'agent'>,
  context: RunContext,
  { impossible, call }: ModelCall,
): Promise<HandlerResult> {
  const { prompt, model } = entry.handler;
  const timeoutMs = handlerTimeoutMs(entry, context.timeouts);
  const answer = await call({
    prompt: `${composePrompt(prompt, context.input)}\n\n${responseInstruction({ impossible })}`,
    ...(model === undefined ? {} : { model }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    signal: context.signal,
  });
  if ('failure' in answer) {
    return {
      run: failureRun(answer, (message) => ({ kind: 'model-failed', message })),
      issues: [],
    };
  }
  const parsed = parseVerdict(answer.text, { impossible });
  return {
    run: 'verdict' in parsed ? parsed.verdict : { kind: 'model-failed', message: parsed.failure },
    issues: [],
  };
}
