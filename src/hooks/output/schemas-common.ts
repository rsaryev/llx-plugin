import { z } from 'zod';
import type { SyncHookJSONOutput } from '../../protocol/official.ts';
import { optional } from '../input/facts-shared.ts';

/**
 * The fields every event's JSON output has (hooks.md, "JSON output"): `continue`, `stopReason`,
 * `suppressOutput`, `systemMessage` and `terminalSequence`, plus the
 * top-level `decision` and `reason`. Checked against the official `SyncHookJSONOutput`.
 *
 * Judgment (spec/judgments.md): a key the schema does not name is dropped, not a failure: the docs
 * call only a value that cannot be parsed or has the wrong type a validation failure.
 */

/** "The deprecated values `approve` and `block`"; "The only value for `decision` is `block`". */
const decisionSchema = z.enum(['approve', 'block']);

export const commonFields = {
  continue: optional(z.boolean()),
  suppressOutput: optional(z.boolean()),
  stopReason: optional(z.string()),
  decision: optional(decisionSchema),
  systemMessage: optional(z.string()),
  terminalSequence: optional(z.string()),
  reason: optional(z.string()),
} satisfies { readonly [K in keyof SyncHookJSONOutput]?: z.ZodType };

/** A string field the docs call optional. */
export const text = optional(z.string());
export const flag = optional(z.boolean());

/** A JSON object: `updatedInput` and an elicitation's `content` replace the whole object. */
export const objectValue = z.record(z.string(), z.unknown());
