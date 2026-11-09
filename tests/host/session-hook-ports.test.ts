/**
 * A host shared among sessions binds each session's own hook ports (the MCP caller here); the host's
 * ports stay for a session that gives none. A judgment, not compatibility (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { createPluginHost } from '../../src/host/index.ts';
import type { McpCaller } from '../../src/ports/mcp-caller.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { SESSION, signal } from '../support/host.ts';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';

const caller = (name: string, calls: string[]): McpCaller => ({
  ensureConnected: async () => 'connected',
  callTool: async () => {
    calls.push(name);
    return { isError: false, text: '' };
  },
});

const HOOKS: HooksSettings = {
  Stop: [{ hooks: [{ type: 'mcp_tool', server: 's', tool: 't', input: {} }] }],
};

function opened(calls: string[]) {
  const host = createPluginHost({
    plugins: [],
    ports: {
      commands: scriptedRunner(),
      locations: locations(),
      environment: fakeEnvironment(),
      mcp: caller('host', calls),
    },
  });
  return host;
}

test('a session with hookPorts calls its own MCP client; another keeps the host’s', async () => {
  const calls: string[] = [];
  const host = opened(calls);
  const own = host.openSession({
    ...SESSION,
    sessionId: 'a',
    hookPorts: { mcp: caller('a', calls) },
  });
  const plain = host.openSession({ ...SESSION, sessionId: 'b' });
  for (const session of [own, plain]) {
    session.addHooks('run', HOOKS, { kind: 'session', label: '[run]' });
    await session.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
  }
  expect(calls).toEqual(['a', 'host']);
});

test('a hookPorts MCP client makes mcp_tool hooks available on a host without one', async () => {
  const calls: string[] = [];
  const host = createPluginHost({
    plugins: [],
    ports: { commands: scriptedRunner(), locations: locations(), environment: fakeEnvironment() },
  });
  const session = host.openSession({ ...SESSION, hookPorts: { mcp: caller('own', calls) } });
  session.addHooks('run', HOOKS, { kind: 'session', label: '[run]' });
  await session.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
  expect(calls).toEqual(['own']);
});
