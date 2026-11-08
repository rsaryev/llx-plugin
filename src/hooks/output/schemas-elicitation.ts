import { z } from 'zod';
import type { HookSpecificOutputOf } from '../../protocol/hook-events.ts';
import { objectValue } from './schemas-common.ts';

/**
 * `hookSpecificOutput` of the two elicitation events (hooks.md, "Elicitation output",
 * "ElicitationResult output"): the `action` the MCP server receives and, for `accept`, `content`.
 */

const action = z.enum(['accept', 'decline', 'cancel']).exactOptional();
const content = objectValue.exactOptional();

export const ElicitationSpecific = z.object({
  hookEventName: z.literal('Elicitation'),
  action,
  content,
}) satisfies z.ZodType<HookSpecificOutputOf<'Elicitation'>>;

export const ElicitationResultSpecific = z.object({
  hookEventName: z.literal('ElicitationResult'),
  action,
  content,
}) satisfies z.ZodType<HookSpecificOutputOf<'ElicitationResult'>>;
