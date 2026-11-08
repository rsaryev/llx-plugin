/**
 * plugins/components.md § Default settings ("Two keys take effect, `agent` and `subagentStatusLine`";
 * the three rules for a key set in more than one place: File over manifest, User settings over plugin
 * defaults, Two plugins set the same key; "`claude --debug` logs `overrides setting`").
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../../src/index.ts';
import { pluginDefaultsOf, valueWithPluginDefaults } from '../../../src/settings/general/index.ts';
import { hooksFile, json } from '../../support/plugin-folder.ts';
import { memoryFiles } from '../../support/ports.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const load = async (tree: Record<string, string>) => {
  const { plugin } = await loadPlugin({ files: memoryFiles(tree), fallbackName: 'p' });
  return plugin?.settings ?? {};
};

spec('settings.components.Default settings.File over manifest', () => {
  const manifest = (settings: unknown) => ({
    '.claude-plugin/plugin.json': json({ name: 'p', settings }),
  });

  test('when both exist and settings.json sets at least one supported key, settings.json applies and the manifest settings is ignored', async () => {
    const settings = await load({
      ...manifest({
        agent: 'from-manifest',
        subagentStatusLine: { type: 'command', command: 'm' },
      }),
      'settings.json': json({ agent: 'from-file' }),
    });
    expect(settings).toEqual({ agent: 'from-file' });
  });

  test('a settings.json with no supported key does not win: the manifest applies', async () => {
    const settings = await load({
      ...manifest({ agent: 'from-manifest' }),
      'settings.json': json({ model: 'opus' }),
    });
    expect(settings).toEqual({ agent: 'from-manifest' });
  });

  test('with only the manifest key, the inline object is the plugin defaults; with only the file, the file is', async () => {
    expect(await load(manifest({ agent: 'inline' }))).toEqual({ agent: 'inline' });
    expect(
      await load({ 'settings.json': json({ agent: 'file' }), 'hooks/hooks.json': hooksFile('x') }),
    ).toEqual({
      agent: 'file',
    });
  });

  test('keys of the manifest are never mixed into the file: a key only the manifest sets is dropped', async () => {
    const settings = await load({
      ...manifest({ subagentStatusLine: { type: 'command', command: 'm' } }),
      'settings.json': json({ agent: 'from-file' }),
    });
    expect(settings.subagentStatusLine).toBeUndefined();
  });
});

spec('settings.components.Default settings.User settings over plugin defaults', () => {
  const defaults = pluginDefaultsOf([{ name: 'p', settings: { agent: 'plugin-agent' } }]);

  test('plugin defaults apply when no settings source sets the key', () => {
    expect(valueWithPluginDefaults(viewOf(), 'agent', defaults)).toBe('plugin-agent');
  });

  test('a user agent in ~/.claude/settings.json overrides the plugin', () => {
    expect(valueWithPluginDefaults(viewOf(['user', { agent: 'mine' }]), 'agent', defaults)).toBe(
      'mine',
    );
  });

  test('plugin defaults are the lowest layer across every settings source', () => {
    for (const scope of ['user', 'project', 'local', 'managed', 'flag'] as const) {
      expect(valueWithPluginDefaults(viewOf([scope, { agent: scope }]), 'agent', defaults)).toBe(
        scope,
      );
    }
  });

  test('the same holds for subagentStatusLine', () => {
    const line = { type: 'command', command: 'plugin' } as const;
    const withLine = pluginDefaultsOf([{ name: 'p', settings: { subagentStatusLine: line } }]);
    expect(valueWithPluginDefaults(viewOf(), 'subagentStatusLine', withLine)).toEqual(line);
    expect(
      valueWithPluginDefaults(
        viewOf(['user', { subagentStatusLine: { type: 'command', command: 'mine' } }]),
        'subagentStatusLine',
        withLine,
      ),
    ).toEqual({ type: 'command', command: 'mine' });
  });

  test('a key a source holds with an invalid value is dropped on read, so the plugin default shows through', () => {
    expect(valueWithPluginDefaults(viewOf(['user', { agent: 3 }]), 'agent', defaults)).toBe(
      'plugin-agent',
    );
  });
});

spec('settings.components.Default settings.Two plugins set the same key', () => {
  test('the value from the plugin loaded last applies', () => {
    const defaults = pluginDefaultsOf([
      { name: 'first', settings: { agent: 'a' } },
      { name: 'second', settings: { agent: 'b' } },
    ]);
    expect(defaults.settings).toEqual({ agent: 'b' });
    expect(valueWithPluginDefaults(viewOf(), 'agent', defaults)).toBe('b');
  });

  test('the other key still comes from the plugin that set it', () => {
    const line = { type: 'command', command: 'x' } as const;
    const defaults = pluginDefaultsOf([
      { name: 'first', settings: { agent: 'a', subagentStatusLine: line } },
      { name: 'second', settings: { agent: 'b' } },
    ]);
    expect(defaults.settings).toEqual({ agent: 'b', subagentStatusLine: line });
  });

  describe('claude --debug logs overrides setting', () => {
    test('one line per overridden key, naming both plugins', () => {
      const defaults = pluginDefaultsOf([
        { name: 'first', settings: { agent: 'a' } },
        { name: 'second', settings: { agent: 'b' } },
        { name: 'third', settings: { agent: 'c' } },
      ]);
      expect(defaults.debug).toHaveLength(2);
      expect(defaults.debug[0]).toBe(
        'Plugin "second" overrides setting "agent" set by plugin "first"',
      );
      expect(defaults.debug[1]).toBe(
        'Plugin "third" overrides setting "agent" set by plugin "second"',
      );
    });

    test('no line when no plugin overrides another', () => {
      const line = { type: 'command', command: 'x' } as const;
      const defaults = pluginDefaultsOf([
        { name: 'first', settings: { agent: 'a' } },
        { name: 'second', settings: { subagentStatusLine: line } },
      ]);
      expect(defaults.debug).toEqual([]);
    });
  });

  test('a plugin that sets nothing changes nothing', () => {
    expect(pluginDefaultsOf([{ name: 'p', settings: {} }])).toEqual({ settings: {}, debug: [] });
  });

  describe('the load order is the order given', () => {
    test('reversing the list reverses the winner', () => {
      const plugins = [
        { name: 'one', settings: { agent: '1' } },
        { name: 'two', settings: { agent: '2' } },
      ];
      expect(pluginDefaultsOf(plugins).settings.agent).toBe('2');
      expect(pluginDefaultsOf(plugins.toReversed()).settings.agent).toBe('1');
    });
  });
});
