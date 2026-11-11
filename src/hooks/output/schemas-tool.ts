import { z } from 'zod';
import type { HookSpecificOutputOf } from '../../protocol/hook-events.ts';
import { anyValue } from '../input/facts-shared.ts';
import { permissionUpdateSchema } from './permission-update.ts';
import { flag, objectValue, text } from './schemas-common.ts';

/**
 * `hookSpecificOutput` of the tool events (hooks.md, "PreToolUse decision control", "PermissionRequest
 * decision control", "PostToolUse decision control", "PostToolUseFailure decision control",
 * "PostToolBatch decision control", "PermissionDenied decision control"), each bound to the
 * official type.
 */

const additionalContext = { additionalContext: text };

export const PreToolUseSpecific = z.object({
  hookEventName: z.literal('PreToolUse'),
  permissionDecision: z.enum(['allow', 'deny', 'ask', 'defer']).exactOptional(),
  permissionDecisionReason: text,
  updatedInput: objectValue.exactOptional(),
  ...additionalContext,
}) satisfies z.ZodType<HookSpecificOutputOf<'PreToolUse'>>;

/** "`updatedInput` ... For `\"allow\"` only", "`message` ... For `\"deny\"` only": each behavior has its own fields. */
const permissionDecision = z.discriminatedUnion('behavior', [
  z.object({
    behavior: z.literal('allow'),
    updatedInput: objectValue.exactOptional(),
    updatedPermissions: z.array(permissionUpdateSchema).exactOptional(),
  }),
  z.object({ behavior: z.literal('deny'), message: text, interrupt: flag }),
]);

export const PermissionRequestSpecific = z.object({
  hookEventName: z.literal('PermissionRequest'),
  decision: permissionDecision,
}) satisfies z.ZodType<HookSpecificOutputOf<'PermissionRequest'>>;

export const PostToolUseSpecific = z.object({
  hookEventName: z.literal('PostToolUse'),
  ...additionalContext,
  classifierContext: text,
  updatedToolOutput: anyValue.exactOptional(),
  updatedMCPToolOutput: anyValue.exactOptional(),
}) satisfies z.ZodType<HookSpecificOutputOf<'PostToolUse'>>;

export const PostToolUseFailureSpecific = z.object({
  hookEventName: z.literal('PostToolUseFailure'),
  ...additionalContext,
}) satisfies z.ZodType<HookSpecificOutputOf<'PostToolUseFailure'>>;

export const PostToolBatchSpecific = z.object({
  hookEventName: z.literal('PostToolBatch'),
  ...additionalContext,
}) satisfies z.ZodType<HookSpecificOutputOf<'PostToolBatch'>>;

export const PermissionDeniedSpecific = z.object({
  hookEventName: z.literal('PermissionDenied'),
  retry: flag,
}) satisfies z.ZodType<HookSpecificOutputOf<'PermissionDenied'>>;
