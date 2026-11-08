import { z } from 'zod';
import type { EventFactsOf } from '../contracts.ts';
import { count, nonNegative, optional } from './facts-shared.ts';

/**
 * Facts of the session and prompt events (hooks.md, "SessionStart input", "Setup input",
 * "SessionEnd", "PreCompact", "PostCompact", "UserPromptSubmit input", "UserPromptExpansion input",
 * "MessageDisplay input").
 */

export const SessionStartFacts = z.object({
  source: z.enum(['startup', 'resume', 'clear', 'compact', 'fork']),
  model: optional(z.string()),
  session_title: optional(z.string()),
  seconds_since_last_response: optional(nonNegative),
  context_tokens: optional(count),
  prompt_cache_likely_expired: optional(z.boolean()),
  estimated_cache_write_usd: optional(nonNegative),
}) satisfies z.ZodType<EventFactsOf<'SessionStart'>>;

export const SetupFacts = z.object({
  trigger: z.enum(['init', 'maintenance']),
}) satisfies z.ZodType<EventFactsOf<'Setup'>>;

export const SessionEndFacts = z.object({
  reason: z.enum(['clear', 'resume', 'logout', 'prompt_input_exit', 'other']),
}) satisfies z.ZodType<EventFactsOf<'SessionEnd'>>;

export const PreCompactFacts = z.object({
  trigger: z.enum(['manual', 'auto']),
  custom_instructions: z.string().nullable(),
}) satisfies z.ZodType<EventFactsOf<'PreCompact'>>;

export const PostCompactFacts = z.object({
  trigger: z.enum(['manual', 'auto']),
  compact_summary: z.string(),
}) satisfies z.ZodType<EventFactsOf<'PostCompact'>>;

export const UserPromptSubmitFacts = z.object({
  prompt: z.string(),
  source: optional(
    z.enum(['user', 'sdk', 'system', 'loop_wakeup', 'schedule_wakeup', 'poll_event']),
  ),
  session_title: optional(z.string()),
}) satisfies z.ZodType<EventFactsOf<'UserPromptSubmit'>>;

export const UserPromptExpansionFacts = z.object({
  expansion_type: z.enum(['slash_command', 'mcp_prompt']),
  command_name: z.string(),
  command_args: z.string(),
  command_source: optional(z.string()),
  prompt: z.string(),
}) satisfies z.ZodType<EventFactsOf<'UserPromptExpansion'>>;

export const MessageDisplayFacts = z.object({
  turn_id: z.string(),
  message_id: z.string(),
  /** "Zero-based index of this batch within the message". */
  index: count,
  final: z.boolean(),
  /** May be empty: "the final batch's delta is empty when the message ends on a newline". */
  delta: z.string(),
}) satisfies z.ZodType<EventFactsOf<'MessageDisplay'>>;
