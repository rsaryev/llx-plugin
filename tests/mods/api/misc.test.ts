/** Also plugins/mods/api.md § Reach files, processes, and the network. */
/**
 * `$.plugin`, `$.env`, `$.mcp` and `$.telemetry` (`$.audio` is in audio.test.ts).
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

  test('the root is the directory the host reports for that plugin, asked once for each mod by its own name', async () => {
    const asked: string[] = [];
    const h = await apiHarness({
      plugin: 'first',
      ports: {
        locations: {
          homeDir: () => '/home/user',
          projectDir: () => '/work',
          pluginRoot: (id) => (asked.push(id), `/cache/${id}/1.2.0`),
          pluginData: (id) => Promise.resolve(`/data/${id}`),
          joinPath: (root, relative) => `${root}/${relative}`,
          existingDirectory: () => Promise.resolve(undefined),
        },
      },
    });
    const second = await h.mod('second', 'user', []);
    expect(h.api.plugin).toEqual({ name: 'first', root: '/cache/first/1.2.0' });
    expect(second.api.plugin).toEqual({ name: 'second', root: '/cache/second/1.2.0' });
    expect(asked).toEqual(['first', 'second']);
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

spec(
  [
    'mods.api.$.env',
    'mods.apiGuide.Reach files, processes, and the network',
    'mods.apiGuide.Reach files, processes, and the network.$.env',
  ],
  () => {
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
  },
);

const mcp = (connected: boolean, calls: unknown[] = []) => ({
  ensureConnected: () =>
    Promise.resolve(connected ? ('connected' as const) : ('unavailable' as const)),
  callTool: (call: unknown) => (calls.push(call), Promise.resolve(toolResult('answer'))),
});

spec(
  [
    'mods.api.$.mcp',
    'mods.apiGuide.Reach files, processes, and the network',
    'mods.apiGuide.Reach files, processes, and the network.$.mcp',
  ],
  () => {
    test('$.mcp has call and connect', async () => {
      const h = await apiHarness({ ports: { mcp: mcp(true) } });
      expectMethods(h.api.mcp, MODS_API.mcp);
    });

    test('call(server, tool, args) runs a tool on a connected MCP server and resolves to its content blocks', async () => {
      const calls: unknown[] = [];
      const h = await apiHarness({ ports: { mcp: mcp(true, calls) } });
      expect(await h.api.mcp.call('github', 'search', { q: 'x' })).toEqual({
        content: [{ type: 'text', text: 'answer' }],
        isError: false,
      });
      expect(calls[0]).toMatchObject({ server: 'github', tool: 'search', input: { q: 'x' } });
    });

    test('call answers the blocks and the structured result the host gives as they are', async () => {
      const content = [{ type: 'image', data: 'AA==', mimeType: 'image/png' }];
      const port = {
        ...mcp(true),
        callTool: () =>
          Promise.resolve({ isError: false, text: '', content, structuredContent: { n: 1 } }),
      };
      const h = await apiHarness({ ports: { mcp: port } });
      expect(await h.api.mcp.call('s', 't')).toEqual({
        content,
        isError: false,
        structuredContent: { n: 1 },
      });
    });

    test('call fires mcp.call with server, tool and args, args {} when absent', async () => {
      const h = await apiHarness({ ports: { mcp: mcp(true) } });
      const seen: unknown[] = [];
      await h.mod('watch', 'prepend', [
        fn('mcp.call', (_$, e) => (seen.push(e), { value: 'held' })),
      ]);
      await h.api.mcp.call('github', 'search');
      expect(seen).toEqual([{ server: 'github', tool: 'search', args: {} }]);
    });

    test('call on a server that is not connected rejects', async () => {
      const h = await apiHarness({ ports: { mcp: mcp(false) } });
      expect(await rejection(h.api.mcp.call('github', 'search'))).toContain(
        'MCP server "github" is not connected',
      );
    });

    test('a failure the port reports rejects with its message', async () => {
      const port = {
        ...mcp(true),
        callTool: () => Promise.resolve({ failure: 'timeout', message: 'the tool timed out' }),
      };
      const h = await apiHarness({ ports: { mcp: port } });
      expect(await rejection(h.api.mcp.call('s', 't'))).toContain('the tool timed out');
    });

    test('connect connects a server the plugin own manifest lists, answering the name call takes', async () => {
      const h = await apiHarness({
        ports: { mcp: mcp(true) },
        options: { ownMcpServers: () => ['mine'] },
      });
      expect(await h.api.mcp.connect('mine')).toEqual({ isConnected: true, server: 'mine' });
    });

    test('connect for a server the manifest does not list resolves unlisted without asking the host', async () => {
      let asked = 0;
      const port = {
        ...mcp(true),
        ensureConnected: () => ((asked += 1), Promise.resolve('connected' as const)),
      };
      const h = await apiHarness({
        ports: { mcp: port },
        options: { ownMcpServers: () => ['mine'] },
      });
      expect(await h.api.mcp.connect('github')).toEqual({
        isConnected: false,
        reason: 'unlisted',
        message: '"github" is not an MCP server of the plugin my-mod',
      });
      expect(asked).toBe(0);
    });

    test('connect to a server that cannot start resolves isConnected false, reason failed', async () => {
      const h = await apiHarness({
        ports: { mcp: mcp(false) },
        options: { ownMcpServers: () => ['mine'] },
      });
      expect(await h.api.mcp.connect('mine')).toEqual({
        isConnected: false,
        reason: 'failed',
        message: 'MCP server "mine" did not connect',
      });
    });
  },
);

const sink = () => {
  const sent: unknown[] = [];
  return {
    sent,
    log: (record: unknown) => (sent.push(['log', record]), Promise.resolve()),
    mark: (feature: string, mark?: unknown) => (
      sent.push(['mark', feature, mark]),
      Promise.resolve()
    ),
  };
};

spec('mods.api.$.telemetry', () => {
  test('$.telemetry has log and mark', async () => {
    const h = await apiHarness({ ports: { telemetry: sink() } });
    expectMethods(h.api.telemetry, MODS_API.telemetry);
  });

  test('a call by a mod built into Claude Code sends the record, to anthropic when it names no to', async () => {
    const telemetry = sink();
    const h = await apiHarness({ plugin: 'sec-default', tier: 'builtin', ports: { telemetry } });
    await h.api.telemetry.log({ event: 'guard', props: { count: 1 } });
    await h.api.telemetry.mark({ feature: 'guard', kind: 'sad', reason: 'blocked' });
    expect(telemetry.sent).toEqual([
      ['log', { event: 'guard', props: { count: 1 }, to: 'anthropic' }],
      ['mark', 'guard', { feature: 'guard', kind: 'sad', reason: 'blocked' }],
    ]);
  });

  test('a hook with the { to: "collector" } filter sees the record and next(e) sends it', async () => {
    const telemetry = sink();
    const seen: unknown[] = [];
    const h = await apiHarness({ plugin: 'sec-default', tier: 'builtin', ports: { telemetry } });
    await h.mod('observer', 'prepend', [
      fn('telemetry.mark', (_$, e, next) => (seen.push(e), next(e)), {
        matcher: { to: 'collector' },
      }),
    ]);
    await h.api.telemetry.mark({ feature: 'guard_used', kind: 'ok' });
    expect(seen).toEqual([{ to: 'collector', feature: 'guard_used', kind: 'ok' }]);
    expect(telemetry.sent).toEqual([['mark', 'guard_used', { feature: 'guard_used', kind: 'ok' }]]);
  });

  test('a telemetry hook that answers { deny } keeps the record from being sent', async () => {
    const telemetry = sink();
    const h = await apiHarness({ plugin: 'sec-default', tier: 'builtin', ports: { telemetry } });
    await h.mod('privacy', 'prepend', [
      fn('telemetry.log', () => ({ deny: 'no telemetry here' }), { matcher: { to: 'collector' } }),
    ]);
    const record = {
      to: 'collector',
      event: 'x',
      attributes: {},
      loggedAt: '2026-01-01T00:00:00Z',
    };
    expect(await rejection(h.api.telemetry.log(record))).toContain('no telemetry here');
    expect(telemetry.sent).toEqual([]);
  });

  test('a call by any other mod sends nothing and does not reject', async () => {
    const telemetry = sink();
    for (const tier of ['prepend', 'user', 'append'] as const) {
      const h = await apiHarness({ tier, ports: { telemetry } });
      await h.api.telemetry.log({ event: 'x' });
      await h.api.telemetry.mark({ feature: 'x', kind: 'ok' });
    }
    expect(telemetry.sent).toEqual([]);
  });
});
