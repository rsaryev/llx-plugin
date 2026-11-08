import type { HookEvent } from '../../protocol/official.ts';
import type { HookOutcome } from '../outcome.ts';

/**
 * What a blocked prompt leaves behind (hooks.md, "What a blocked prompt leaves behind"): "By
 * default the block message shown to the user ends with `Original prompt:` followed by the
 * submitted text". Printing `suppressOriginalPrompt: true` in `hookSpecificOutput` leaves the text
 * out, "whether the hook blocks with `decision: "block"` or by exiting 2". It changes only the
 * block message: the host still writes the submitted text wherever it keeps the transcript.
 *
 * Judgment (spec/judgments.md): the docs give no layout for the ending, so the label starts a line
 * of its own. A block no one is shown (`to` is not the user) has no message to end.
 */

/** The events whose block message quotes what was submitted. */
const QUOTES_PROMPT: ReadonlySet<HookEvent> = new Set<HookEvent>(['UserPromptSubmit']);

export const ORIGINAL_PROMPT = 'Original prompt:';

const promptOf = (facts: object): string | undefined => {
  const found = Object.entries(facts).find(([name]) => name === 'prompt')?.[1];
  return typeof found === 'string' ? found : undefined;
};

export function withOriginalPrompt<E extends HookEvent>(
  outcome: HookOutcome<E>,
  facts: object,
): HookOutcome<E> {
  const { block } = outcome;
  const prompt = promptOf(facts);
  if (block === undefined || prompt === undefined || !QUOTES_PROMPT.has(outcome.event)) {
    return outcome;
  }
  if (block.to !== 'user' || outcome.effects.suppressOriginalPrompt === true) return outcome;
  return {
    ...outcome,
    block: { ...block, message: `${block.message}\n${ORIGINAL_PROMPT} ${prompt}` },
  };
}
