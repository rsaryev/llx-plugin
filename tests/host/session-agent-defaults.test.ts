/**
 * A plugin's default `agent` applied to the session's main-thread agent (plugins/components.md,
 * "Default settings": "Set `agent` to run one of the plugin's own agents as the main thread", "User
 * settings over plugin defaults", "Two plugins set the same key"; settings-reference.md, `agent`:
 * "`--agent` takes precedence over this key for one session"). End to end over the loader, the host
 * and `session.selectAgent`. Oracle 2.1.322 (`claude -p --plugin-dir`, the `init` event's `tools` and
 * `model` of the main thread): a plugin `settings.json` `{"agent":"solo"}` runs `pp:solo`; a user
 * `agent` or `--agent` wins over it; a user agent named `solo` wins over the plugin's own `pp:solo`.
 */
import { describe, expect, test } from 'bun:test';
import type { HostPlugin } from '../../src/host/index.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { agentFile, reload } from '../support/agent-host.ts';
import { loaded } from '../support/host.ts';
import { HOME, folderHostOf } from '../support/scan.ts';
import { layerOf } from '../support/settings-layers.ts';
import { spec } from '../support/spec.ts';

const json = (value: unknown): string => JSON.stringify(value);

async function pluginWith(name: string, settings: unknown, agents: readonly string[]) {
  const files: Record<string, string> = {
    '.claude-plugin/plugin.json': json({ name }),
    'settings.json': json(settings),
  };
  for (const agent of agents) files[`agents/${agent}.md`] = agentFile(agent);
  const plugin = await loaded(files);
  return { id: `${name}@market`, plugin } satisfies HostPlugin;
}

const userSettings = (raw: Record<string, unknown>) => createPolicyView([layerOf('user', raw)]);

spec('settings.components.Default settings.User settings over plugin defaults', () => {
  test('a plugin settings.json agent runs that plugin agent as the main thread', async () => {
    const plugins = [await pluginWith('pp', { agent: 'solo' }, ['solo', 'other'])];
    const { session } = folderHostOf({}, { plugins });
    const chosen = session.selectAgent({});
    expect(chosen.ok && [chosen.agent?.name, chosen.from, chosen.plugin]).toEqual([
      'pp:solo',
      'plugin',
      'pp@market',
    ]);
  });

  test("a user's own agent in ~/.claude/settings.json overrides the plugin's", async () => {
    const plugins = [await pluginWith('pp', { agent: 'solo' }, ['solo', 'other'])];
    const { session } = folderHostOf({}, { plugins, settings: userSettings({ agent: 'other' }) });
    const chosen = session.selectAgent({});
    expect(chosen.ok && [chosen.agent?.name, chosen.from, chosen.plugin]).toEqual([
      'pp:other',
      'setting',
      undefined,
    ]);
  });

  test('a session with settings of its own reads the agent from them', async () => {
    const plugins = [await pluginWith('pp', { agent: 'solo' }, ['solo', 'other'])];
    const { host } = folderHostOf({}, { plugins });
    const session = host.openSession({
      sessionId: 's',
      transcriptPath: '/t',
      cwd: '/work/app',
      permissionMode: 'default',
      settings: userSettings({ agent: 'other' }),
    });
    const chosen = session.selectAgent({});
    expect(chosen.ok && chosen.from).toBe('setting');
  });

  test('a disabled plugin sets nothing', async () => {
    const plugins = [{ ...(await pluginWith('pp', { agent: 'solo' }, ['solo'])), enabled: false }];
    const { session } = folderHostOf({}, { plugins });
    expect(session.selectAgent({})).toEqual({ ok: true, agent: undefined });
    expect(session.pluginDefaults().settings).toEqual({});
  });
});

spec('settings.key.agent', () => {
  test('--agent takes precedence over the setting and over a plugin default', async () => {
    const plugins = [await pluginWith('pp', { agent: 'solo' }, ['solo', 'other'])];
    const { session } = folderHostOf({}, { plugins, settings: userSettings({ agent: 'solo' }) });
    const chosen = session.selectAgent({ flag: 'other' });
    expect(chosen.ok && [chosen.agent?.name, chosen.from]).toEqual(['pp:other', 'flag']);
  });
});

spec('settings.components.Default settings.Two plugins set the same key', () => {
  test('the plugin loaded last applies, and the debug line says it overrides the other', async () => {
    const plugins = [
      await pluginWith('first', { agent: 'a' }, ['a']),
      await pluginWith('second', { agent: 'b' }, ['b']),
    ];
    const { session } = folderHostOf({}, { plugins });
    const chosen = session.selectAgent({});
    expect(chosen.ok && [chosen.agent?.name, chosen.plugin]).toEqual(['second:b', 'second@market']);
    const defaults = session.pluginDefaults();
    expect(defaults.owners.agent?.id).toBe('second@market');
    expect(defaults.debug).toEqual([
      'Plugin "second" overrides setting "agent" set by plugin "first"',
    ]);
  });
});

describe('the plugin default names an agent as the setting does (oracle 2.1.322, spec/judgments.md)', () => {
  test('a user agent of that exact name wins over the plugin agent of the same bare name', async () => {
    const plugins = [await pluginWith('pp', { agent: 'solo' }, ['solo'])];
    const { session } = folderHostOf(
      { [`${HOME}/.claude/agents/solo.md`]: agentFile('solo') },
      { plugins },
    );
    await reload(session);
    const chosen = session.selectAgent({});
    expect(chosen.ok && [chosen.agent?.name, chosen.from]).toEqual(['solo', 'plugin']);
  });

  test('a scoped name works too, and a name no agent has is refused like the setting', async () => {
    const scoped = folderHostOf(
      {},
      { plugins: [await pluginWith('pp', { agent: 'pp:solo' }, ['solo'])] },
    );
    const chosen = scoped.session.selectAgent({});
    expect(chosen.ok && chosen.agent?.name).toBe('pp:solo');
    const ghost = folderHostOf(
      {},
      { plugins: [await pluginWith('pp', { agent: 'ghost' }, ['solo'])] },
    );
    expect(ghost.session.selectAgent({})).toEqual({
      ok: false,
      message: 'No subagent named "ghost"',
      candidates: [],
    });
  });
});

describe('the plugin default subagentStatusLine', () => {
  const line = (command: string) => ({ type: 'command' as const, command });

  spec('settings.components.Default settings.User settings over plugin defaults', () => {
    test('a plugin line runs when no settings source sets one, naming the plugin; a user line wins', async () => {
      const plugins = [await pluginWith('pp', { subagentStatusLine: line('plugin') }, [])];
      const alone = folderHostOf({}, { plugins }).session.subagentStatusLine();
      expect(alone).toEqual({
        runs: { value: line('plugin'), plugin: expect.objectContaining({ id: 'pp@market' }) },
      });
      const user = userSettings({ subagentStatusLine: line('mine') });
      const mine = folderHostOf({}, { plugins, settings: user }).session.subagentStatusLine();
      expect(mine).toEqual({ runs: { value: line('mine'), scope: 'user' } });
    });
  });

  spec('settings.reference.Status line and file suggestion gates', () => {
    test("plugin values don't run under allowManagedHooksOnly, even when the plugin is force-enabled", async () => {
      const plugins = [await pluginWith('pp', { subagentStatusLine: line('plugin') }, [])];
      const settings = createPolicyView([
        layerOf('managed', { allowManagedHooksOnly: true, enabledPlugins: { 'pp@market': true } }),
      ]);
      const { session } = folderHostOf({}, { plugins, settings });
      expect(session.subagentStatusLine()).toEqual({ runs: undefined, skippedBecause: 'narrowed' });
    });

    test('an untrusted folder turns it off entirely', async () => {
      const plugins = [await pluginWith('pp', { subagentStatusLine: line('plugin') }, [])];
      const { session } = folderHostOf({}, { plugins, session: { trusted: false } });
      expect(session.subagentStatusLine()).toEqual({ runs: undefined, skippedBecause: 'off' });
      expect(session.subagentStatusLine({ folderTrusted: true }).runs?.value).toEqual(
        line('plugin'),
      );
    });
  });
});
