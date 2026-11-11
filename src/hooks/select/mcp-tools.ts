import { matchesMatcher, parseRule } from '../../rules/index.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { MonitorTreatment, ToolCallView } from '../contracts.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * Monitor calls (hooks.md, "Match Monitor commands"). A `PreToolUse` or `PermissionRequest` hook
 * with a `Bash` matcher also runs on a shell command the Monitor tool starts, but there the hook
 * gets a Bash call and its `allow` and `updatedInput` have no effect. MCP tool names need no code
 * of their own: `mcp__<server>__<tool>` is a tool name like any other, matched by the grammar.
 */

/** The events whose `Bash` matcher also covers Monitor commands. */
const COVERS_MONITOR: { readonly [E in HookEvent]: boolean } = {
  PreToolUse: true,
  PermissionRequest: true,
  PostToolUse: false,
  PostToolUseFailure: false,
  PermissionDenied: false,
  PostToolBatch: false,
  Notification: false,
  UserPromptSubmit: false,
  UserPromptExpansion: false,
  SessionStart: false,
  SessionEnd: false,
  Stop: false,
  StopFailure: false,
  SubagentStart: false,
  SubagentStop: false,
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

/** A WebSocket watch has a `ws` input and no `command`: there is no shell command to match as Bash. */
const runsCommand = (input: unknown): boolean =>
  isRecord(input) && typeof input.command === 'string';

/** Whether the hook's `if` rule names `Bash`: then `allow` and `updatedInput` no longer apply. */
function ifNamesBash(ifRule: string | undefined): boolean {
  if (ifRule === undefined) return false;
  const { rule } = parseRule(ifRule, { behavior: 'deny', source: { kind: 'cli' } });
  return rule?.value.toolName === 'Bash';
}

/**
 * How a Monitor call reaches a hook whose matcher is `matcher`, or `undefined` when it does not.
 * `direct` is whether the matcher already selected the call by its own tool name (`Monitor`).
 * Matchers such as `Bash|PowerShell`, `^Bash$` and `Bash.*` are Bash matchers: they also select a
 * Monitor command, and a WebSocket watch is not one.
 */
export function monitorTreatment(
  event: HookEvent,
  call: ToolCallView | undefined,
  hook: { readonly matcher: string | undefined; readonly ifRule: string | undefined },
  direct: boolean,
): MonitorTreatment | undefined {
  if (!COVERS_MONITOR[event] || call?.toolName !== 'Monitor') return undefined;
  if (direct) return { asBash: false, effectsApply: !ifNamesBash(hook.ifRule) };
  const asBash = matchesMatcher(hook.matcher, 'Bash');
  if (!asBash || !runsCommand(call.toolInput)) return undefined;
  return { asBash: true, effectsApply: false };
}
