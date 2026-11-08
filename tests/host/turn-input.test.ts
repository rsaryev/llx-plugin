/**
 * The session fields a hook reports (hooks.md, "Common input fields": `prompt_id`,
 * `scratchpad_dir`, `agent_id`, `agent_type`; "Hooks in skills and agents": the frontmatter hooks
 * of a project subagent run only after the workspace trust dialog was accepted for the folder).
 * They come from `SessionOptions` and a turn replaces them. Integration tests of the host, outside
 * `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import type { SessionOptions } from '../../src/host/session-types.ts';
import type { TurnOptions } from '../../src/host/turn.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';

const write = {
  tool_name: 'Write',
  tool_input: { file_path: '/work/app/a.ts' },
  tool_use_id: 't1',
};

const stdinOf = (calls: readonly { readonly stdin?: string }[], at: number) =>
  JSON.parse(calls[at]?.stdin ?? '{}');

const SUBAGENT = { id: 'agent-abc123', type: 'security-reviewer' };

describe('promptId, scratchpadDir and agent reach the hook input', () => {
  test('from SessionOptions', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    await host
      .openSession({
        ...SESSION,
        promptId: '550e8400-e29b-41d4-a716-446655440000',
        scratchpadDir: '/tmp/claude-1000/app/abc123/scratchpad',
        agent: SUBAGENT,
      })
      .dispatch('PreToolUse', write, { signal: signal() });
    expect(stdinOf(runner.calls, 0)).toMatchObject({
      prompt_id: '550e8400-e29b-41d4-a716-446655440000',
      scratchpad_dir: '/tmp/claude-1000/app/abc123/scratchpad',
      agent_id: 'agent-abc123',
      agent_type: 'security-reviewer',
    });
  });

  test('absent, the input has none of the four ("Absent until the first user input")', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    await host.openSession(SESSION).dispatch('PreToolUse', write, { signal: signal() });
    const input = stdinOf(runner.calls, 0);
    for (const field of ['prompt_id', 'scratchpad_dir', 'agent_id', 'agent_type']) {
      expect(input).not.toHaveProperty(field);
    }
  });

  test('from withTurn, over the session, and the session itself is unchanged', async () => {
    const { host, runner } = await hostOf({ runs: [{}, {}, {}] });
    const session = host.openSession({
      ...SESSION,
      promptId: 'prompt-1',
      scratchpadDir: '/tmp/scratch-1',
    });
    await session
      .withTurn({ promptId: 'prompt-2', agent: SUBAGENT })
      .dispatch('PreToolUse', write, { signal: signal() });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(stdinOf(runner.calls, 0)).toMatchObject({
      prompt_id: 'prompt-2',
      scratchpad_dir: '/tmp/scratch-1',
      agent_id: 'agent-abc123',
      agent_type: 'security-reviewer',
    });
    const after = stdinOf(runner.calls, 1);
    expect(after).toMatchObject({ prompt_id: 'prompt-1', scratchpad_dir: '/tmp/scratch-1' });
    expect(after).not.toHaveProperty('agent_id');
  });

  test('an agent of a turn replaces the session agent whole', async () => {
    const { host, runner } = await hostOf({ runs: [{}] });
    const session = host.openSession({ ...SESSION, agent: SUBAGENT });
    await session
      .withTurn({ agent: { type: 'Explore' } })
      .dispatch('PreToolUse', write, { signal: signal() });
    const input = stdinOf(runner.calls, 0);
    expect(input).toMatchObject({ agent_type: 'Explore' });
    expect(input).not.toHaveProperty('agent_id');
  });
});

async function agentHookRuns(options: SessionOptions, turn: TurnOptions = {}): Promise<number> {
  const { host, runner } = await hostOf({ plugins: [], runs: [{}] });
  const session = host.openSession(options);
  session.addHooks(
    'agent:reviewer',
    { PreToolUse: [{ hooks: [{ type: 'command', command: './agent.sh' }] }] },
    { kind: 'agent', label: '[agent]', scope: 'project' },
  );
  await session.withTurn(turn).dispatch('PreToolUse', write, { signal: signal() });
  return runner.calls.length;
}

/**
 * `folderTrustAccepted` gates the frontmatter hooks of a project subagent, registered here through
 * `session.addHooks`; the turn view sees what the session registered.
 */
describe('folderTrustAccepted reaches the hook gates', () => {
  test('a project subagent hook does not run without it, not even in a trusted `-p` session', async () => {
    expect(await agentHookRuns({ ...SESSION, interactive: false, trusted: true })).toBe(0);
  });

  test('it runs when SessionOptions carries it', async () => {
    expect(await agentHookRuns({ ...SESSION, folderTrustAccepted: true })).toBe(1);
  });

  test('it runs when the turn carries it, and not when the turn takes it back', async () => {
    expect(await agentHookRuns(SESSION, { folderTrustAccepted: true })).toBe(1);
    expect(
      await agentHookRuns(
        { ...SESSION, folderTrustAccepted: true },
        { folderTrustAccepted: false },
      ),
    ).toBe(0);
  });
});
