/**
 * When an `mcp_tool` hook waits for its server and how long: hooks.md § "When the server is still
 * connecting" ("On events where a hook can block or change the result, such as `PreToolUse` or
 * `Stop`, Claude Code waits for a connecting server before it calls the tool, for at most
 * `MCP_TIMEOUT` and within the hook's own `timeout`. On observational events, such as
 * `Notification` or `SessionEnd`, it doesn't wait"). The docs name four events and a bound, so the
 * table over all 33 events, the `MCP_TIMEOUT` default, the shared deadline and the abort are
 * judgments (spec/judgments.md), outside `spec(...)`. The wait itself is proven in mcp-tool.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { WAITS_FOR_SERVER } from '../../../../src/hooks/handlers/remote/mcp-tool.ts';
import { HOOK_EVENTS } from '../../../../src/protocol/hook-events.ts';
import type { HookEvent } from '../../../../src/protocol/official.ts';
import type { McpCaller, McpToolResult } from '../../../../src/ports/index.ts';
import { fixedClock } from '../../../support/clock.ts';
import { mcpEntry, remoteContext } from '../../../support/hooks-remote.ts';
import { fakeEnvironment, fakeMcp } from '../../../support/ports.ts';

const INPUT = '{"hook_event_name":"PreToolUse","tool_name":"Write"}';
const OK: McpToolResult = { isError: false, text: '' };

/** The waits `ensureConnected` was asked for, over a fake with `s/t` connected. */
function watched(onWait: () => void = () => undefined) {
  const inner = fakeMcp({ connected: ['s'], tools: { 's/t': OK } });
  const waits: number[] = [];
  const mcp: McpCaller = {
    ensureConnected: (server, waitMs, signal) => {
      waits.push(waitMs);
      onWait();
      return inner.ensureConnected(server, waitMs, signal);
    },
    callTool: (request) => inner.callTool(request),
  };
  return { mcp, waits, calls: inner.calls };
}

const waitFor = async (timeout: number | undefined, variables: Record<string, string>) => {
  const { mcp, waits } = watched();
  await runHandler(
    mcpEntry(
      { server: 's', tool: 't', ...(timeout === undefined ? {} : { timeout }) },
      'PreToolUse',
    ),
    remoteContext({ mcp, input: INPUT, environment: fakeEnvironment(variables) }),
  );
  return waits[0];
};

const timed = async (
  timeout: number,
  options: { advance?: number; clock?: boolean },
): Promise<{ run: unknown; timeoutMs: number | undefined; calls: number }> => {
  const clock = fixedClock();
  const { mcp, calls } = watched(() => clock.advance(options.advance ?? 0));
  const result = await runHandler(
    mcpEntry({ server: 's', tool: 't', timeout }, 'PreToolUse'),
    remoteContext({ mcp, input: INPUT, ...(options.clock === false ? {} : { clock }) }),
  );
  return { run: result.run, timeoutMs: calls[0]?.timeoutMs, calls: calls.length };
};

describe('the wait of an mcp_tool hook (judgments)', () => {
  test('the wait is at most MCP_TIMEOUT (30 s by default) and within the hook timeout', async () => {
    expect(await waitFor(undefined, {})).toBe(30_000);
    expect(await waitFor(10, {})).toBe(10_000);
    expect(await waitFor(undefined, { MCP_TIMEOUT: '5000' })).toBe(5000);
    expect(await waitFor(2, { MCP_TIMEOUT: '5000' })).toBe(2000);
    expect(await waitFor(undefined, { MCP_TIMEOUT: 'soon' })).toBe(30_000);
  });

  test('a session abort during the wait is the shared cancelled run, not a not-connected error', async () => {
    const controller = new AbortController();
    const inner = fakeMcp({ connected: [] });
    const mcp: McpCaller = {
      ensureConnected: (server, waitMs, signal) => {
        controller.abort();
        return inner.ensureConnected(server, waitMs, signal);
      },
      callTool: (request) => inner.callTool(request),
    };
    const result = await runHandler(
      mcpEntry({ server: 's', tool: 't' }, 'PreToolUse'),
      remoteContext({ mcp, input: INPUT, signal: controller.signal }),
    );
    expect(result.run).toEqual({ kind: 'cancelled' });
    expect(inner.calls).toHaveLength(0);
  });

  test('with a clock the call gets what the wait left of the hook timeout', async () => {
    const { run, timeoutMs } = await timed(20, { advance: 7000 });
    expect(run).toEqual({ kind: 'mcp', isError: false, text: '' });
    expect(timeoutMs).toBe(13_000);
  });

  test('a wait that used up the hook timeout is the shared timed-out run and calls nothing', async () => {
    const { run, calls } = await timed(10, { advance: 10_000 });
    expect(run).toEqual({ kind: 'timed-out' });
    expect(calls).toBe(0);
  });

  test('without a clock the call keeps the whole hook timeout', async () => {
    const { timeoutMs } = await timed(20, { advance: 7000, clock: false });
    expect(timeoutMs).toBe(20_000);
  });

  test('which events wait for a connecting server: all 33, as the judgment sorts them', () => {
    const expected: Record<HookEvent, boolean> = {
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
    expect(Object.keys(expected)).toHaveLength(HOOK_EVENTS.length);
    expect(WAITS_FOR_SERVER).toEqual(expected);
  });
});
