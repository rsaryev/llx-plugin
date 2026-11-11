import type { MOD_EVENT_GROUPS } from '../../protocol/mods-events.ts';
import { answer, count, fields, flag, passThrough, text, type EventSpec } from './spec.ts';
import { z } from 'zod';

/** The turn events (reference.md, "Turns"; events.md, "Follow a turn"). */
type TurnEvent = (typeof MOD_EVENT_GROUPS.turns)[number];

/** The token counts the Claude API reports for a request, plus the `model` that answered. */
const usage = z.looseObject({
  input_tokens: count.optional(),
  output_tokens: count.optional(),
  cache_read_input_tokens: count.optional(),
  cache_creation_input_tokens: count.optional(),
  model: text.optional(),
});

export const TURN_SPECS: { readonly [N in TurnEvent]: EventSpec } = {
  // `e.turnId` identifies the turn in the other two events (events.md, "Follow a turn").
  'turn.start': { input: fields({ turnId: text }), result: passThrough },
  // `e.agentId` is set for a subagent's request. A hook passes `{ ...e, model }` or `{ ...e, effort }`
  // to `next`, or answers without calling the model. Judgment: `model` and `effort` are strings,
  // the docs name an alias such as `haiku` and give no list for `effort`.
  'turn.step': {
    input: fields({
      turnId: text.optional(),
      agentId: text.optional(),
      model: text.optional(),
      effort: text.optional(),
    }),
    result: answer({
      usage: usage.optional(),
      serverToolUses: z.array(z.unknown()).optional(),
    }),
  },
  // `e.answer` is Claude's final text, `e.durationMs` how long it took, `e.usage` the turn's token
  // totals and `e.isAborted` is `true` for an interrupted turn. A hook answers `{ text }` to show a
  // line under the answer.
  'turn.complete': {
    input: fields({
      turnId: text,
      isAborted: flag.optional(),
      answer: text.optional(),
      durationMs: count.optional(),
      usage: z.unknown().optional(),
      agentId: text.optional(),
    }),
    result: answer({ text: text.optional() }),
  },
};
