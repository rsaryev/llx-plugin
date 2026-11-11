/**
 * What Claude reads on the next turn for a system prompt section or a tool description whose hooks
 * ran again after `$.ui.invalidate('prompt.section')` or `$.ui.invalidate('tool.describe')`
 * (reference.md, "Send a changed system prompt section or tool description with
 * `breakPromptCache`"). Without the field, Claude keeps reading the text saved with the
 * conversation for a section or a tool loaded upfront until a new conversation or a compaction.
 * With it, the changed text reaches Claude on the next turn and the prompt cache starts over.
 */
export interface ResendFacts {
  /**
   * The text saved with the conversation (`null` for a section the hooks omitted); `undefined`
   * when none is saved: a new conversation, or the turn after a compaction.
   */
  readonly saved?: string | null;
  /** What the hooks answered this time: `text` of `prompt.section`, `description` of `tool.describe`. */
  readonly answered: string | null;
  /** The answer's `breakPromptCache`. */
  readonly breakPromptCache?: boolean;
  /**
   * A tool behind tool search: the rule of the saved text is for a tool loaded upfront, so a
   * deferred tool's changed description is read without the field (judgment, spec/judgments.md).
   */
  readonly isDeferred?: boolean;
}

export interface NextTurnText {
  /** The text Claude reads, or `null` when the section is omitted. */
  readonly text: string | null;
  /** The prompt cache starts over: that turn is slower and more expensive. */
  readonly breaksCache: boolean;
}

export function nextTurnText(facts: ResendFacts): NextTurnText {
  const { saved, answered } = facts;
  if (saved === undefined || saved === answered) return { text: answered, breaksCache: false };
  if (facts.breakPromptCache === true) return { text: answered, breaksCache: true };
  return { text: facts.isDeferred === true ? answered : saved, breaksCache: false };
}
