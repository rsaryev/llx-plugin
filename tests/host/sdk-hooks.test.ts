/**
 * `sdkHooks` (agent-sdk/hooks.md, "Configure hooks", "Callback functions": "SDK callback hooks use
 * the same JSON output format as Claude Code shell command hooks"; "Hook timeout"): the plugins'
 * hooks of a session as the `hooks` option of an SDK query. The SDK pages carry no requirement ids,
 * so this is a judgment (spec/judgments.md), tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { HookCallbackMatcher, HookInput } from '../../src/protocol/official.ts';
import { sdkHooks } from '../../src/host/sdk-hooks.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';

const BASE = {
  session_id: SESSION.sessionId,
  transcript_path: SESSION.transcriptPath,
  cwd: SESSION.cwd,
  permission_mode: 'default',
} as const;

const preToolUse = (tool_name: string, tool_input: object): HookInput => ({
  ...BASE,
  hook_event_name: 'PreToolUse',
  tool_name,
  tool_input,
  tool_use_id: 't1',
});

const callOf = (matchers: readonly HookCallbackMatcher[] | undefined, input: HookInput) => {
  const callback = matchers?.[0]?.hooks[0];
  if (callback === undefined) throw new Error('no callback registered');
  return callback(input, 't1', { signal: signal() });
};

async function hooksWith(...runs: object[]) {
  const { host, runner } = await hostOf({ runs });
  const session = host.openSession(SESSION);
  return { hooks: sdkHooks(session), runner };
}

describe('sdkHooks', () => {
  test('registers one matcherless callback per official event', async () => {
    const { hooks } = await hooksWith();
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.PreToolUse?.[0]?.matcher).toBeUndefined();
    expect(Object.keys(hooks)).toContain('SessionEnd');
  });

  test('narrows to the events asked for', async () => {
    const { host } = await hostOf();
    const hooks = sdkHooks(host.openSession(SESSION), { events: ['PreToolUse'] });
    expect(Object.keys(hooks)).toEqual(['PreToolUse']);
  });

  test("a plugin's deny reaches the SDK as permissionDecision", async () => {
    const deny = {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'locked',
        },
      }),
    };
    const { hooks } = await hooksWith(deny);
    const output = await callOf(
      hooks.PreToolUse,
      preToolUse('Write', { file_path: '/work/app/a' }),
    );
    expect(output).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'locked',
      },
    });
  });

  test('a blocking exit 2 is a deny with its stderr as the reason', async () => {
    const { hooks } = await hooksWith({ exitCode: 2, stderr: 'no writes here' });
    const output = await callOf(
      hooks.PreToolUse,
      preToolUse('Write', { file_path: '/work/app/a' }),
    );
    expect(output).toMatchObject({
      decision: 'block',
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: 'no writes here',
      },
    });
  });

  test('a tool no matcher selects runs nothing and answers with no opinion', async () => {
    const { hooks, runner } = await hooksWith();
    const output = await callOf(hooks.PreToolUse, preToolUse('Read', { file_path: '/work/app/a' }));
    expect(runner.calls).toHaveLength(0);
    expect(output).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse' } });
  });

  test('an input the event refuses throws, so the SDK reports a failed callback', async () => {
    const { hooks } = await hooksWith();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the input is broken on purpose: no tool_name, which the SDK type requires
    const broken = { ...BASE, hook_event_name: 'PreToolUse' } as unknown as HookInput;
    let thrown: unknown;
    try {
      await callOf(hooks.PreToolUse, broken);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
  });

  test("the matcher's timeout is the longest handler limit of the event", async () => {
    const { hooks } = await hooksWith();
    // The audit plugin's PostToolUse http hook sets 5 seconds; the formatter's command hooks default to 600.
    expect(hooks.PostToolUse?.[0]?.timeout).toBe(5);
    expect(hooks.PreToolUse?.[0]?.timeout).toBe(600);
    expect(hooks.Stop?.[0]?.timeout).toBeUndefined();
  });
});
