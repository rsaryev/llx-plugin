import type { Environment, McpCaller } from '../../../ports/index.ts';
import type { HookEvent } from '../../../protocol/official.ts';
import type { HandlerEntry, HandlerResult, RunContext } from '../context.ts';
import { handlerTimeoutMs } from '../timeouts.ts';
import { failureRun, remotePath, withoutPort } from './failure-run.ts';
import { substituteInput } from './mcp-input.ts';

/**
 * An `mcp_tool` hook (hooks.md, "MCP tool hook fields"). The `server` is passed as the hook writes
 * it: for a plugin-bundled server that is "the scoped name `plugin:<plugin-name>:<server-name>`,
 * not the bare server key". Running no hook on `SessionStart` at launch and on `Setup` (no MCP
 * client yet) is the select stage's (`select/mcp-client.ts`).
 */

/**
 * "On events where a hook can block or change the result, such as `PreToolUse` or `Stop`, Claude
 * Code waits for a connecting server ... On observational events, such as `Notification` or
 * `SessionEnd`, it doesn't wait."
 *
 * Judgment (spec/judgments.md): the docs name four events, so the kit sorts the rest by the same
 * test. An event waits when exit code 2 can stop what it guards ("Can block?: Yes" in "Exit code 2
 * behavior per event") or its output decides a result: `PermissionRequest` (`decision`),
 * `PermissionDenied` (`retry`), `PostToolUse` (`updatedToolOutput`, `decision`), `MessageDisplay`
 * (`displayContent`). An event whose hooks only add context or watch (`SessionStart`,
 * `SubagentStart`, `PostToolUseFailure`) does not.
 */
export const WAITS_FOR_SERVER: { readonly [E in HookEvent]: boolean } = {
  PreToolUse: true,
  PermissionRequest: true,
  PermissionDenied: true,
  PostToolUse: true,
  PostToolBatch: true,
  UserPromptSubmit: true,
  UserPromptExpansion: true,
  Stop: true,
  SubagentStop: true,
  TeammateIdle: true,
  TaskCreated: true,
  TaskCompleted: true,
  ConfigChange: true,
  PreCompact: true,
  PreModelSwitch: true,
  Elicitation: true,
  ElicitationResult: true,
  WorktreeCreate: true,
  WorktreeRemove: true,
  MessageDisplay: true,
  SessionStart: false,
  Setup: false,
  SessionEnd: false,
  StopFailure: false,
  PostToolUseFailure: false,
  SubagentStart: false,
  Notification: false,
  InstructionsLoaded: false,
  CwdChanged: false,
  DirectoryAdded: false,
  FileChanged: false,
  PostCompact: false,
  PostModelSwitch: false,
};

/** `MCP_TIMEOUT`: "Timeout in milliseconds for MCP server startup (default: 30000, or 30 seconds)". */
const MCP_TIMEOUT_VARIABLE = 'MCP_TIMEOUT';
const DEFAULT_MCP_TIMEOUT_MS = 30_000;

function mcpTimeoutMs(environment: Environment): number {
  const text = environment.get(MCP_TIMEOUT_VARIABLE)?.trim();
  const value = text !== undefined && /^\d+$/.test(text) ? Number(text) : 0;
  return value > 0 ? value : DEFAULT_MCP_TIMEOUT_MS;
}

/** "For at most `MCP_TIMEOUT` and within the hook's own `timeout`"; none on an observational event. */
function waitMs(entry: HandlerEntry<'mcp_tool'>, context: RunContext, hookMs: number | undefined) {
  if (!WAITS_FOR_SERVER[entry.event]) return 0;
  const limit = mcpTimeoutMs(context.ports.environment);
  return hookMs === undefined ? limit : Math.min(limit, hookMs);
}

export async function runMcpTool(
  entry: HandlerEntry<'mcp_tool'>,
  context: RunContext,
): Promise<HandlerResult> {
  const client: McpCaller | undefined = context.ports.mcp;
  if (client === undefined) return withoutPort(entry, 'mcp_tool', 'McpCaller');
  const { server, tool } = entry.handler;
  const hookMs = handlerTimeoutMs(entry, context.timeouts);
  const availability = await client.ensureConnected(
    server,
    waitMs(entry, context, hookMs),
    context.signal,
  );
  if (availability === 'unavailable') {
    // "If the server isn't connected at that point, the hook produces a non-blocking error."
    const text = `The MCP server "${server}" is not connected, so the hook did not call ${tool}.`;
    return { run: { kind: 'mcp', isError: true, text }, issues: [] };
  }
  const args = substituteInput(entry.handler.input, context.input, remotePath(entry, 'input'));
  // Judgment: no clock, so the call keeps the hook's whole timeout; the wait above is capped by it.
  const answer = await client.callTool({
    server,
    tool,
    input: args.input,
    ...(hookMs === undefined ? {} : { timeoutMs: hookMs }),
    signal: context.signal,
  });
  const run =
    'failure' in answer
      ? failureRun(answer, (text) => ({ kind: 'mcp', isError: true, text }))
      : ({ kind: 'mcp', isError: answer.isError, text: answer.text } as const);
  return { run, issues: args.issues };
}
