/**
 * The host update path (docs/API.md, "Host and sessions", "Updating"): `host.update` replaces the
 * plugins and the settings view, and a session opened before the call lists, expands, dispatches
 * and resolves over the new state without being reopened. Integration tests of the host over the
 * real loader and the fakes of the ports, outside `spec()`: the docs describe Claude Code, not this
 * API. What an update keeps is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';
import {
  BASH,
  bashGuard,
  commandsRun,
  hostPlugin,
  pluginOf,
  skillText,
} from '../support/update.ts';

const ALPHA = 'alpha@acme';
const BETA = 'beta@acme';

async function alpha() {
  return pluginOf('alpha', {
    skills: { hello: skillText('Say hello') },
    hooks: bashGuard('/bin/alpha-guard'),
    agents: { scout: 'Scout the repository.' },
    mcpServers: { store: { command: '/bin/alpha-store' } },
  });
}

async function beta() {
  return pluginOf('beta', {
    skills: { bye: skillText('Say goodbye') },
    hooks: bashGuard('/bin/beta-guard'),
    agents: { judge: 'Judge the diff.' },
    mcpServers: { cache: { command: '/bin/beta-cache' } },
  });
}

const servers = (command: string) => ({
  store: { command, args: ['${user_config.endpoint}'] },
});

const menuNames = (session: { skills(): { menu: readonly { name: string }[] } }) =>
  session.skills().menu.map((entry) => entry.name);

describe('host.update replaces the plugins of an open session', () => {
  test('skills() lists the new plugin and drops the replaced one, on the session opened before', async () => {
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    const session = host.openSession(SESSION);
    expect(menuNames(session)).toEqual(['alpha:hello']);
    host.update({ plugins: [hostPlugin(BETA, await beta())] });
    expect(menuNames(session)).toEqual(['beta:bye']);
  });

  test('expandSkill follows: the new skill expands, the dropped one is unknown', async () => {
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    const session = host.openSession(SESSION);
    host.update({ plugins: [hostPlugin(BETA, await beta())] });
    expect(await session.expandSkill('beta:bye', { signal: signal() })).toMatchObject({
      ok: true,
      text: 'Say goodbye',
    });
    expect(await session.expandSkill('alpha:hello', { signal: signal() })).toMatchObject({
      ok: false,
    });
  });

  test('the next dispatch runs the hooks of the new plugin only', async () => {
    const { host, runner } = await hostOf({
      plugins: [hostPlugin(ALPHA, await alpha())],
      runs: [{}, {}],
    });
    const session = host.openSession(SESSION);
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    host.update({ plugins: [hostPlugin(BETA, await beta())] });
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/alpha-guard', '/bin/beta-guard']);
  });

  test('agents, MCP servers and output resolution read the new plugins', async () => {
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    const session = host.openSession(SESSION);
    expect((await session.agents()).resolved.map((agent) => agent.name)).toEqual(['alpha:scout']);
    expect((await session.mcpServers()).resolved.map((server) => server.key)).toEqual([
      'plugin:alpha:store',
    ]);
    host.update({ plugins: [hostPlugin(BETA, await beta())] });
    expect((await session.agents()).resolved.map((agent) => agent.name)).toEqual(['beta:judge']);
    expect((await session.mcpServers()).resolved.map((server) => server.key)).toEqual([
      'plugin:beta:cache',
    ]);
  });

  test('a turn view made before the update reads the new state too', async () => {
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    const turn = host.openSession(SESSION).withTurn({ permissionMode: 'plan' });
    host.update({ plugins: [hostPlugin(BETA, await beta())] });
    expect(menuNames(turn)).toEqual(['beta:bye']);
  });

  test('a session opened after the update starts from the new state', async () => {
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    host.update({ plugins: [hostPlugin(BETA, await beta())] });
    expect(menuNames(host.openSession(SESSION))).toEqual(['beta:bye']);
  });

  test('plugins given again keep working: the same plugin object in a new list changes nothing', async () => {
    const first = await alpha();
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, first)] });
    const session = host.openSession(SESSION);
    host.update({ plugins: [hostPlugin(ALPHA, first), hostPlugin(BETA, await beta())] });
    expect(menuNames(session)).toEqual(['alpha:hello', 'beta:bye']);
  });
});

describe('host.update replaces the settings view of an open session', () => {
  test('enabledPlugins of the new settings turns a plugin off and on again', async () => {
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    const session = host.openSession(SESSION);
    host.update({
      settings: createPolicyView([layerOf('user', { enabledPlugins: { [ALPHA]: false } })]),
    });
    expect(menuNames(session)).toEqual([]);
    expect((await session.agents()).resolved).toEqual([]);
    host.update({ settings: createPolicyView([]) });
    expect(menuNames(session)).toEqual(['alpha:hello']);
  });

  test('the hooks of a settings file join and leave the next dispatch', async () => {
    const { host, runner } = await hostOf({ plugins: [], runs: [{}, {}] });
    const session = host.openSession(SESSION);
    const settings = createPolicyView([layerOf('user', { hooks: bashGuard('/bin/user-guard') })]);
    host.update({ settings });
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    host.update({ settings: createPolicyView([]) });
    await session.dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/user-guard']);
  });

  test('new userConfig values reach the servers an open session resolves', async () => {
    const plugin = await pluginOf('alpha', {
      userConfig: { endpoint: { type: 'string', title: 'Endpoint', description: 'Where' } },
      mcpServers: { store: { command: '/bin/store', args: ['${user_config.endpoint}'] } },
    });
    const { host } = await hostOf({
      plugins: [hostPlugin(ALPHA, plugin)],
      userConfig: { [ALPHA]: { endpoint: 'https://one.example' } },
    });
    const session = host.openSession(SESSION);
    host.update({ userConfig: { [ALPHA]: { endpoint: 'https://two.example' } } });
    expect((await session.mcpServers()).resolved[0]?.server).toMatchObject({
      args: ['https://two.example'],
    });
  });

  test('userConfig replaces the saved values of every plugin: one left out loses them', async () => {
    const declared = {
      endpoint: { type: 'string', title: 'Endpoint', description: 'Where' },
    };
    const one = await pluginOf('alpha', { userConfig: declared, mcpServers: servers('/bin/a') });
    const two = await pluginOf('beta', { userConfig: declared, mcpServers: servers('/bin/b') });
    const { host } = await hostOf({
      plugins: [hostPlugin(ALPHA, one), hostPlugin(BETA, two)],
      userConfig: {
        [ALPHA]: { endpoint: 'https://a-one.example' },
        [BETA]: { endpoint: 'https://b-one.example' },
      },
    });
    const session = host.openSession(SESSION);
    const argsOf = async () =>
      (await session.mcpServers()).resolved.map((entry) =>
        'args' in entry.server ? entry.server.args : undefined,
      );
    expect(await argsOf()).toEqual([['https://a-one.example'], ['https://b-one.example']]);
    host.update({ userConfig: { [ALPHA]: { endpoint: 'https://a-two.example' } } });
    // The value of beta is gone: its placeholder is left as written, not filled from before.
    expect(await argsOf()).toEqual([['https://a-two.example'], ['${user_config.endpoint}']]);
  });
});

describe('what host.update returns and what the host shows', () => {
  test('returns the new plugins and issues, and host.plugins and host.issues are live', async () => {
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    expect(host.plugins).toEqual([{ id: ALPHA, name: 'alpha', enabled: true }]);
    const result = host.update({
      plugins: [hostPlugin(BETA, await beta(), true), hostPlugin(ALPHA, await alpha(), false)],
    });
    expect(result.plugins).toEqual([
      { id: BETA, name: 'beta', enabled: true },
      { id: ALPHA, name: 'alpha', enabled: false },
    ]);
    expect(host.plugins).toEqual(result.plugins);
    expect(host.issues).toEqual(result.issues);
  });

  test('issues of the new plugins are reported, and gone when the plugin is replaced', async () => {
    const broken = await loaded({
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'broken' }),
      'agents/odd.md': '---\ndescription: "unclosed\n---\nBody',
    });
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    expect(host.issues).toEqual([]);
    const result = host.update({ plugins: [hostPlugin('broken@acme', broken)] });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(host.issues).toEqual(result.issues);
    expect(host.update({ plugins: [hostPlugin(ALPHA, await alpha())] }).issues).toEqual([]);
  });

  test('generation counts the updates, so a caller sees that one happened', async () => {
    const { host } = await hostOf({ plugins: [] });
    const start = host.generation;
    host.update({ settings: createPolicyView([]) });
    host.update({});
    expect(host.generation).toBe(start + 2);
  });

  test('a part left out, or given as undefined, stays what the host had', async () => {
    const { host } = await hostOf({ plugins: [hostPlugin(ALPHA, await alpha())] });
    host.update({ plugins: undefined, settings: createPolicyView([]) });
    expect(host.plugins.map((plugin) => plugin.id)).toEqual([ALPHA]);
    host.update({ plugins: [hostPlugin(BETA, await beta())] });
    expect(host.plugins.map((plugin) => plugin.id)).toEqual([BETA]);
  });

  test('the ports stay fixed: the runner given at creation runs the hooks after an update', async () => {
    const { host, runner } = await hostOf({
      plugins: [hostPlugin(ALPHA, await alpha())],
      runs: [{}],
    });
    host.update({ plugins: [hostPlugin(BETA, await beta())] });
    await host.openSession(SESSION).dispatch('PreToolUse', BASH, { signal: signal() });
    expect(commandsRun(runner)).toEqual(['/bin/beta-guard']);
  });
});
