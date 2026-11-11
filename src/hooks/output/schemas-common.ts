import { z } from 'zod';
import type { HookEvent, SyncHookJSONOutput } from '../../protocol/official.ts';
import { optional } from '../input/facts-shared.ts';

/**
 * The fields every event's JSON output has (hooks.md, "JSON output"): `continue`, `stopReason`,
 * `suppressOutput`, `systemMessage` and `terminalSequence`, plus the
 * top-level `decision` and `reason`. Checked against the official `SyncHookJSONOutput`.
 *
 * Judgment (spec/judgments.md): a key the schema does not name is dropped, not a failure: the docs
 * call only a value that cannot be parsed or has the wrong type a validation failure.
 */

/** "The only value for `decision` is `block`" (hooks.md, "Decision control"). */
const blockOnly = z.literal('block');

/** `PreToolUse` alone: "The deprecated values `approve` and `block` map to `allow` and `deny`". */
const approveOrBlock = z.enum(['approve', 'block']);
const APPROVING: ReadonlySet<HookEvent> = new Set<HookEvent>(['PreToolUse']);

/** The universal fields of `event`'s output; a `decision` of another value fails validation. */
export const commonFieldsOf = (event: HookEvent) =>
  ({
    continue: optional(z.boolean()),
    suppressOutput: optional(z.boolean()),
    stopReason: optional(z.string()),
    decision: optional(APPROVING.has(event) ? approveOrBlock : blockOnly),
    systemMessage: optional(z.string()),
    terminalSequence: optional(z.string()),
    reason: optional(z.string()),
  }) satisfies { readonly [K in keyof SyncHookJSONOutput]?: z.ZodType };

/** A string field the docs call optional. */
export const text = optional(z.string());
export const flag = optional(z.boolean());

/** A JSON object: `updatedInput` and an elicitation's `content` replace the whole object. */
export const objectValue = z.record(z.string(), z.unknown());
