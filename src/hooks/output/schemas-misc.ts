import { z } from 'zod';
import type { HookSpecificOutputOf } from '../../protocol/hook-events.ts';
import { text } from './schemas-common.ts';

/**
 * `hookSpecificOutput` of the remaining events that have one (hooks.md, "CwdChanged output",
 * "FileChanged output", "PreModelSwitch decision control", "PostModelSwitch decision control",
 * "WorktreeCreate output"), each bound to the official type.
 */

const watchPaths = z.array(z.string()).exactOptional();

export const CwdChangedSpecific = z.object({
  hookEventName: z.literal('CwdChanged'),
  watchPaths,
}) satisfies z.ZodType<HookSpecificOutputOf<'CwdChanged'>>;

export const FileChangedSpecific = z.object({
  hookEventName: z.literal('FileChanged'),
  watchPaths,
}) satisfies z.ZodType<HookSpecificOutputOf<'FileChanged'>>;

/**
 * "`PreModelSwitch` accepts `allow`, `deny`, and `ask`. It doesn't accept `defer`, `updatedInput`,
 * or `additionalContext`": a `defer` fails validation, the two fields are dropped.
 */
export const PreModelSwitchSpecific = z.object({
  hookEventName: z.literal('PreModelSwitch'),
  permissionDecision: z.enum(['allow', 'deny', 'ask']).exactOptional(),
  permissionDecisionReason: text,
}) satisfies z.ZodType<HookSpecificOutputOf<'PreModelSwitch'>>;

export const PostModelSwitchSpecific = z.object({
  hookEventName: z.literal('PostModelSwitch'),
  additionalContext: text,
}) satisfies z.ZodType<HookSpecificOutputOf<'PostModelSwitch'>>;

export const WorktreeCreateSpecific = z.object({
  hookEventName: z.literal('WorktreeCreate'),
  worktreePath: z.string(),
}) satisfies z.ZodType<HookSpecificOutputOf<'WorktreeCreate'>>;
