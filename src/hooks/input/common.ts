import { warning, type PluginIssue } from '../../format/issues.ts';
import type { BaseHookInput, HookEvent } from '../../protocol/official.ts';
import type { HookSession } from '../contracts.ts';
import { hookPermissionMode } from './permission-mode.ts';

/**
 * The fields every event's input has (hooks.md, "Common input fields"). `scratchpad_dir` is in the
 * docs ("Requires Claude Code v2.1.257 or later") but not in the SDK's `BaseHookInput`, so it is
 * typed here as a documented extension (spec/judgments.md).
 */
export type CommonInput = BaseHookInput & {
  readonly hook_event_name: HookEvent;
  readonly scratchpad_dir?: string;
};

/**
 * The events whose input has `permission_mode`. The docs say "Not all events receive this field.
 * Check the JSON example in each hook event section": these are the events whose example shows it.
 */
const PERMISSION_MODE_EVENTS: { readonly [E in HookEvent]: boolean } = {
  PreToolUse: true,
  PostToolUse: true,
  PostToolUseFailure: true,
  PostToolBatch: true,
  Notification: false,
  UserPromptSubmit: true,
  UserPromptExpansion: true,
  SessionStart: false,
  SessionEnd: false,
  Stop: true,
  StopFailure: false,
  SubagentStart: false,
  SubagentStop: true,
  PreCompact: false,
  PostCompact: false,
  PreModelSwitch: false,
  PostModelSwitch: false,
  PermissionRequest: true,
  PermissionDenied: true,
  Setup: false,
  TeammateIdle: true,
  TaskCreated: false,
  TaskCompleted: true,
  Elicitation: false,
  ElicitationResult: false,
  ConfigChange: false,
  WorktreeCreate: false,
  WorktreeRemove: false,
  InstructionsLoaded: false,
  CwdChanged: false,
  FileChanged: false,
  DirectoryAdded: false,
  MessageDisplay: false,
};

/**
 * The events with a tool-use context, which carry `effort`: "Present for `PreToolUse`,
 * `PostToolUse`, `Stop`, `SubagentStop`, and other events with a tool-use context"; absent "for
 * session-lifecycle hooks" (the SDK's note). The other events of the agentic loop that name a
 * tool call are counted in (spec/judgments.md).
 */
const EFFORT_EVENTS: { readonly [E in HookEvent]: boolean } = {
  PreToolUse: true,
  PostToolUse: true,
  PostToolUseFailure: true,
  PostToolBatch: true,
  PermissionRequest: true,
  PermissionDenied: true,
  Stop: true,
  SubagentStop: true,
  Notification: false,
  UserPromptSubmit: false,
  UserPromptExpansion: false,
  SessionStart: false,
  SessionEnd: false,
  StopFailure: false,
  SubagentStart: false,
  PreCompact: false,
  PostCompact: false,
  PreModelSwitch: false,
  PostModelSwitch: false,
  Setup: false,
  TeammateIdle: false,
  TaskCreated: false,
  TaskCompleted: false,
  Elicitation: false,
  ElicitationResult: false,
  ConfigChange: false,
  WorktreeCreate: false,
  WorktreeRemove: false,
  InstructionsLoaded: false,
  CwdChanged: false,
  FileChanged: false,
  DirectoryAdded: false,
  MessageDisplay: false,
};

/** True for a value a host left empty: an absent field is better than an empty one. */
const given = (value: string | undefined): value is string => value !== undefined && value !== '';

/** `permission_mode` for the events that have it, and a warning for a text that names no mode. */
function permissionModeFields(
  event: HookEvent,
  session: HookSession,
): { readonly fields: Pick<CommonInput, 'permission_mode'>; readonly issues: PluginIssue[] } {
  const raw = session.permissionMode;
  if (raw === undefined || !PERMISSION_MODE_EVENTS[event]) return { fields: {}, issues: [] };
  const mode = hookPermissionMode(raw);
  if (mode !== undefined) return { fields: { permission_mode: mode }, issues: [] };
  const message = `"${raw}" is not a permission mode and is not sent`;
  return { fields: {}, issues: [warning(`hooks.${event}.input.permission_mode`, message)] };
}

const effortFields = (event: HookEvent, session: HookSession): Pick<CommonInput, 'effort'> =>
  EFFORT_EVENTS[event] && session.effort !== undefined
    ? { effort: { level: session.effort.level } }
    : {};

const agentFields = (session: HookSession): Pick<CommonInput, 'agent_id' | 'agent_type'> => ({
  ...(given(session.agent?.id) ? { agent_id: session.agent.id } : {}),
  ...(given(session.agent?.type) ? { agent_type: session.agent.type } : {}),
});

/**
 * The common fields of `event`'s input from what the host knows of the session, in the order the
 * docs' example lists them. A field the host has no value for is absent from the object, as the
 * docs say of `prompt_id` ("Absent until the first user input") and `scratchpad_dir` ("Absent when
 * the session has no scratchpad").
 */
export function commonInput(
  event: HookEvent,
  session: HookSession,
): { readonly fields: CommonInput; readonly issues: readonly PluginIssue[] } {
  const mode = permissionModeFields(event, session);
  const fields: CommonInput = {
    session_id: session.sessionId,
    ...(given(session.promptId) ? { prompt_id: session.promptId } : {}),
    transcript_path: session.transcriptPath,
    cwd: session.cwd,
    ...(given(session.scratchpadDir) ? { scratchpad_dir: session.scratchpadDir } : {}),
    ...mode.fields,
    ...effortFields(event, session),
    hook_event_name: event,
    ...agentFields(session),
  };
  return { fields, issues: mode.issues };
}
