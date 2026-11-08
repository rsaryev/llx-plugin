/** Helpers for the tests of `selectHandlers` and its parts (hooks/select). */
import type {
  EventFactsOf,
  HookSession,
  HookSource,
  ModelCatalog,
  RegisteredHandler,
  Selection,
} from '../../src/hooks/contracts.ts';
import { createHookRegistry } from '../../src/hooks/registry.ts';
import { ifEvaluatorFor } from '../../src/hooks/select/if-guard.ts';
import { selectHandlers } from '../../src/hooks/select/select.ts';
import type { HookHandler } from '../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { matchContext } from './rule-context.ts';

/** An interactive, trusted session with nothing disabled. */
export const session = (overrides: Partial<HookSession> = {}): HookSession => ({
  sessionId: 's1',
  transcriptPath: '/t.jsonl',
  cwd: '/work/app',
  interactive: true,
  trusted: true,
  disableAllHooks: { effective: false, managedLocked: false },
  mcpAvailable: true,
  ...overrides,
});

export const settingsSource: HookSource = { kind: 'settings', label: '[settings]', scope: 'user' };
export const projectSettings: HookSource = {
  kind: 'settings',
  label: '[settings]',
  scope: 'project',
};
export const managedSettings: HookSource = {
  kind: 'settings',
  label: '[settings]',
  managed: true,
};
export const pluginSource = (pluginName = 'my-plugin'): HookSource => ({
  kind: 'plugin',
  label: `[plugin:${pluginName}]`,
  pluginName,
});
export const skillSource: HookSource = { kind: 'skill', label: '[skill]', scope: 'project' };
export const agentSource: HookSource = { kind: 'agent', label: '[agent]', scope: 'project' };

export const command = (text = './hook.sh'): HookHandler => ({ type: 'command', command: text });

let counter = 0;
/** A registered handler; the id is unique per call. */
export function entry(
  event: HookEvent,
  options: {
    readonly matcher?: string;
    readonly handler?: HookHandler;
    readonly source?: HookSource;
  } = {},
): RegisteredHandler {
  counter += 1;
  return {
    id: `h${counter}`,
    event,
    ...(options.matcher === undefined ? {} : { matcher: options.matcher }),
    handler: options.handler ?? command(),
    source: options.source ?? settingsSource,
  };
}

export interface SelectOptions {
  readonly session?: HookSession;
  readonly catalog?: ModelCatalog;
}

/** `selectHandlers` over these entries, with `if` rules read in the shared match context. */
export function select<E extends HookEvent>(
  entries: readonly RegisteredHandler[],
  event: E,
  facts: EventFactsOf<E>,
  options: SelectOptions = {},
): Selection {
  return selectHandlers(createHookRegistry(entries), {
    event,
    facts,
    session: options.session ?? session(),
    ifEvaluator: ifEvaluatorFor(matchContext),
    ...(options.catalog === undefined ? {} : { modelCatalog: options.catalog }),
  });
}

/** Sample facts for every event: what the event's input holds beyond the fields every event has. */
export const FACTS: { readonly [E in HookEvent]: EventFactsOf<E> } = {
  PreToolUse: {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /tmp/build' },
    tool_use_id: 't1',
  },
  PostToolUse: {
    tool_name: 'Edit',
    tool_input: { file_path: '/work/app/a.ts' },
    tool_response: {},
    tool_use_id: 't1',
  },
  PostToolUseFailure: {
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_use_id: 't1',
    error: 'failed',
  },
  PostToolBatch: { tool_calls: [] },
  PermissionRequest: { tool_name: 'Bash', tool_input: { command: 'git push' } },
  PermissionDenied: {
    tool_name: 'Bash',
    tool_input: { command: 'git push' },
    tool_use_id: 't1',
    reason: 'denied',
  },
  Notification: { message: 'm', notification_type: 'idle_prompt' },
  UserPromptSubmit: { prompt: 'hello' },
  UserPromptExpansion: {
    expansion_type: 'slash_command',
    command_name: 'review',
    command_args: '',
    prompt: '/review',
  },
  SessionStart: { source: 'startup' },
  SessionEnd: { reason: 'other' },
  Stop: { stop_hook_active: false },
  StopFailure: { error: 'rate_limit' },
  SubagentStart: { agent_id: 'a1', agent_type: 'Explore' },
  SubagentStop: {
    stop_hook_active: false,
    agent_id: 'a1',
    agent_transcript_path: '/a.jsonl',
    agent_type: 'Explore',
  },
  PreCompact: { trigger: 'manual', custom_instructions: null },
  PostCompact: { trigger: 'manual', compact_summary: 's' },
  PreModelSwitch: {
    from_model: 'claude-opus-4-6',
    to_model: 'claude-opus-5',
    requested_model: 'opus',
    source: 'command',
    context_tokens: 1000,
    prompt_cache_warm: true,
    cache_ttl: '5m',
    estimated_cache_write_usd: 0,
    pricing: 'catalog',
  },
  PostModelSwitch: {
    from_model: 'claude-opus-4-6',
    to_model: 'claude-opus-5',
    requested_model: 'opus',
    source: 'command',
    context_tokens: 1000,
    prompt_cache_warm: true,
    cache_ttl: '5m',
    estimated_cache_write_usd: 0,
    pricing: 'catalog',
  },
  Setup: { trigger: 'init' },
  TeammateIdle: { teammate_name: 'a', team_name: 'b' },
  TaskCreated: { task_id: '1', task_subject: 's' },
  TaskCompleted: { task_id: '1', task_subject: 's' },
  Elicitation: { mcp_server_name: 'issue-tracker', message: 'm' },
  ElicitationResult: { mcp_server_name: 'issue-tracker', action: 'accept' },
  ConfigChange: { source: 'user_settings' },
  WorktreeCreate: { name: 'w' },
  WorktreeRemove: { worktree_path: '/w' },
  InstructionsLoaded: {
    file_path: '/work/app/CLAUDE.md',
    memory_type: 'Project',
    load_reason: 'session_start',
  },
  CwdChanged: { old_cwd: '/a', new_cwd: '/b' },
  FileChanged: { file_path: '/work/app/.envrc', event: 'change' },
  DirectoryAdded: { directory: '/d', source: 'slash_command' },
  MessageDisplay: { turn_id: 't', message_id: 'm', index: 0, final: true, delta: 'x' },
};

/** One valid handler of each type. */
export const HANDLERS: { readonly [T in HookHandler['type']]: HookHandler } = {
  command: { type: 'command', command: './hook.sh' },
  http: { type: 'http', url: 'http://localhost:8080/hooks' },
  mcp_tool: { type: 'mcp_tool', server: 'my_server', tool: 'security_scan' },
  prompt: { type: 'prompt', prompt: 'Is this safe? $ARGUMENTS' },
  agent: { type: 'agent', prompt: 'Verify the tests pass. $ARGUMENTS' },
};
