/**
 * The `mcp_tool` handler: hooks.md § "MCP tool hook fields" (`server`: "Name of a configured MCP
 * server. For a plugin-bundled server, this is the scoped name `plugin:<plugin-name>:<server-name>`,
 * such as `plugin:my-plugin:db`, not the bare server key"; `tool`; `input`: "String values support
 * `${path}` substitution from the hook's JSON input, such as `"${tool_input.file_path}"`"),
 * "How the tool's result is read" ("If the tool returns `isError: true`, the hook produces a
 * non-blocking error"), "When the server is still connecting" ("On events where a hook can block or
 * change the result, such as `PreToolUse` or `Stop`, Claude Code waits for a connecting server ...
 * for at most `MCP_TIMEOUT` and within the hook's own `timeout`. On observational events, such as
 * `Notification` or `SessionEnd`, it doesn't wait"; "If the server isn't connected at that point,
 * the hook produces a non-blocking error"). Skipping `SessionStart` at launch and `Setup` is the
 * select stage's (tests/hooks/select/handler-types.test.ts). Rows outside `spec(...)` are judgments.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { WAITS_FOR_SERVER } from '../../../../src/hooks/handlers/remote/mcp-tool.ts';
import { HOOK_EVENTS } from '../../../../src/protocol/hook-events.ts';
import type { HookEvent } from '../../../../src/protocol/official.ts';
import type { McpCaller, McpToolResult, PortFailure } from '../../../../src/ports/index.ts';
import { mcpEntry, remoteContext } from '../../../support/hooks-remote.ts';
import { fakeEnvironment, fakeMcp } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';

const INPUT = JSON.stringify({
  hook_event_name: 'PostToolUse',
  tool_name: 'Write',
  tool_input: { file_path: '/work/app/src/a.ts', content: 'x' },
  count: 3,
});

interface Waited {
  readonly server: string;
  readonly waitMs: number;
}

/** The fake MCP client, recording what `ensureConnected` was asked. */
function watched(
  connected: readonly string[],
  tools: Record<string, McpToolResult | PortFailure> = {},
): McpCaller & { readonly waits: Waited[]; readonly calls: ReturnType<typeof fakeMcp>['calls'] } {
  const inner = fakeMcp({ connected, tools });
  const waits: Waited[] = [];
  return {
    calls: inner.calls,
    waits,
    ensureConnected: (server, waitMs, signal) => {
      waits.push({ server, waitMs });
      return inner.ensureConnected(server, waitMs, signal);
    },
    callTool: (call) => inner.callTool(call),
  };
}

const call = async (
  hook: { server: string; tool: string; input?: Record<string, unknown>; timeout?: number },
  options: { event?: HookEvent; mcp: McpCaller; variables?: Record<string, string> },
) =>
  runHandler(
    mcpEntry(hook, options.event ?? 'PostToolUse'),
    remoteContext({
      mcp: options.mcp,
      input: INPUT,
      environment: fakeEnvironment(options.variables ?? {}),
    }),
  );

const waitFor = async (timeout: number | undefined, variables: Record<string, string>) => {
  const mcp = watched(['s'], { 's/t': { isError: false, text: '' } });
  await call(
    { server: 's', tool: 't', ...(timeout === undefined ? {} : { timeout }) },
    { mcp, event: 'PreToolUse', variables },
  );
  return mcp.waits[0]?.waitMs;
};

/** The arguments the tool was called with, and the issues of the run. */
const argsOf = async (input: Record<string, unknown> | undefined) => {
  const mcp = watched(['my_server'], { 'my_server/security_scan': { isError: false, text: '' } });
  const hook = { server: 'my_server', tool: 'security_scan' };
  const result = await call(input === undefined ? hook : { ...hook, input }, { mcp });
  return { sent: mcp.calls[0]?.input, issues: result.issues };
};

spec('hooks.handler.mcp_tool.server', () => {
  test('calls the server by the name the hook gives', async () => {
    const mcp = watched(['my_server'], { 'my_server/security_scan': { isError: false, text: '' } });
    await call({ server: 'my_server', tool: 'security_scan' }, { mcp });
    expect(mcp.calls[0]?.server).toBe('my_server');
  });

  test('a plugin-bundled server is addressed by its scoped name, which the kit never rewrites', async () => {
    const mcp = watched(['plugin:my-plugin:db'], {
      'plugin:my-plugin:db/query': { isError: false, text: 'rows' },
    });
    const { run } = await call({ server: 'plugin:my-plugin:db', tool: 'query' }, { mcp });
    expect(mcp.waits[0]?.server).toBe('plugin:my-plugin:db');
    expect(mcp.calls[0]?.server).toBe('plugin:my-plugin:db');
    expect(run).toEqual({ kind: 'mcp', isError: false, text: 'rows' });
  });

  test('the bare server key of a plugin server is not connected: a non-blocking error, no call', async () => {
    const mcp = watched(['plugin:my-plugin:db']);
    const { run } = await call({ server: 'db', tool: 'query' }, { mcp });
    expect(mcp.calls).toHaveLength(0);
    expect(run.kind).toBe('mcp');
    expect(run).toMatchObject({ isError: true });
  });

  test('a server that is not connected when the call is due is a non-blocking error', async () => {
    const mcp = watched([]);
    const { run } = await call({ server: 'my_server', tool: 'scan' }, { mcp, event: 'Stop' });
    expect(mcp.calls).toHaveLength(0);
    expect(run).toMatchObject({ kind: 'mcp', isError: true });
  });

  test('on PreToolUse and Stop the kit waits for a connecting server', async () => {
    for (const event of ['PreToolUse', 'Stop'] as const) {
      const mcp = watched(['s'], { 's/t': { isError: false, text: '' } });
      await call({ server: 's', tool: 't', timeout: 600 }, { mcp, event });
      expect(mcp.waits[0]?.waitMs).toBeGreaterThan(0);
    }
  });

  test('on Notification and SessionEnd it does not wait', async () => {
    for (const event of ['Notification', 'SessionEnd'] as const) {
      const mcp = watched(['s'], { 's/t': { isError: false, text: '' } });
      await call({ server: 's', tool: 't' }, { mcp, event });
      expect(mcp.waits[0]?.waitMs).toBe(0);
    }
  });

  test('the wait is at most MCP_TIMEOUT (30 s by default) and within the hook timeout', async () => {
    expect(await waitFor(undefined, {})).toBe(30_000);
    expect(await waitFor(10, {})).toBe(10_000);
    expect(await waitFor(undefined, { MCP_TIMEOUT: '5000' })).toBe(5000);
    expect(await waitFor(2, { MCP_TIMEOUT: '5000' })).toBe(2000);
    expect(await waitFor(undefined, { MCP_TIMEOUT: 'soon' })).toBe(30_000);
  });
});

spec('hooks.handler.mcp_tool.tool', () => {
  test('calls the tool the hook names and reports its text', async () => {
    const mcp = watched(['my_server'], {
      'my_server/security_scan': { isError: false, text: '{"decision":"block"}' },
    });
    const { run } = await call({ server: 'my_server', tool: 'security_scan' }, { mcp });
    expect(mcp.calls[0]?.tool).toBe('security_scan');
    expect(run).toEqual({ kind: 'mcp', isError: false, text: '{"decision":"block"}' });
  });

  test('a tool that returns isError: true is reported as an error, for a non-blocking error', async () => {
    const mcp = watched(['s'], { 's/t': { isError: true, text: 'scan failed' } });
    const { run } = await call({ server: 's', tool: 't' }, { mcp });
    expect(run).toEqual({ kind: 'mcp', isError: true, text: 'scan failed' });
  });

  test('a call the client could not make is a non-blocking error carrying its message', async () => {
    const mcp = watched(['s'], { 's/t': { failure: 'no-such-tool', message: 'no tool t' } });
    const { run } = await call({ server: 's', tool: 't' }, { mcp });
    expect(run).toEqual({ kind: 'mcp', isError: true, text: 'no tool t' });
  });

  test('the hook timeout reaches the call in milliseconds, 600 s by default', async () => {
    const own = watched(['s'], { 's/t': { isError: false, text: '' } });
    await call({ server: 's', tool: 't', timeout: 20 }, { mcp: own });
    expect(own.calls[0]?.timeoutMs).toBe(20_000);
    const none = watched(['s'], { 's/t': { isError: false, text: '' } });
    await call({ server: 's', tool: 't' }, { mcp: none });
    expect(none.calls[0]?.timeoutMs).toBe(600_000);
  });

  test('a timeout and an abort of the call are the shared runs', async () => {
    const slow = watched(['s'], { 's/t': { failure: 'timeout', message: 'late' } });
    expect((await call({ server: 's', tool: 't' }, { mcp: slow })).run).toEqual({
      kind: 'timed-out',
    });
    const stopped = watched(['s'], { 's/t': { failure: 'aborted', message: 'stop' } });
    expect((await call({ server: 's', tool: 't' }, { mcp: stopped })).run).toEqual({
      kind: 'cancelled',
    });
  });
});

spec('hooks.handler.mcp_tool.input', () => {
  test('the docs example: "${tool_input.file_path}" becomes the edited file path', async () => {
    const { sent } = await argsOf({ file_path: '${tool_input.file_path}' });
    expect(sent).toEqual({ file_path: '/work/app/src/a.ts' });
  });

  test('a reference inside a longer string, and several in one', async () => {
    const { sent } = await argsOf({
      note: 'scan ${tool_input.file_path} after ${tool_name}',
    });
    expect(sent).toEqual({ note: 'scan /work/app/src/a.ts after Write' });
  });

  test('strings without a reference, and values that are not strings, pass unchanged', async () => {
    const { sent } = await argsOf({
      mode: 'full',
      depth: 2,
      deep: true,
      none: null,
      list: [1, 'a'],
    });
    expect(sent).toEqual({ mode: 'full', depth: 2, deep: true, none: null, list: [1, 'a'] });
  });

  test('a hook with no input calls the tool with no arguments', async () => {
    expect((await argsOf(undefined)).sent).toEqual({});
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('strings nested in objects and arrays are substituted too', async () => {
    const { sent } = await argsOf({ a: { b: ['${tool_name}'] } });
    expect(sent).toEqual({ a: { b: ['Write'] } });
  });

  test('a non-string value is written as text, an object as JSON', async () => {
    const { sent } = await argsOf({ n: '${count}', o: '${tool_input}' });
    expect(sent).toEqual({
      n: '3',
      o: '{"file_path":"/work/app/src/a.ts","content":"x"}',
    });
  });

  test('a path with no value is an empty string, with a warning naming it', async () => {
    const { sent, issues } = await argsOf({ p: 'x${tool_input.missing}y' });
    expect(sent).toEqual({ p: 'xy' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.path).toBe('hooks.PostToolUse.input');
    expect(issues[0]?.message).toContain('tool_input.missing');
  });

  test('the text a path brings in is not read again', async () => {
    const mcp = watched(['s'], { 's/t': { isError: false, text: '' } });
    await runHandler(
      mcpEntry({ server: 's', tool: 't', input: { a: '${x}' } }),
      remoteContext({ mcp, input: '{"x":"${tool_name}","tool_name":"Write"}' }),
    );
    expect(mcp.calls[0]?.input).toEqual({ a: '${tool_name}' });
  });

  test('text that is not a path (a space, a bare dollar) stays as written', async () => {
    const { sent, issues } = await argsOf({ a: 'cost ${not a path} $5 ${}' });
    expect(sent).toEqual({ a: 'cost ${not a path} $5 ${}' });
    expect(issues).toEqual([]);
  });

  test('an array index is a path segment', async () => {
    const mcp = watched(['s'], { 's/t': { isError: false, text: '' } });
    await runHandler(
      mcpEntry({ server: 's', tool: 't', input: { a: '${files.1}' } }),
      remoteContext({ mcp, input: '{"files":["a","b"]}' }),
    );
    expect(mcp.calls[0]?.input).toEqual({ a: 'b' });
  });

  test('which events wait for a connecting server is a table over every event', () => {
    expect(Object.keys(WAITS_FOR_SERVER).toSorted()).toEqual(HOOK_EVENTS.toSorted());
    const blocking: HookEvent[] = [
      'PreToolUse',
      'UserPromptSubmit',
      'Stop',
      'SubagentStop',
      'PermissionRequest',
      'PostToolUse',
      'PostToolBatch',
      'TaskCreated',
      'TaskCompleted',
      'TeammateIdle',
      'ConfigChange',
      'PreCompact',
      'Elicitation',
      'WorktreeCreate',
    ];
    const observational: HookEvent[] = [
      'Notification',
      'SessionEnd',
      'StopFailure',
      'PostCompact',
      'InstructionsLoaded',
      'CwdChanged',
      'FileChanged',
      'PostModelSwitch',
    ];
    for (const event of blocking) expect(WAITS_FOR_SERVER[event]).toBe(true);
    for (const event of observational) expect(WAITS_FOR_SERVER[event]).toBe(false);
  });

  test('without the MCP client the hook does not run and says why', async () => {
    const result = await runHandler(mcpEntry({ server: 's', tool: 't' }), remoteContext({}));
    expect(result.run.kind).toBe('skipped');
    expect(result.issues[0]?.severity).toBe('error');
  });
});
