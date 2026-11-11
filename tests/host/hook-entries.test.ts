/**
 * `session.hookEntries()` (hooks.md, "The `/hooks` menu": a read-only browser that labels each hook
 * with where it comes from) and per-turn `ports` (a host binds the ports of the run it serves).
 * Integration tests of the host, outside `spec()`: the docs describe Claude Code's menu, not this
 * API. The rows are in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { createPluginHost } from '../../src/host/index.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import type { McpCaller } from '../../src/ports/mcp-caller.ts';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { layerOf } from '../support/settings-layers.ts';

const guard = (command: string): HooksSettings => ({
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }],
});

describe('session.hookEntries', () => {
  test('lists plugin hooks, settings hooks and added hooks with where each came from', async () => {
    const settings = createPolicyView([
      layerOf('user', { hooks: guard('./user.sh') }),
      layerOf('project', { hooks: guard('./project.sh') }),
    ]);
    const { host } = await hostOf({ settings });
    const session = host.openSession(SESSION);
    session.addHooks('run:1', guard('./run.sh'), { kind: 'session', label: '[run]' });
    const entries = session.hookEntries();
    const sources = entries.map((entry) => `${entry.source.kind}:${entry.source.scope ?? ''}`);
    expect(sources.filter((source) => source.startsWith('plugin'))).not.toHaveLength(0);
    expect(sources).toContain('settings:user');
    expect(sources).toContain('settings:project');
    expect(sources.at(-1)).toBe('session:');
    const own = entries.find((entry) => entry.source.kind === 'session');
    expect(own?.event).toBe('PreToolUse');
    expect(own?.matcher).toBe('Bash');
    expect(own?.handler.type === 'command' && own.handler.command).toBe('./run.sh');
  });

  test('lists a handler written in several settings files once', async () => {
    const settings = createPolicyView([
      layerOf('project', { hooks: guard('./same.sh') }),
      layerOf('user', { hooks: guard('./same.sh') }),
    ]);
    const { host } = await hostOf({ plugins: [], settings });
    const commands = host
      .openSession(SESSION)
      .hookEntries()
      .map((entry) => entry.handler.type === 'command' && entry.handler.command);
    expect(commands).toEqual(['./same.sh']);
  });

  test('leaves out what the gates silence, and what a handle removed', async () => {
    const off = createPolicyView([layerOf('user', { disableAllHooks: true })]);
    const silent = await hostOf({ settings: off });
    const closed = silent.host.openSession(SESSION);
    closed.addHooks('run:1', guard('./run.sh'), { kind: 'session', label: '[run]' });
    expect(closed.hookEntries()).toEqual([]);

    const { host } = await hostOf({ plugins: [] });
    const session = host.openSession(SESSION);
    const handle = session.addHooks('run:1', guard('./run.sh'), {
      kind: 'session',
      label: '[run]',
    });
    expect(session.hookEntries()).toHaveLength(1);
    handle.remove();
    expect(session.hookEntries()).toEqual([]);
  });

  test('leaves out a handler of a type its event does not support', async () => {
    const { host } = await hostOf({ plugins: [] });
    const session = host.openSession(SESSION);
    session.addHooks(
      'run:1',
      { Notification: [{ hooks: [{ type: 'prompt', prompt: 'review' }] }] },
      { kind: 'session', label: '[run]' },
    );
    expect(session.hookEntries()).toEqual([]);
  });
});

const caller = (name: string, calls: string[]): McpCaller => ({
  ensureConnected: async () => 'connected',
  callTool: async () => {
    calls.push(name);
    return { isError: false, text: '' };
  },
});

describe('withTurn({ ports })', () => {
  test('a turn binds the ports of its run; the session keeps the ones it was opened with', async () => {
    const calls: string[] = [];
    const host = createPluginHost({
      plugins: [],
      ports: { commands: scriptedRunner(), locations: locations(), environment: fakeEnvironment() },
    });
    const session = host.openSession({ ...SESSION, ports: { mcp: caller('session', calls) } });
    session.addHooks(
      'run',
      { Stop: [{ hooks: [{ type: 'mcp_tool', server: 's', tool: 't', input: {} }] }] },
      { kind: 'session', label: '[run]' },
    );
    const turn = session.withTurn({ ports: { mcp: caller('turn', calls) } });
    await turn.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
    await session.dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
    await session.withTurn({}).dispatch('Stop', { stop_hook_active: false }, { signal: signal() });
    expect(calls).toEqual(['turn', 'session', 'session']);
  });
});
