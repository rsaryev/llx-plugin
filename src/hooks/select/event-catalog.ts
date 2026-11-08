import { HOOK_HANDLER_TYPES, type HookHandlerType } from '../../protocol/hook-config.ts';
import { HOOK_EVENTS } from '../../protocol/hook-events.ts';
import type { HookEvent } from '../../protocol/official.ts';

/**
 * What the hooks reference says about each event beyond its input (hooks.md, "Hook lifecycle" and
 * "Prompt-based hooks"): its cadence, the handler types it supports, and the tool calls it skips.
 * Which field its matcher filters on is `matcher-targets.ts`.
 */

/**
 * "Events fall into three cadences": per session, per turn, and on every tool call. The other
 * events fire at their own moments (a compaction, a file change) and have no cadence of their own.
 */
export type Cadence = 'session' | 'turn' | 'tool-call' | 'other';

export interface EventInfo {
  readonly cadence: Cadence;
  readonly handlerTypes: readonly HookHandlerType[];
  /**
   * Tools whose calls never fire the event: "PreToolUse and PostToolUse, except `EndConversation`
   * calls, which skip both".
   */
  readonly skippedTools: readonly string[];
}

/** The events that support all five handler types. */
const ALL: readonly HookHandlerType[] = HOOK_HANDLER_TYPES;
/** `PermissionRequest`: "supports command, http, mcp_tool, and prompt hooks but not agent hooks". */
const NO_AGENT: readonly HookHandlerType[] = ['command', 'http', 'mcp_tool', 'prompt'];
/** The events that "support command, http, and mcp_tool hooks but not prompt or agent". */
const NO_MODEL: readonly HookHandlerType[] = ['command', 'http', 'mcp_tool'];
/** `SessionStart` and `Setup`: command and mcp_tool only. */
const LAUNCH: readonly HookHandlerType[] = ['command', 'mcp_tool'];

const NONE: readonly string[] = [];
const END_CONVERSATION: readonly string[] = ['EndConversation'];

const info = (
  cadence: Cadence,
  handlerTypes: readonly HookHandlerType[],
  skippedTools: readonly string[] = NONE,
): EventInfo => ({ cadence, handlerTypes, skippedTools });

export const EVENT_CATALOG: { readonly [E in HookEvent]: EventInfo } = {
  SessionStart: info('session', LAUNCH),
  SessionEnd: info('session', NO_MODEL),
  UserPromptSubmit: info('turn', ALL),
  Stop: info('turn', ALL),
  StopFailure: info('turn', NO_MODEL),
  PreToolUse: info('tool-call', ALL, END_CONVERSATION),
  PostToolUse: info('tool-call', ALL, END_CONVERSATION),
  Setup: info('other', LAUNCH),
  UserPromptExpansion: info('other', ALL),
  PermissionRequest: info('other', NO_AGENT),
  PermissionDenied: info('other', ALL),
  PostToolUseFailure: info('other', ALL),
  PostToolBatch: info('other', ALL),
  Notification: info('other', NO_MODEL),
  MessageDisplay: info('other', NO_MODEL),
  SubagentStart: info('other', NO_MODEL),
  SubagentStop: info('other', ALL),
  TaskCreated: info('other', ALL),
  TaskCompleted: info('other', ALL),
  TeammateIdle: info('other', ALL),
  InstructionsLoaded: info('other', NO_MODEL),
  ConfigChange: info('other', NO_MODEL),
  CwdChanged: info('other', NO_MODEL),
  DirectoryAdded: info('other', NO_MODEL),
  FileChanged: info('other', NO_MODEL),
  WorktreeCreate: info('other', NO_MODEL),
  WorktreeRemove: info('other', NO_MODEL),
  PreCompact: info('other', NO_MODEL),
  PostCompact: info('other', NO_MODEL),
  PreModelSwitch: info('other', NO_MODEL),
  PostModelSwitch: info('other', NO_MODEL),
  Elicitation: info('other', NO_MODEL),
  ElicitationResult: info('other', NO_MODEL),
};

/** Whether `event` runs handlers of this type; any other is skipped. */
export const supportsHandlerType = (event: HookEvent, type: HookHandlerType): boolean =>
  EVENT_CATALOG[event].handlerTypes.includes(type);

/** The events that run handlers of this type. */
export const eventsSupporting = (type: HookHandlerType): readonly HookEvent[] =>
  HOOK_EVENTS.filter((event) => supportsHandlerType(event, type));

/** Whether a call to `toolName` fires `event` at all. */
export const firesForTool = (event: HookEvent, toolName: string): boolean =>
  !EVENT_CATALOG[event].skippedTools.includes(toolName);
