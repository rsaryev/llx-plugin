import { z } from 'zod';
import type { EventFactsOf } from '../contracts.ts';
import { count, nonNegative } from './facts-shared.ts';

/**
 * Facts of the model-switch events (hooks.md, "PreModelSwitch input"). `PostModelSwitch` has the
 * same fields, and its `source` also names the switches Claude Code makes on its own.
 */

const cost = {
  from_model: z.string(),
  to_model: z.string(),
  /** "a string, or `null` when the request was for the default model". */
  requested_model: z.string().nullable(),
  context_tokens: count,
  prompt_cache_warm: z.boolean(),
  cache_ttl: z.enum(['5m', '1h']),
  estimated_cache_write_usd: nonNegative,
  pricing: z.enum(['configured', 'catalog', 'default']),
};

export const PreModelSwitchFacts = z.object({
  ...cost,
  source: z.enum(['command', 'picker', 'sdk']),
}) satisfies z.ZodType<EventFactsOf<'PreModelSwitch'>>;

export const PostModelSwitchFacts = z.object({
  ...cost,
  source: z.enum(['command', 'picker', 'sdk', 'auto', 'resume']),
}) satisfies z.ZodType<EventFactsOf<'PostModelSwitch'>>;
