import type { HookEvent } from '../../protocol/official.ts';
import type { MatcherMode } from '../../rules/hook-matcher.ts';
import type { EventFactsOf, ModelCatalog, ToolCallView } from '../contracts.ts';
import { canonicalMatcherModel } from './model-switch.ts';

/**
 * Which input field an event's matcher filters on (hooks.md, "Matcher patterns", the table "Each
 * event type matches on a different field"), or none: "If you add a `matcher` field to an event
 * without matcher support, it is silently ignored".
 */

/** What a matcher is tested against: a value (possibly absent), or nothing to filter on. */
export type MatcherValue =
  | { readonly filters: true; readonly value: string | undefined }
  | { readonly filters: false };

export interface TargetContext {
  readonly modelCatalog?: ModelCatalog;
}

interface Target<Facts> {
  /** `narrow` for `FileChanged` and `StopFailure`, which accept only letters, digits, `_` and `|`. */
  readonly mode: MatcherMode;
  readonly valueOf: (facts: Facts, context: TargetContext) => MatcherValue;
  /** The tool call a tool event carries, which a handler's `if` is evaluated against. */
  readonly call?: (facts: Facts) => ToolCallView;
  /**
   * Whether the session's MCP servers are available to the event's hooks; absent means they are
   * (hooks.md, "Events that fire before MCP servers are available").
   */
  readonly mcpAvailable?: (facts: Facts) => boolean;
}

export type MatcherTarget<E extends HookEvent> = Target<EventFactsOf<E>>;

const filterOn = (value: string | undefined): MatcherValue => ({ filters: true, value });
const NO_FILTER: MatcherValue = { filters: false };

/** The last path segment, whichever separator the host's paths use. */
const basename = (path: string): string => path.slice(path.search(/[^/\\]*$/));

/** An event that filters on one field of its input. */
const byField = <Facts>(
  read: (facts: Facts) => string | undefined,
  mode: MatcherMode = 'standard',
): Target<Facts> => ({ mode, valueOf: (facts) => filterOn(read(facts)) });

/** An event with no matcher support: it fires on every occurrence. */
const NONE: Target<unknown> = { mode: 'standard', valueOf: () => NO_FILTER };

interface ToolFacts {
  readonly tool_name: string;
  readonly tool_input: unknown;
}

/** The five tool events filter on the tool name. */
const TOOL: Target<ToolFacts> = {
  ...byField((facts: ToolFacts) => facts.tool_name),
  call: (facts) => ({ toolName: facts.tool_name, toolInput: facts.tool_input }),
};

/** The model events filter on the canonical name of `to_model`; with none, every hook runs. */
const MODEL: Target<{ readonly to_model: string }> = {
  mode: 'standard',
  valueOf: (facts, context) => {
    const canonical = canonicalMatcherModel(facts.to_model, context.modelCatalog);
    return canonical === undefined ? NO_FILTER : filterOn(canonical);
  },
};

/**
 * `SessionStart` "at launch, including with `--continue` or `--resume`" fires before the MCP servers
 * are available; "after `/clear` or a compaction" they are. A fork (`--fork-session`) is a launch.
 */
const MCP_AT_SOURCE: { readonly [S in EventFactsOf<'SessionStart'>['source']]: boolean } = {
  startup: false,
  resume: false,
  fork: false,
  clear: true,
  compact: true,
};

const SESSION_START: Target<{ readonly source: EventFactsOf<'SessionStart'>['source'] }> = {
  ...byField((facts: { readonly source: string }) => facts.source),
  mcpAvailable: (facts) => MCP_AT_SOURCE[facts.source],
};

/** "every `Setup` event" fires before the MCP servers are available. */
const SETUP: Target<{ readonly trigger: string }> = {
  ...byField((facts: { readonly trigger: string }) => facts.trigger),
  mcpAvailable: () => false,
};

export const MATCHER_TARGETS: { readonly [E in HookEvent]: MatcherTarget<E> } = {
  PreToolUse: TOOL,
  PostToolUse: TOOL,
  PostToolUseFailure: TOOL,
  PermissionRequest: TOOL,
  PermissionDenied: TOOL,
  SessionStart: SESSION_START,
  Setup: SETUP,
  SessionEnd: byField((facts: { readonly reason: string }) => facts.reason),
  Notification: byField((facts: { readonly notification_type: string }) => facts.notification_type),
  SubagentStart: byField((facts: { readonly agent_type: string }) => facts.agent_type),
  SubagentStop: byField((facts: { readonly agent_type: string }) => facts.agent_type),
  PreCompact: byField((facts: { readonly trigger: string }) => facts.trigger),
  PostCompact: byField((facts: { readonly trigger: string }) => facts.trigger),
  PreModelSwitch: MODEL,
  PostModelSwitch: MODEL,
  ConfigChange: byField((facts: { readonly source: string }) => facts.source),
  CwdChanged: NONE,
  DirectoryAdded: byField((facts: { readonly source: string }) => facts.source),
  FileChanged: byField(
    (facts: { readonly file_path: string }) => basename(facts.file_path),
    'narrow',
  ),
  StopFailure: byField((facts: { readonly error: string }) => facts.error, 'narrow'),
  InstructionsLoaded: byField((facts: { readonly load_reason: string }) => facts.load_reason),
  UserPromptExpansion: byField((facts: { readonly command_name: string }) => facts.command_name),
  Elicitation: byField((facts: { readonly mcp_server_name: string }) => facts.mcp_server_name),
  ElicitationResult: byField(
    (facts: { readonly mcp_server_name: string }) => facts.mcp_server_name,
  ),
  UserPromptSubmit: NONE,
  PostToolBatch: NONE,
  Stop: NONE,
  TeammateIdle: NONE,
  TaskCreated: NONE,
  TaskCompleted: NONE,
  WorktreeCreate: NONE,
  WorktreeRemove: NONE,
  MessageDisplay: NONE,
};

/** The target of `event`, typed for its facts. */
export const targetOf = <E extends HookEvent>(event: E): MatcherTarget<E> => MATCHER_TARGETS[event];
