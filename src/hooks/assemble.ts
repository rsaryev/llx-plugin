import type { PluginIssue } from '../format/issues.ts';
import type { HookEvent } from '../protocol/official.ts';
import { consumedByRun } from './select/once.ts';
import type { HookOutcome } from './outcome.ts';
import { routedBlock } from './verdict/route.ts';
import type { HandlerVerdict, MergedBlock, MergedOutput } from './verdict/types.ts';

/**
 * What an event came to once every handler's run is read and the outputs merged (docs/API.md,
 * "Hooks"). A block of an exit code (exit 2, a failure) wins over a block of a JSON decision, in
 * whichever handler it sits: an exit-2 block's "fields ... can't override the block". Among exit
 * blocks the first in handler order wins; a JSON decision of that same hook speaks for it ("If your
 * hook also printed JSON that makes a blocking decision, Claude Code uses that decision's reason
 * instead"). Judgment: spec/judgments.md.
 */

type Blocked = HookOutcome<HookEvent>['block'];

/** Only a blocking decision's reason replaces the stderr; the `reason` of `continue: false` is a stop reason. */
const REPLACES_REASON: { readonly [V in MergedBlock['via']]: boolean } = {
  decision: true,
  'continue-false': false,
};

/** The reason a merged block of the same hook gives in place of the stderr, if the docs let it. */
function replacement(merged: MergedOutput, handlerId: string): string | undefined {
  const { block } = merged;
  return block !== undefined && block.by === handlerId && REPLACES_REASON[block.via]
    ? block.reason
    : undefined;
}

/** The verdict-level block of the first hook that has one, its reason replaced by its own JSON decision's. */
function exitBlock(
  event: HookEvent,
  verdicts: readonly HandlerVerdict[],
  merged: MergedOutput,
): Blocked {
  const found = verdicts.find((verdict) => verdict.block !== undefined);
  if (found?.block === undefined) return undefined;
  const decision = replacement(merged, found.handler.id);
  const block =
    decision === undefined || found.block.to === 'none'
      ? found.block
      : routedBlock(
          event,
          found.block.via,
          { reason: decision, message: decision },
          found.block.condition,
        );
  return { ...block, by: found.handler.id };
}

function decisionBlock(event: HookEvent, merged: MergedOutput): Blocked {
  if (merged.block === undefined) return undefined;
  const reason = merged.block.reason ?? '';
  return {
    ...routedBlock(event, merged.block.via, { reason, message: reason }),
    by: merged.block.by,
  };
}

const present = <T>(items: readonly (T | undefined)[]): T[] =>
  items.flatMap((item) => (item === undefined ? [] : [item]));

export function assemble<E extends HookEvent>(
  event: E,
  verdicts: readonly HandlerVerdict[],
  merged: MergedOutput,
  issues: readonly PluginIssue[],
): HookOutcome<E> {
  const block = exitBlock(event, verdicts, merged) ?? decisionBlock(event, merged);
  const stop = verdicts.find((verdict) => verdict.stop !== undefined)?.stop;
  const stopReason = merged.stopReason ?? stop?.reason;
  return {
    event,
    proceed: block === undefined,
    ...(block === undefined ? {} : { block }),
    continue: merged.continue && stop === undefined,
    ...(stopReason === undefined ? {} : { stopReason }),
    systemMessages: merged.systemMessages,
    additionalContext: merged.additionalContext,
    effects: merged.effects,
    terminalSequences: merged.terminalSequences,
    notices: present(verdicts.map((verdict) => verdict.notice)),
    feedback: present(verdicts.map((verdict) => verdict.feedback)),
    stdout: present(verdicts.map((verdict) => verdict.stdout)),
    runs: verdicts.map((verdict) => ({
      handlerId: verdict.handler.id,
      status: verdict.status,
      ...(verdict.block === undefined ? {} : { via: verdict.block.via }),
    })),
    consumedOnce: verdicts
      .filter((verdict) => consumedByRun(verdict.handler, verdict.succeeded))
      .map((verdict) => verdict.handler.id),
    background: present(verdicts.map((verdict) => verdict.delivery)),
    issues: [...issues, ...verdicts.flatMap((verdict) => verdict.issues)],
  };
}

/** The outcome of an event no handler ran for: nothing is held back. */
export const idleOutcome = <E extends HookEvent>(
  event: E,
  issues: readonly PluginIssue[],
): HookOutcome<E> => ({
  event,
  proceed: true,
  continue: true,
  systemMessages: [],
  additionalContext: [],
  effects: {},
  terminalSequences: [],
  notices: [],
  feedback: [],
  stdout: [],
  runs: [],
  consumedOnce: [],
  background: [],
  issues,
});
