/**
 * One environment for everything a session resolves: its own ports (`SessionOptions.ports`, a turn's
 * over them) with the settings `env` Claude Code writes into its process. mcp.md § Environment
 * variable expansion in `.mcp.json` ("`${VAR}`: expands to the value of environment variable `VAR`");
 * env-vars.md § Set variables in settings files ("Claude Code writes each `env` entry into the process
 * environment, replacing the value inherited from the shell"); settings-reference.md § How `env`
 * values interact with your shell ("`NO_COLOR` and `FORCE_COLOR` set here reach only subprocesses");
 * sub-agents.md § Built-in subagents (`CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS`). That a session binds
 * its own environment port is a judgment (spec/judgments.md), so these run outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { hostPlugin } from '../support/host-update.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { layerOf } from '../support/settings-layers.ts';

const json = (value: unknown): string => JSON.stringify(value);

/** `env`: a stdio server and a monitor that read `${WHERE}` and `${NO_COLOR:-unset}`. */
const ENV_FILES: Record<string, string> = {
  '.claude-plugin/plugin.json': json({ name: 'env' }),
  '.mcp.json': json({
    mcpServers: { db: { command: 'db', args: ['${WHERE}', '${NO_COLOR:-unset}'] } },
  }),
  'monitors/monitors.json': json([{ name: 'log', command: 'tail ${WHERE}', description: 'Log' }]),
  'hooks/hooks.json': json({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'true' }] }] },
  }),
};

async function shared(settings?: Parameters<typeof createPolicyView>[0]) {
  return hostOf({
    plugins: [hostPlugin('env@inline', await loaded(ENV_FILES))],
    env: { WHERE: 'host' },
    runs: [{}],
    ...(settings === undefined ? {} : { settings: createPolicyView(settings) }),
  });
}

const argsOf = async (session: { mcpServers(): Promise<{ resolved: readonly unknown[] }> }) =>
  ((await session.mcpServers()).resolved[0] as { server: { args: readonly string[] } }).server.args;

describe("judgment: a session's ports feed its components as they feed its hooks", () => {
  test("a session's environment port answers ${VAR} in its MCP servers and monitors, and runs its hooks", async () => {
    const { host, runner } = await shared();
    const session = host.openSession({
      ...SESSION,
      ports: { environment: fakeEnvironment({ WHERE: 'session' }) },
    });
    expect(await argsOf(session)).toEqual(['session', 'unset']);
    const monitors = await session.monitors();
    expect(monitors.resolved[0]).toMatchObject({ command: 'tail session' });
    await session.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
    expect(runner.calls[0]?.env?.['WHERE']).toBe('session');
    expect(await argsOf(host.openSession(SESSION))).toEqual(['host', 'unset']);
  });

  test("a turn's environment port answers for that turn", async () => {
    const { host } = await shared();
    const session = host.openSession(SESSION);
    const turn = session.withTurn({ ports: { environment: fakeEnvironment({ WHERE: 'turn' }) } });
    expect(await argsOf(turn)).toEqual(['turn', 'unset']);
    expect(await argsOf(session)).toEqual(['host', 'unset']);
  });

  test("the built-in subagent switches read the session's environment", async () => {
    const { host } = await shared();
    const session = host.openSession({
      ...SESSION,
      ports: { environment: fakeEnvironment({ CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS: '1' }) },
    });
    const names = (await session.agents()).resolved.map((agent) => agent.name);
    expect(names).not.toContain('Explore');
    const hostNames = (await host.openSession(SESSION).agents()).resolved.map((a) => a.name);
    expect(hostNames).toContain('Explore');
  });
});

describe('the settings `env` is in the environment ${VAR} expands from', () => {
  test('a settings value replaces the shell’s; NO_COLOR reaches only the subprocess', async () => {
    const { host } = await shared([layerOf('user', { env: { WHERE: 'settings', NO_COLOR: '1' } })]);
    const session = host.openSession(SESSION);
    expect(await argsOf(session)).toEqual(['settings', 'unset']);
    expect(session.subprocessEnvironment('mcp')).toMatchObject({
      WHERE: 'settings',
      NO_COLOR: '1',
    });
  });

  test("a project file's value waits for workspace trust", async () => {
    const { host } = await shared([layerOf('project', { env: { WHERE: 'project' } })]);
    expect(await argsOf(host.openSession({ ...SESSION, trusted: false }))).toEqual([
      'host',
      'unset',
    ]);
    expect(await argsOf(host.openSession(SESSION))).toEqual(['project', 'unset']);
  });

  test('a session’s own settings give its own value', async () => {
    const { host } = await shared();
    const session = host.openSession({
      ...SESSION,
      settings: createPolicyView([layerOf('user', { env: { WHERE: 'own settings' } })]),
    });
    expect(await argsOf(session)).toEqual(['own settings', 'unset']);
  });

  test("an http hook's allowed variable reads the settings value", async () => {
    const { host, web } = await hostOf({
      plugins: [],
      env: { WHERE: 'host' },
      settings: createPolicyView([layerOf('user', { env: { WHERE: 'settings' } })]),
    });
    const session = host.openSession(SESSION);
    session.addHooks(
      'test',
      {
        Stop: [
          {
            hooks: [
              {
                type: 'http',
                url: 'https://hooks.example/stop',
                headers: { 'X-Where': '$WHERE' },
                allowedEnvVars: ['WHERE'],
              },
            ],
          },
        ],
      },
      { kind: 'session', label: 'test' },
    );
    await session.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
    expect(web.requests[0]?.headers).toMatchObject({ 'x-where': 'settings' });
  });
});
