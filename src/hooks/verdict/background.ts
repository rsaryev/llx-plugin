import type { BackgroundResult, ForegroundRun } from '../handlers/context.ts';
import { isRecord, readAsyncResponse } from './stdout-kind.ts';
import type { BackgroundDelivery, BackgroundOutcome } from './types.ts';

/**
 * What a background hook hands over once its process ends (hooks.md, "How async hooks execute"):
 * "Claude Code delivers the `additionalContext` and `systemMessage` fields from the hook's JSON
 * response to Claude on the next conversation turn". The response is validated and "any field whose
 * value has the wrong type, such as a `systemMessage` that isn't a string" is dropped. Nothing else
 * of the response matters: "response fields like `decision`, `permissionDecision`, and `continue`
 * have no effect, because the action they would have controlled has already completed". An
 * `asyncRewake` hook that exited with code 2 "wakes Claude" with its stderr or stdout.
 */

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const OUTCOMES: { readonly [K in ForegroundRun['kind']]: BackgroundOutcome } = {
  exited: 'completed',
  'timed-out': 'timed-out',
  'not-started': 'failed',
  cancelled: 'cancelled',
};

/** Process metadata stays apart from the response fields a hook printed. */
const completionOf = (run: ForegroundRun) => ({
  outcome: OUTCOMES[run.kind],
  ...('exitCode' in run ? { exitCode: run.exitCode } : {}),
});

export function deliveryOf(handlerId: string, result: BackgroundResult): BackgroundDelivery {
  const response = 'stdout' in result.run ? readAsyncResponse(result.run.stdout) : undefined;
  const specific =
    response !== undefined && 'hookSpecificOutput' in response
      ? response.hookSpecificOutput
      : undefined;
  const additionalContext = isRecord(specific) ? textOf(specific.additionalContext) : undefined;
  const systemMessage =
    response !== undefined && 'systemMessage' in response
      ? textOf(response.systemMessage)
      : undefined;
  return {
    handlerId,
    ...completionOf(result.run),
    ...(additionalContext === undefined ? {} : { additionalContext }),
    ...(systemMessage === undefined ? {} : { systemMessage }),
    ...(result.wake === undefined ? {} : { wake: result.wake }),
  };
}
