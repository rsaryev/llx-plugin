import type { HookHandlerType } from '../../protocol/hook-config.ts';
import type { ModelFailedRun, ModelRun } from '../handlers/remote/types.ts';
import { isPromptEvent, okFalseEffect, type OkFalseEffect } from '../handlers/remote/ok-false.ts';
import { EXIT2_RULES } from './exit2.ts';
import { handlerLabel, hookError, hookName } from './notices.ts';
import { failureVerdict } from './on-failure.ts';
import type { Subject } from './subject.ts';
import type { HandlerVerdict } from './types.ts';

/**
 * A `prompt` or `agent` hook's verdict (hooks.md, "Response schema" and "Agent hook
 * configuration"). What `ok: false` does on each event is the table of `remote/ok-false.ts`; this
 * turns its answer into the verdict: the reason blocks the action, ends the turn, or goes to Claude.
 */

/** "Agent hooks and other events ignore `impossible`", and an agent has no `continueOnBlock`. */
const IS_AGENT: { readonly [T in HookHandlerType]: boolean } = {
  command: false,
  http: false,
  mcp_tool: false,
  prompt: false,
  agent: true,
};

const continueOnBlock = (subject: Subject): boolean | undefined => {
  const { handler } = subject.entry;
  return 'continueOnBlock' in handler ? handler.continueOnBlock : undefined;
};

/** What `ok: false` came to on an event that has a verdict for it. */
function failedVerdict(
  subject: Subject,
  effect: Extract<OkFalseEffect, { readonly reason: string }>,
): HandlerVerdict {
  const { entry, event } = subject;
  const { reason } = effect;
  const message = hookError(hookName(event, subject.toolName), handlerLabel(entry.handler), reason);
  const rule = EXIT2_RULES[event];
  // A teammate that stops is not an action held back: on `TeammateIdle` ending the turn is the
  // reverse of a block ("by default the teammate stops"; `continueOnBlock` "keeps it working").
  const stopsTeammate = effect.endsTurn && rule.effect === 'prevents-teammate-idle';
  const holds = rule.canBlock && !stopsTeammate;
  const toClaude = !effect.endsTurn && !rule.canBlock;
  return {
    handler: entry,
    issues: [],
    status: holds ? 'blocked' : 'non-blocking-error',
    succeeded: false,
    ...(holds ? { block: { via: 'decision' as const, reason, message } } : {}),
    ...(effect.endsTurn ? { stop: { reason } } : {}),
    ...(toClaude
      ? { feedback: { handlerId: entry.id, to: 'claude' as const, text: message } }
      : {}),
  };
}

export function interpretModel(subject: Subject, run: ModelRun): HandlerVerdict {
  const { entry, event } = subject;
  const common = { handler: entry, issues: [] as const };
  if (!isPromptEvent(event)) return { ...common, status: 'success', succeeded: run.ok };
  const onBlock = continueOnBlock(subject);
  const effect = okFalseEffect(event, run, {
    agent: IS_AGENT[entry.handler.type],
    ...(onBlock === undefined ? {} : { continueOnBlock: onBlock }),
    // Judgment (spec/judgments.md): the input does not say a teammate stopping fired `TaskCompleted`.
    teammateStopped: false,
  });
  return 'reason' in effect
    ? failedVerdict(subject, effect)
    : { ...common, status: 'success', succeeded: true };
}

/** The model did not answer, or answered something that is not the response schema. */
export const interpretModelFailed = (subject: Subject, run: ModelFailedRun): HandlerVerdict =>
  failureVerdict(subject, { cause: 'tool-error', text: run.message, detail: run.message });
