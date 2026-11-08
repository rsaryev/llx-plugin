import { z } from 'zod';
import { HOOK_EVENTS } from '../../protocol/hook-events.ts';
import type { HookEvent } from '../../protocol/official.ts';
import { commonFieldsOf } from './schemas-common.ts';
import { ElicitationResultSpecific, ElicitationSpecific } from './schemas-elicitation.ts';
import {
  CwdChangedSpecific,
  FileChangedSpecific,
  PostModelSwitchSpecific,
  PreModelSwitchSpecific,
  WorktreeCreateSpecific,
} from './schemas-misc.ts';
import {
  MessageDisplaySpecific,
  NotificationSpecific,
  SessionStartSpecific,
  SetupSpecific,
  StopSpecific,
  SubagentStartSpecific,
  SubagentStopSpecific,
  UserPromptExpansionSpecific,
  UserPromptSubmitSpecific,
} from './schemas-session.ts';
import {
  PermissionDeniedSpecific,
  PermissionRequestSpecific,
  PostToolBatchSpecific,
  PostToolUseFailureSpecific,
  PostToolUseSpecific,
  PreToolUseSpecific,
} from './schemas-tool.ts';

/**
 * The JSON output of each event: the universal fields and an optional `hookSpecificOutput` that
 * "requires a `hookEventName` field set to the event name" (hooks.md, "JSON output"), so one
 * event's object does not validate on another.
 *
 * Judgment (spec/judgments.md): the official types have no `hookSpecificOutput` member for
 * `ConfigChange`, `PreCompact` and the other events the docs give none; an object for them carries
 * only `hookEventName`, which keeps an event name that matches and drops what follows.
 */

const bare = <E extends HookEvent>(event: E) => z.object({ hookEventName: z.literal(event) });

/** One row per event of the official union: an event the SDK adds is a compile error here. */
const SPECIFIC_SCHEMAS: { readonly [E in HookEvent]: z.ZodType<object> } = {
  PreToolUse: PreToolUseSpecific,
  PostToolUse: PostToolUseSpecific,
  PostToolUseFailure: PostToolUseFailureSpecific,
  PostToolBatch: PostToolBatchSpecific,
  Notification: NotificationSpecific,
  UserPromptSubmit: UserPromptSubmitSpecific,
  UserPromptExpansion: UserPromptExpansionSpecific,
  SessionStart: SessionStartSpecific,
  SessionEnd: bare('SessionEnd'),
  Stop: StopSpecific,
  StopFailure: bare('StopFailure'),
  SubagentStart: SubagentStartSpecific,
  SubagentStop: SubagentStopSpecific,
  PreCompact: bare('PreCompact'),
  PostCompact: bare('PostCompact'),
  PreModelSwitch: PreModelSwitchSpecific,
  PostModelSwitch: PostModelSwitchSpecific,
  PermissionRequest: PermissionRequestSpecific,
  PermissionDenied: PermissionDeniedSpecific,
  Setup: SetupSpecific,
  TeammateIdle: bare('TeammateIdle'),
  TaskCreated: bare('TaskCreated'),
  TaskCompleted: bare('TaskCompleted'),
  Elicitation: ElicitationSpecific,
  ElicitationResult: ElicitationResultSpecific,
  ConfigChange: bare('ConfigChange'),
  WorktreeCreate: WorktreeCreateSpecific,
  WorktreeRemove: bare('WorktreeRemove'),
  InstructionsLoaded: bare('InstructionsLoaded'),
  CwdChanged: CwdChangedSpecific,
  FileChanged: FileChangedSpecific,
  DirectoryAdded: bare('DirectoryAdded'),
  MessageDisplay: MessageDisplaySpecific,
};

const outputSchemaOf = (event: HookEvent) =>
  z.object({
    ...commonFieldsOf(event),
    hookSpecificOutput: SPECIFIC_SCHEMAS[event].exactOptional(),
  });

/** A hook's JSON output after validation: known fields only, typed. */
export type CheckedOutput = z.infer<ReturnType<typeof outputSchemaOf>>;

const SCHEMAS = new Map(HOOK_EVENTS.map((event) => [event, outputSchemaOf(event)]));

export const outputSchema = (event: HookEvent) => SCHEMAS.get(event) ?? outputSchemaOf(event);
