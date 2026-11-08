import { z } from 'zod';
import type { EventFactsOf } from '../contracts.ts';
import { optional } from './facts-shared.ts';

/**
 * Facts of the agent, task and stop events (hooks.md, "Stop input", "StopFailure input",
 * "SubagentStart input", "SubagentStop input", "TaskCreated input", "TaskCompleted input",
 * "TeammateIdle input").
 */

/** One entry of `background_tasks`; the per-type fields are checked in `background-tasks.ts`. */
const backgroundTask = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  description: z.string(),
  command: optional(z.string()),
  agent_type: optional(z.string()),
  server: optional(z.string()),
  tool: optional(z.string()),
  name: optional(z.string()),
});

/** One entry of `session_crons`. */
const sessionCron = z.object({
  id: z.string(),
  schedule: z.string(),
  recurring: z.boolean(),
  prompt: z.string(),
});

const stopped = {
  stop_hook_active: z.boolean(),
  last_assistant_message: optional(z.string()),
  background_tasks: optional(z.array(backgroundTask)),
  session_crons: optional(z.array(sessionCron)),
};

export const StopFacts = z.object(stopped) satisfies z.ZodType<EventFactsOf<'Stop'>>;

export const SubagentStopFacts = z.object({
  ...stopped,
  agent_id: z.string(),
  agent_transcript_path: z.string(),
  agent_type: z.string(),
}) satisfies z.ZodType<EventFactsOf<'SubagentStop'>>;

/**
 * The error types of a failed turn: the docs' twelve and the SDK's `verification_required`
 * (spec/judgments.md).
 */
const STOP_FAILURE_ERRORS = [
  'authentication_failed',
  'oauth_org_not_allowed',
  'account_on_hold',
  'verification_required',
  'billing_error',
  'rate_limit',
  'overloaded',
  'invalid_request',
  'model_not_found',
  'server_error',
  'unknown',
  'max_output_tokens',
  'cloud_credential_error',
] as const;

export const StopFailureFacts = z.object({
  error: z.enum(STOP_FAILURE_ERRORS),
  error_details: optional(z.string()),
  last_assistant_message: optional(z.string()),
}) satisfies z.ZodType<EventFactsOf<'StopFailure'>>;

export const SubagentStartFacts = z.object({
  agent_id: z.string(),
  agent_type: z.string(),
}) satisfies z.ZodType<EventFactsOf<'SubagentStart'>>;

const task = {
  task_id: z.string(),
  task_subject: z.string(),
  task_description: optional(z.string()),
  teammate_name: optional(z.string()),
  team_name: optional(z.string()),
};

export const TaskCreatedFacts = z.object(task) satisfies z.ZodType<EventFactsOf<'TaskCreated'>>;
export const TaskCompletedFacts = z.object(task) satisfies z.ZodType<EventFactsOf<'TaskCompleted'>>;

export const TeammateIdleFacts = z.object({
  teammate_name: z.string(),
  team_name: z.string(),
}) satisfies z.ZodType<EventFactsOf<'TeammateIdle'>>;
