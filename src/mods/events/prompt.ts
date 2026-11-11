import { z } from 'zod';
import type { MOD_EVENT_GROUPS } from '../../protocol/mods-events.ts';
import { clampReasonAt } from './reasons.ts';
import { answer, fields, flag, noFields, passThrough, text, type EventSpec } from './spec.ts';

/**
 * The prompt events (reference.md, "Prompts and what Claude reads"; events.md, "Rewrite or add to
 * a prompt"). `skill.prompt` and `attribution.text` are in their own files.
 */
type PromptEvent = Exclude<
  (typeof MOD_EVENT_GROUPS.prompts)[number],
  'skill.prompt' | 'attribution.text'
>;

/** A row of `prompt.autocomplete`: choosing it writes its `text` over the word. Judgment: only `text` is required. */
export const autocompleteRow = z.looseObject({
  text,
  label: text.optional(),
  description: text.optional(),
});
export type AutocompleteRow = z.infer<typeof autocompleteRow>;

const section = z.looseObject({ id: text, text, scope: text });

/** A prompt a hook drops after its `next` call let the prompt through: the turn runs and the hook fails. */
const dropAfterNext = (result: unknown): string | undefined =>
  typeof result === 'object' && result !== null && 'drop' in result && result.drop !== undefined
    ? 'a drop after its next() was answered cannot stop a prompt that already went through'
    : undefined;

export const PROMPT_SPECS: { readonly [N in PromptEvent]: EventSpec } = {
  // `e.text` is what was typed; `e.context` is the text only Claude reads, after the prompt.
  'prompt.submit': {
    input: fields({ text, context: z.array(text).optional() }),
    result: answer({
      drop: text.optional(),
      text: text.optional(),
      context: z.array(text).optional(),
    }),
    answeredProblem: dropAfterNext,
    settle: (result) => clampReasonAt(result, 'drop'),
  },
  // The answers PromptFillResult and PromptSuggestResult declare (claude-code/index.d.ts:9435, :10075).
  'prompt.fill': {
    input: fields({ text }),
    result: answer({ isFilled: z.boolean().optional(), refusal: text.optional() }),
  },
  'prompt.suggest': {
    input: fields({ text }),
    result: answer({ isShown: z.boolean().optional() }),
  },
  // The docs name no field of `prompt.edit` and no answer but `next(e)`.
  'prompt.edit': { input: noFields, result: passThrough },
  // `e.token` is the word that ends at the cursor.
  'prompt.autocomplete': {
    input: fields({ token: text }),
    result: answer({ suggestions: z.array(autocompleteRow) }),
  },
  // The sections in the order they are sent. Judgment: `scope` is any string, the docs give no list.
  'prompt.compose': { input: noFields, result: answer({ sections: z.array(section) }) },
  // `e.name` is the section's `id` in `prompt.compose`; `{ text: null }` omits the section.
  // `breakPromptCache: true` sends a changed section on the next turn (reference.md, "Send a
  // changed system prompt section or tool description with `breakPromptCache`").
  'prompt.section': {
    input: fields({ name: text }),
    result: answer({ text: text.nullable(), breakPromptCache: flag.optional() }),
  },
  // Judgment: a block is any value, the docs do not say what one holds.
  'prompt.context': { input: noFields, result: answer({ blocks: z.array(z.unknown()) }) },
  // `e.type` names the kind of message and `e.detail` holds the facts for the kinds the types declare.
  'prompt.attachment': {
    input: fields({ type: text, detail: z.unknown().optional() }),
    result: answer({ text: text.nullable() }),
  },
  // `e.path` is the file an @-mention reads; a hook passes a changed `path` or answers `{ deny }`, or
  // what PromptMentionResult declares (claude-code/index.d.ts:9592): how it was attached and the context.
  'prompt.mention': {
    input: fields({ path: text }),
    result: answer({
      deny: text.optional(),
      type: text.nullable().optional(),
      context: z.array(text).optional(),
    }),
  },
};

/**
 * `prompt.change` (claude-code/index.d.ts:4416, `PromptChangeInput`): the box after a change no
 * `prompt.edit` carried, `origin` who made it (`history`, `clear`, `undo`, `plugin`, `app`,
 * `engine`; a kind not known reads as `engine`). "Observe only": every field is the engine's and
 * `next(e)` passes them on as received, so core reads the event as fired; the answer is `{ text }`,
 * "echoed by core; a hook's own value changes nothing" (:8942).
 */
export const PROMPT_CHANGE_SPEC: EventSpec = {
  input: fields({
    text,
    cursor: z.number().int().nonnegative(),
    origin: z.looseObject({ kind: text }),
  }),
  result: answer({ text }),
  coreInput: (original) => original,
};
