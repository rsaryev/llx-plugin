import { withoutPort } from './failure-run.ts';
import type { HandlerEntry, HandlerResult, RunContext } from '../context.ts';
import { runModelHook } from './model-run.ts';

/**
 * A `prompt` hook (hooks.md, "Prompt-based hooks"): the hook input and the prompt go to a model
 * and "the LLM responds with structured JSON containing a decision". What `ok: false` does on an
 * event is `ok-false.ts`.
 */
export function runPrompt(
  entry: HandlerEntry<'prompt'>,
  context: RunContext,
): Promise<HandlerResult> {
  const models = context.ports.models;
  if (models === undefined) return Promise.resolve(withoutPort(entry, 'prompt', 'ModelRunner'));
  return runModelHook(entry, context, {
    impossible: true,
    call: (request) => models.evaluate(request),
  });
}
