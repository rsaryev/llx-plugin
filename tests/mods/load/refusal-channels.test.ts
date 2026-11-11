/**
 * plugins/mods/troubleshoot.md § A `claude -p` run prints `hooks module not loaded` and § Find out why a
 * mod does nothing (where the one line about a mod is read), § Messages from the built-in guard (a
 * refusal by another mod reaches "the transcript in a session that hot-reloads a plugin directory").
 */
import { expect, test } from 'bun:test';
import {
  createHotReloadGate,
  type ModPlugin,
  type ModsHostOptions,
} from '../../../src/mods/load/index.ts';
import { inline, installed, managed, modPlugin, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const register = (on: unknown): void => void on;

spec('mods.troubleshoot.A claude -p run prints hooks module not loaded', () => {
  const refusing = managed({ disableAllHooks: true });

  test('the line starts with the mod`s name and goes to stderr', async () => {
    const { host } = session(
      { 'first-mod': register },
      { policy: { ...refusing, flags: { pluginDirs: ['./first-mod'] } }, isInteractive: false },
    );
    const report = await host.load([modPlugin(inline('first-mod'), register)]);
    expect(report.notices).toEqual([
      {
        line: 'first-mod: hooks module not loaded: disableAllHooks in managed settings',
        channel: 'stderr',
      },
    ]);
  });

  test('an interactive session that hot-reloads the directory writes it to the transcript, any other one to the debug log only', async () => {
    const run = async (flags: string[]) => {
      const { host } = session(
        { 'first-mod': register },
        { policy: { ...refusing, flags: { pluginDirs: flags } } },
      );
      return (await host.load([modPlugin(inline('first-mod'), register)])).notices[0]?.channel;
    };
    expect(await run(['./first-mod'])).toBe('transcript');
    expect(await run([])).toBe('debug-log');
  });

  test('a refusal by another mod goes to the debug log only, even from a `claude -p` run with --plugin-dir', async () => {
    const guarded = {
      ...managed({
        pluginConfigs: {
          'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
        },
      }),
      flags: { pluginDirs: ['./first-mod'] },
    };
    const { host } = session({ 'first-mod': register }, { policy: guarded, isInteractive: false });
    const report = await host.load([modPlugin(inline('first-mod'), register)]);
    expect(report.notices.map((notice) => notice.channel)).toEqual(['debug-log']);
    expect(report.notices[0]?.line).toStartWith('first-mod: refused by cc-plugin-sec-default: ');
  });

  const guard = {
    pluginConfigs: { 'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } } },
  };
  const refusalChannels = async (
    plugin: ModPlugin,
    options: Partial<ModsHostOptions>,
    pluginDirs: string[] = [],
  ) => {
    const policyInput = { ...managed(guard), flags: { pluginDirs } };
    const { host } = session(
      { [plugin.candidate.name]: register },
      { policy: policyInput, ...options },
    );
    const report = await host.load([plugin]);
    return report.notices.map((notice) => notice.channel);
  };

  test('a refusal by another mod reaches the transcript of an interactive session that hot-reloads a plugin directory', async () => {
    const plugin = modPlugin(inline('first-mod'), register);
    expect(await refusalChannels(plugin, {}, ['./first-mod'])).toEqual(['transcript']);
  });

  test('so it does in one that hot-reloads the mods Claude wrote, and in no other interactive session it stays in the debug log', async () => {
    const plugin = modPlugin(installed('first-mod'), register);
    expect(await refusalChannels(plugin, { hotReload: () => true })).toEqual(['transcript']);
    expect(await refusalChannels(plugin, { hotReload: () => false })).toEqual(['debug-log']);
    expect(await refusalChannels(plugin, {})).toEqual(['debug-log']);
  });

  test('the answer to the hot-reloading question reaches the lines at once: they move from the debug log to the transcript', async () => {
    const gate = createHotReloadGate();
    const plugin = modPlugin(installed('first-mod'), register);
    const policyInput = managed(guard);
    const { host } = session(
      { 'first-mod': register },
      { policy: policyInput, hotReload: () => gate.enabled() },
    );
    const before = await host.load([plugin]);
    expect(before.notices.map((notice) => notice.channel)).toEqual(['debug-log']);
    gate.answered('enable');
    const after = await host.load([plugin]);
    expect(after.notices.map((notice) => notice.channel)).toEqual(['transcript']);
  });
});
