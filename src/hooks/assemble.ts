import type { PluginIssue } from '../format/issues.ts';
import type { HookEvent } from '../protocol/official.ts';
import { consumedByRun } from './select/once.ts';
import type { HookOutcome } from './outcome.ts';
import type { BlockInfo } from './verdict/types.ts';
import type { HandlerVerdict, MergedOutput } from './verdict/types.ts';

/**
 * What an event came to once every handler's run is read and the outputs merged (docs/API.md,
 * "Hooks"). The block is the first one in handler order; a JSON decision of the same hook speaks
 * for it ("If your hook also printed JSON that makes a blocking decision, Claude Code uses that
 * decision's reason instead").
 */

type Blocked = HookOutcome<HookEvent>['block'];

/** The verdict-level block of the first hook that has one, its reason replaced by its own JSON decision's. */
function exitBlock(verdicts: readonly HandlerVerdict[], merged: MergedOutput): Blocked {
  const found = verdicts.find((verdict) => verdict.block !== undefined);
  if (found?.block === undefined) return undefined;
  const decision = merged.block?.by === found.handler.id ? merged.block.reason : undefined;
  const block: BlockInfo =
    decision === undefined ? found.block : { ...found.block, reason: decision, message: decision };
  return { ...block, by: found.handler.id };
}

function decisionBlock(merged: MergedOutput): Blocked {
  if (merged.block === undefined) return undefined;
  const reason = merged.block.reason ?? '';
  return { via: merged.block.via, reason, message: reason, by: merged.block.by };
}

const present = <T>(items: readonly (T | undefined)[]): T[] =>
  items.flatMap((item) => (item === undefined ? [] : [item]));

export function assemble<E extends HookEvent>(
  event: E,
  verdicts: readonly HandlerVerdict[],
  merged: MergedOutput,
  issues: readonly PluginIssue[],
): HookOutcome<E> {
  const block = exitBlock(verdicts, merged) ?? decisionBlock(merged);
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
