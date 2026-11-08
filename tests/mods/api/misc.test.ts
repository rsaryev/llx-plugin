/**
 * `$.plugin`, `$.env`, `$.mcp`, `$.audio` and `$.telemetry`.
 * plugins/mods/reference.md § Mods API methods (`$.plugin`: this plugin's name and directory;
 * `$.mcp`: "`connect(server)` connects an MCP server that your own plugin's manifest lists";
 * `$.telemetry`: "A record is sent only when Claude Code or a built-in mod makes the call");
 * plugins/mods/api.md § Reach files, processes, and the network (`$.env` `get` and `set`, `$.mcp`
 * `call`); plugins/mods/reference.md § Telemetry (`{ to: 'collector' }`).
 */
import { expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods, toolResult } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

spec('mods.api.$.plugin', () => {
  test('$.plugin.name is the plugin name and $.plugin.root its directory', async () => {
    const h = await apiHarness({ plugin: 'my-mod' });
    expect(h.api.plugin).toEqual({ name: 'my-mod', root: '/plugins/my-mod' });
    expectMethods(h.api.plugin, MODS_API.plugin);
  });

  test('each mod gets its own name and root', async () => {
    const h = await apiHarness();
    const other = await h.mod('other-mod', 'user', []);
    expect(other.api.plugin).toEqual({ name: 'other-mod', root: '/plugins/other-mod' });
  });
});

const env = (vars: Record<string, string>) => ({
  get: (name: string) => vars[name],
  set: (name: string, value: string) => void (vars[name] = value),
  snapshot: () => ({ ...vars }),
});

spec('mods.api.$.env', () => {
  test('$.env has get and set; set is read back by get, and an unset variable is undefined', async () => {
    const h = await apiHarness({ ports: { env: env({ CI: 'true' }) } });
    expectMethods(h.api.env, MODS_API.env);
    expect(await h.api.env.get('CI')).toBe('true');
    expect(await h.api.env.get('NOPE')).toBeUndefined();
    await h.api.env.set('MODE', 'fast');
    expect(await h.api.env.get('MODE')).toBe('fast');
  });

  test('the event holds the name (and the value for set)', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { env: env({}) } });
    await h.mod('spy', 'prepend', [
      fn('env.get', (_$, e, next) => (seen.push(e), next(e))),
      fn('env.set', (_$, e, next) => (seen.push(e), next(e))),
    ]);
    await h.api.env.set('A', 'b');
    await h.api.env.get('A');
    expect(seen).toEqual([{ name: 'A', value: 'b' }, { name: 'A' }]);
  });

  test('a name or value that is not a string rejects', async () => {
    const h = await apiHarness({ ports: { env: env({}) } });
    expect(await rejection(h.api.env.get(1))).toContain('$.env.get');
    expect(await rejection(h.api.env.set('A', 1))).toContain('$.env.set');
  });
});

const mcp = (connected: boolean, calls: unknown[] = []) => ({
  ensureConnected: () =>
    Promise.resolve(connected ? ('connected' as const) : ('unavailable' as const)),
  callTool: (call: unknown) => (calls.push(call), Promise.resolve(toolResult('answer'))),
});

spec('mods.api.$.mcp', () => {
  test('$.mcp has call and connect', async () => {
    const h = await apiHarness({ ports: { mcp: mcp(true) } });
    expectMethods(h.api.mcp, MODS_API.mcp);
  });

  test('call runs a tool on a connected MCP server and resolves to its result', async () => {
    const calls: unknown[] = [];
    const h = await apiHarness({ ports: { mcp: mcp(true, calls) } });
    expect(await h.api.mcp.call({ server: 'github', tool: 'search', input: { q: 'x' } })).toEqual({
      isError: false,
      text: 'answer',
    });
    expect(calls[0]).toMatchObject({ server: 'github', tool: 'search', input: { q: 'x' } });
  });

  test('call on a server that is not connected rejects', async () => {
    const h = await apiHarness({ ports: { mcp: mcp(false) } });
    expect(await rejection(h.api.mcp.call({ server: 'github', tool: 'search' }))).toContain(
      'MCP server "github" is not connected',
    );
  });

  test('a failure the port reports rejects with its message', async () => {
    const port = {
      ...mcp(true),
      callTool: () => Promise.resolve({ failure: 'timeout', message: 'the tool timed out' }),
    };
    const h = await apiHarness({ ports: { mcp: port } });
    expect(await rejection(h.api.mcp.call({ server: 's', tool: 't' }))).toContain(
      'the tool timed out',
    );
  });

  test('connect connects a server the plugin own manifest lists', async () => {
    const h = await apiHarness({
      ports: { mcp: mcp(true) },
      options: { ownMcpServers: () => ['mine'] },
    });
    expect(await h.api.mcp.connect('mine')).toEqual({ isConnected: true });
  });

  test('connect for a server the manifest does not list rejects without asking the host', async () => {
    let asked = 0;
    const port = {
      ...mcp(true),
      ensureConnected: () => ((asked += 1), Promise.resolve('connected' as const)),
    };
    const h = await apiHarness({
      ports: { mcp: port },
      options: { ownMcpServers: () => ['mine'] },
    });
    expect(await rejection(h.api.mcp.connect('github'))).toContain(
      '"github" is not an MCP server of the plugin my-mod',
    );
    expect(asked).toBe(0);
  });

  test('connect to a server that cannot start resolves with isConnected false', async () => {
    const h = await apiHarness({
      ports: { mcp: mcp(false) },
      options: { ownMcpServers: () => ['mine'] },
    });
    expect(await h.api.mcp.connect('mine')).toEqual({ isConnected: false });
  });
});

spec('mods.api.$.audio', () => {
  test('$.audio has play and speak, which reach the host', async () => {
    const heard: unknown[] = [];
    const audio = {
      play: (request: unknown) => (heard.push(['play', request]), Promise.resolve()),
      speak: (text: string) => (heard.push(['speak', text]), Promise.resolve()),
    };
    const h = await apiHarness({ ports: { audio } });
    expectMethods(h.api.audio, MODS_API.audio);
    await h.api.audio.speak('build finished');
    await h.api.audio.play({ sound: 'done' });
    expect(heard).toEqual([
      ['speak', 'build finished'],
      ['play', { sound: 'done' }],
    ]);
  });

  test('speak with something that is not text rejects', async () => {
    const h = await apiHarness({
      ports: { audio: { play: () => Promise.resolve(), speak: () => Promise.resolve() } },
    });
    expect(await rejection(h.api.audio.speak(5))).toContain('$.audio.speak');
  });
});

const sink = () => {
  const sent: unknown[] = [];
  return {
    sent,
    log: (record: unknown) => (sent.push(['log', record]), Promise.resolve()),
    mark: (feature: string) => (sent.push(['mark', feature]), Promise.resolve()),
  };
};

spec('mods.api.$.telemetry', () => {
  test('$.telemetry has log and mark', async () => {
    const h = await apiHarness({ ports: { telemetry: sink() } });
    expectMethods(h.api.telemetry, MODS_API.telemetry);
  });

  test('a call by a mod built into Claude Code sends the record', async () => {
    const telemetry = sink();
    const h = await apiHarness({ plugin: 'sec-default', tier: 'builtin', ports: { telemetry } });
    await h.api.telemetry.log({ event: 'guard', count: 1 });
    await h.api.telemetry.mark('guard-used');
    expect(telemetry.sent).toEqual([
      ['log', { event: 'guard', count: 1 }],
      ['mark', 'guard-used'],
    ]);
  });

  test('a call by any other mod sends nothing and does not reject', async () => {
    const telemetry = sink();
    for (const tier of ['prepend', 'user', 'append'] as const) {
      const h = await apiHarness({ tier, ports: { telemetry } });
      await h.api.telemetry.log({ event: 'x' });
      await h.api.telemetry.mark('x');
    }
    expect(telemetry.sent).toEqual([]);
  });
});
