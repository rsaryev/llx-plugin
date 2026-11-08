import { z } from 'zod';
import type { ModelRun } from './types.ts';

/**
 * The answer of a `prompt` or `agent` hook (hooks.md, "Response schema"):
 * `{ "ok": true | false, "reason": "...", "impossible": true | false }`. `reason` is "required when
 * `ok` is `false`"; `impossible` is optional and "agent hooks ... ignore it".
 */

const verdict = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  impossible: z.boolean().optional(),
});

/** A reply wrapped in one Markdown code fence ("```json ... ```") is read as the JSON inside. */
const FENCE = /^```[A-Za-z]*\s*\n([\s\S]*?)\n?```$/;

/** The JSON of the reply, or `undefined` for text that is not JSON. */
function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const inner = FENCE.exec(trimmed)?.[1] ?? trimmed;
  try {
    return JSON.parse(inner);
  } catch {
    return undefined;
  }
}

/** What reading a reply gives: the verdict, or why the reply is not one. */
export type ParsedVerdict = { readonly verdict: ModelRun } | { readonly failure: string };

/**
 * Judgment (spec/judgments.md): a reply that is not exactly one JSON object of this schema (prose
 * around it, a missing `ok`, `ok: false` with no reason) is no verdict, so the hook ends as a
 * non-blocking error instead of allowing or blocking on a guess.
 */
export function parseVerdict(
  text: string,
  options: { readonly impossible: boolean },
): ParsedVerdict {
  const parsed = verdict.safeParse(parseJson(text));
  if (!parsed.success) {
    return { failure: 'The model did not answer with the JSON object {"ok": ..., "reason": ...}.' };
  }
  const { ok, reason, impossible } = parsed.data;
  if (!ok && (reason === undefined || reason.trim() === '')) {
    return { failure: 'The model answered "ok": false without the required "reason".' };
  }
  return {
    verdict: {
      kind: 'model',
      ok,
      ...(reason === undefined ? {} : { reason }),
      ...(options.impossible && impossible === true ? { impossible: true } : {}),
    },
  };
}

/**
 * What the model is told about its answer: the doc gives the schema and the port a model call is
 * only a prompt, so the instruction travels with it (judgment, spec/judgments.md).
 */
export const responseInstruction = (options: { readonly impossible: boolean }): string =>
  [
    'Respond with only a JSON object and nothing else: {"ok": true} to allow, or {"ok": false, "reason": "<why>"} to block; "reason" is required when "ok" is false.',
    ...(options.impossible
      ? [
          'When "ok" is false and you judge the condition can never be satisfied, also set "impossible": true.',
        ]
      : []),
  ].join(' ');
