/**
 * Run- and agent-scoped hooks (hooks.md, "Hooks in skills and agents": frontmatter hooks of an agent
 * are "scoped to the agent's lifecycle", a skill's hooks replace and are removed with `once`;
 * "Hook locations": the source decides the gates): `session.addHooks`, `removeHooks`, the `turn`
 * lifetime ended by `runScoped`. Integration tests of the host, outside `spec()`: the docs describe
 * Claude Code, not this API. The lifetime and visibility rules are rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';

const bash = { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't1' };

const guard = (command: string): HooksSettings => ({
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }],
});

const AGENT = { kind: 'agent', label: '[agent]' } as const;

const commandsRun = (runner: { calls: readonly { spec: { command?: string } }[] }) =>
  runner.calls.map((call) => call.spec.command);

async function opened() {
  const fixture = await hostOf({ plugins: [], runs: Array.from({ length: 12 }, () => ({})) });
  return { ...fixture, session: fixture.host.openSession(SESSION) };
}

describe('session.addHooks', () => {
  test('an agent hook fires only while registered', async () => {
    const { session, runner } = await opened();
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
    const handle = session.addHooks('agent:reviewer', guard('./agent.sh'), AGENT);
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['./agent.sh']);
    handle.remove();
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
  });

  test('registering the same prefix again replaces the hooks, never stacks them', async () => {
    const { session, runner } = await opened();
    session.addHooks('agent:reviewer', guard('./first.sh'), AGENT);
    session.addHooks('agent:reviewer', guard('./second.sh'), AGENT);
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['./second.sh']);
  });

  test('different prefixes live side by side, and removal by prefix leaves the other', async () => {
    const { session, runner } = await opened();
    session.addHooks('agent:a', guard('./a.sh'), AGENT);
    session.addHooks('agent:a:b', guard('./ab.sh'), AGENT);
    session.removeHooks('agent:a');
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['./ab.sh']);
  });

  test('removeHooks of an unknown prefix does nothing', async () => {
    const { session, runner } = await opened();
    session.addHooks('agent:a', guard('./a.sh'), AGENT);
    session.removeHooks('agent:zzz');
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
  });

  test('the handle of a replaced registration no longer removes the hooks that replaced it', async () => {
    const { session, runner } = await opened();
    const first = session.addHooks('agent:a', guard('./first.sh'), AGENT);
    session.addHooks('agent:a', guard('./second.sh'), AGENT);
    first.remove();
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['./second.sh']);
  });

  test("a registration is the session's: a view of another turn sees it", async () => {
    const { session, runner } = await opened();
    session.addHooks('agent:a', guard('./a.sh'), AGENT);
    await session.withTurn({ permissionMode: 'plan' }).dispatch('PreToolUse', bash, {
      signal: signal(),
    });
    expect(runner.calls).toHaveLength(1);
  });

  test('the source decides the gates: a project agent needs the folder trusted, a session source does not', async () => {
    const { session, runner } = await opened();
    session.addHooks('agent:p', guard('./project-agent.sh'), { ...AGENT, scope: 'project' });
    session.addHooks('run:r', guard('./run.sh'), { kind: 'session', label: '[session]' });
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['./run.sh']);
    await session
      .withTurn({ folderTrustAccepted: true })
      .dispatch('PreToolUse', bash, { signal: signal() });
    expect(commandsRun(runner).slice(1)).toEqual(['./project-agent.sh', './run.sh']);
  });

  test('hooks for an event name the official union does not know register nothing', async () => {
    const { session, runner } = await opened();
    // `HooksSettings` is keyed by any string, so a typed literal reaches the registration unparsed.
    session.addHooks('agent:a', { NotAnEvent: [{ hooks: [] }] }, AGENT);
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
  });
});

describe('the turn lifetime', () => {
  test('hooks of lifetime `turn` are dropped when runScoped ends, with its result returned', async () => {
    const { session, runner } = await opened();
    const result = await session.runScoped({ promptId: 'p1' }, async (turn) => {
      turn.addHooks('agent:a', guard('./a.sh'), AGENT, { lifetime: 'turn' });
      await turn.dispatch('PreToolUse', bash, { signal: signal() });
      return 'answer';
    });
    expect(result).toBe('answer');
    expect(runner.calls).toHaveLength(1);
    await session.dispatch('PreToolUse', bash, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });

  test('they are dropped when the callback throws, and the error reaches the caller', async () => {
    const { session } = await opened();
    const failed = await session
      .runScoped({}, async (turn) => {
        turn.addHooks('agent:a', guard('./a.sh'), AGENT, { lifetime: 'turn' });
        throw new Error('turn failed');
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failed).toEqual(new Error('turn failed'));
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });

  test('a view kept past the callback refuses `turn` registrations, which nothing would end', async () => {
    const { session } = await opened();
    const kept = await session.runScoped({}, async (turn) => turn);
    expect(() =>
      kept.addHooks('agent:late', guard('./late.sh'), AGENT, { lifetime: 'turn' }),
    ).toThrow('has ended');
    expect(session.hasHooks('PreToolUse')).toBe(false);
    kept.addHooks('agent:late', guard('./late.sh'), AGENT);
    expect(session.hasHooks('PreToolUse')).toBe(true);
  });

  test('session-lifetime hooks added in a scoped turn stay after it', async () => {
    const { session } = await opened();
    await session.runScoped({}, async (turn) => {
      turn.addHooks('run:keep', guard('./keep.sh'), AGENT);
      turn.addHooks('run:drop', guard('./drop.sh'), AGENT, { lifetime: 'turn' });
    });
    expect(session.hasHooks('PreToolUse')).toBe(true);
    session.removeHooks('run:keep');
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });

  test('a turn-lifetime registration replaced by a session one by the same prefix is not dropped at the end', async () => {
    const { session } = await opened();
    await session.runScoped({}, async (turn) => {
      turn.addHooks('agent:a', guard('./a.sh'), AGENT, { lifetime: 'turn' });
      session.addHooks('agent:a', guard('./later.sh'), AGENT);
    });
    expect(session.hasHooks('PreToolUse')).toBe(true);
  });

  test('the scoped view keeps the turn fields, and a view made from it stays scoped', async () => {
    const { session, runner } = await opened();
    await session.runScoped({ permissionMode: 'plan' }, async (turn) => {
      turn.withTurn({ promptId: 'p2' }).addHooks('agent:a', guard('./a.sh'), AGENT, {
        lifetime: 'turn',
      });
      await turn.dispatch('PreToolUse', bash, { signal: signal() });
    });
    const input: unknown = JSON.parse(runner.calls[0]?.stdin ?? '{}');
    expect(input).toMatchObject({ permission_mode: 'plan' });
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });

  test('two scoped turns with distinct prefixes drop only their own hooks', async () => {
    const { session } = await opened();
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const slow = session.runScoped({}, async (turn) => {
      turn.addHooks('agent:slow', guard('./slow.sh'), AGENT, { lifetime: 'turn' });
      await gate;
    });
    await session.runScoped({}, async (turn) => {
      turn.addHooks('agent:fast', guard('./fast.sh'), AGENT, { lifetime: 'turn' });
    });
    expect(session.hasHooks('PreToolUse')).toBe(true);
    release();
    await slow;
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });

  test('lifetime `turn` outside runScoped is refused, since nothing would end it', async () => {
    const { session } = await opened();
    expect(() => session.addHooks('agent:a', guard('./a.sh'), AGENT, { lifetime: 'turn' })).toThrow(
      /runScoped/,
    );
    expect(session.hasHooks('PreToolUse')).toBe(false);
  });
});
