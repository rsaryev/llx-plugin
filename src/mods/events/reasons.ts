import { MOD_LIMITS } from '../../protocol/mods-limits.ts';
import { isRecord } from './spec.ts';

/**
 * A hook's `drop` reason or `config.set` `deny` reason is cut at 4,096 characters, the end of a
 * longer one, and the drop or deny still applies (reference.md, "Limits"). A character is a code
 * point, so the cut never splits a surrogate pair (judgment: the docs say "characters").
 */
export function clampReason(reason: string): string {
  if (reason.length <= MOD_LIMITS.reasonChars) return reason;
  const points = Array.from(reason);
  return points.length <= MOD_LIMITS.reasonChars
    ? reason
    : points.slice(0, MOD_LIMITS.reasonChars).join('');
}

/** `result` with the string under `key` cut by `clampReason`; any other result as it is. */
export function clampReasonAt(result: unknown, key: string): unknown {
  if (!isRecord(result)) return result;
  const reason = result[key];
  return typeof reason === 'string' ? { ...result, [key]: clampReason(reason) } : result;
}

/** How a tool call ended, for the text Claude reads when a hook withholds its result. */
export type ToolCallEnd = 'succeeded' | 'failed' | 'not-run';

/**
 * What a `{ deny: reason }` gives Claude (events.md, "Guard or change a tool call"): "Claude reads
 * your reason in place of what `next` returned", and "when the tool ran and succeeded, the reason
 * follows a note such as `Bash ran, and a plugin withheld its result:`". A call that was refused
 * before it ran, or that failed, gives the reason alone (judgment: the docs name the note for a
 * success only).
 */
const WITHHELD: { readonly [E in ToolCallEnd]: (tool: string, reason: string) => string } = {
  succeeded: (tool, reason) => `${tool} ran, and a plugin withheld its result: ${reason}`,
  failed: (_tool, reason) => reason,
  'not-run': (_tool, reason) => reason,
};

export function withheldResultText(call: {
  readonly tool: string;
  readonly reason: string;
  readonly ran: ToolCallEnd;
}): string {
  return WITHHELD[call.ran](call.tool, call.reason);
}

/**
 * The line the user sees when a `prompt.submit` hook drops their prompt (events.md, "Rewrite or add to
 * a prompt"): "they see `Prompt dropped by a hook:` followed by your reason". The text goes back into
 * the prompt input, which is the host's.
 */
export const promptDroppedText = (reason: string): string => `Prompt dropped by a hook: ${reason}`;
