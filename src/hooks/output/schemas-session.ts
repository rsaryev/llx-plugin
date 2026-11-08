import { z } from 'zod';
import type { HookSpecificOutputOf } from '../../protocol/hook-events.ts';
import { flag, text } from './schemas-common.ts';

/**
 * `hookSpecificOutput` of the session, prompt, stop and display events (hooks.md, "SessionStart
 * decision control", "UserPromptSubmit decision control", "UserPromptExpansion decision control",
 * "Stop decision control", "MessageDisplay output", "Setup decision control"), each bound to the
 * official type.
 */

const additionalContext = { additionalContext: text };

/** "Array of absolute paths". */
const watchPaths = z.array(z.string()).exactOptional();

export const SessionStartSpecific = z.object({
  hookEventName: z.literal('SessionStart'),
  ...additionalContext,
  initialUserMessage: text,
  sessionTitle: text,
  watchPaths,
  reloadSkills: flag,
}) satisfies z.ZodType<HookSpecificOutputOf<'SessionStart'>>;

export const SetupSpecific = z.object({
  hookEventName: z.literal('Setup'),
  ...additionalContext,
}) satisfies z.ZodType<HookSpecificOutputOf<'Setup'>>;

export const UserPromptSubmitSpecific = z.object({
  hookEventName: z.literal('UserPromptSubmit'),
  ...additionalContext,
  sessionTitle: text,
  suppressOriginalPrompt: flag,
}) satisfies z.ZodType<HookSpecificOutputOf<'UserPromptSubmit'>>;

export const UserPromptExpansionSpecific = z.object({
  hookEventName: z.literal('UserPromptExpansion'),
  ...additionalContext,
  suppressOriginalPrompt: flag,
}) satisfies z.ZodType<HookSpecificOutputOf<'UserPromptExpansion'>>;

export const StopSpecific = z.object({
  hookEventName: z.literal('Stop'),
  ...additionalContext,
}) satisfies z.ZodType<HookSpecificOutputOf<'Stop'>>;

export const SubagentStopSpecific = z.object({
  hookEventName: z.literal('SubagentStop'),
  ...additionalContext,
}) satisfies z.ZodType<HookSpecificOutputOf<'SubagentStop'>>;

export const SubagentStartSpecific = z.object({
  hookEventName: z.literal('SubagentStart'),
  ...additionalContext,
}) satisfies z.ZodType<HookSpecificOutputOf<'SubagentStart'>>;

export const NotificationSpecific = z.object({
  hookEventName: z.literal('Notification'),
  ...additionalContext,
}) satisfies z.ZodType<HookSpecificOutputOf<'Notification'>>;

export const MessageDisplaySpecific = z.object({
  hookEventName: z.literal('MessageDisplay'),
  displayContent: text,
}) satisfies z.ZodType<HookSpecificOutputOf<'MessageDisplay'>>;
