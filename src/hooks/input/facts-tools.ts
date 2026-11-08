import { z } from 'zod';
import type { PermissionUpdate } from '../../protocol/official.ts';
import type { EventFactsOf } from '../contracts.ts';
import { anyValue, mcpServer, nonNegative, optional } from './facts-shared.ts';

/**
 * Facts of the tool events (hooks.md, "PreToolUse input", "PermissionRequest input", "PostToolUse
 * input", "PostToolUseFailure input", "PostToolBatch input", "PermissionDenied input"): each schema
 * is bound to the official input with `satisfies z.ZodType<EventFactsOf<E>>`, so the SDK stays the
 * source of truth for what a field is called and typed.
 */

/**
 * `permission_suggestions` entries are Claude Code's own `PermissionUpdate` values, handed back
 * to it unchanged; only the discriminating `type` is checked here (the entries are validated in
 * full where a hook returns them: `parsePermissionUpdates`).
 */
const permissionUpdate = z.custom<PermissionUpdate>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string',
  { message: 'Expected a permission update entry' },
);

const batchCall = z.object({
  tool_name: z.string(),
  tool_input: anyValue,
  tool_use_id: z.string(),
  tool_response: optional(z.unknown()),
});

export const PreToolUseFacts = z.object({
  tool_name: z.string(),
  tool_input: anyValue,
  tool_use_id: z.string(),
  mcp_server: optional(mcpServer),
}) satisfies z.ZodType<EventFactsOf<'PreToolUse'>>;

export const PostToolUseFacts = z.object({
  tool_name: z.string(),
  tool_input: anyValue,
  tool_response: anyValue,
  tool_use_id: z.string(),
  duration_ms: optional(nonNegative),
  mcp_server: optional(mcpServer),
}) satisfies z.ZodType<EventFactsOf<'PostToolUse'>>;

export const PostToolUseFailureFacts = z.object({
  tool_name: z.string(),
  tool_input: anyValue,
  tool_use_id: z.string(),
  error: z.string(),
  is_interrupt: optional(z.boolean()),
  duration_ms: optional(nonNegative),
  mcp_server: optional(mcpServer),
}) satisfies z.ZodType<EventFactsOf<'PostToolUseFailure'>>;

export const PostToolBatchFacts = z.object({
  tool_calls: z.array(batchCall),
}) satisfies z.ZodType<EventFactsOf<'PostToolBatch'>>;

export const PermissionRequestFacts = z.object({
  tool_name: z.string(),
  tool_input: anyValue,
  permission_suggestions: optional(z.array(permissionUpdate)),
  mcp_server: optional(mcpServer),
}) satisfies z.ZodType<EventFactsOf<'PermissionRequest'>>;

export const PermissionDeniedFacts = z.object({
  tool_name: z.string(),
  tool_input: anyValue,
  tool_use_id: z.string(),
  reason: z.string(),
  mcp_server: optional(mcpServer),
}) satisfies z.ZodType<EventFactsOf<'PermissionDenied'>>;
