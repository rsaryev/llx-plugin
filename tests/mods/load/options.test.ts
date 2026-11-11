/**
 * plugins/mods/reference.md § Files (`register(on, options)`: "the values of the `userConfig` fields the
 * manifest declares, with defaults filled in"), § Settings and environment variables (`pluginConfigs`),
 * plugins/mods/troubleshoot.md § `options do not fit plugin.json userConfig`, plugins/mods/admin.md §
 * Set options on the built-in guard.
 */
import { expect, test } from 'bun:test';
import type { ModPlugin, ModsPolicyInput } from '../../../src/mods/load/index.ts';
import type { PluginFiles } from '../../../src/ports/index.ts';
import {
  inline,
  installed,
  modPlugin,
  policy,
  registerOf,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const USER_CONFIG = {
  greeting: { type: 'string', title: 'Greeting', description: 'What to say', default: 'hello' },
  count: { type: 'number', title: 'Count', description: 'How many', default: 1, max: 10 },
  token: { type: 'string', title: 'Token', description: 'A token', required: true },
  note: { type: 'string', title: 'Note', description: 'A note' },
};

/** The plugin with a manifest that declares `userConfig`, and a log of the `options` its `register` got. */
function withConfig(candidate: ModPlugin['candidate'], userConfig: object) {
  const seen: unknown[] = [];
  const register = registerOf((_on, options?: unknown) => void seen.push(options));
  const files: PluginFiles = modPlugin(candidate, register).files;
  const manifest = JSON.stringify({ name: candidate.name, userConfig });
  const plugin: ModPlugin = {
    candidate,
    files: {
      ...files,
      readText: (path, signal) =>
        path === '.claude-plugin/plugin.json'
          ? Promise.resolve(manifest)
          : files.readText(path, signal),
    },
  };
  return { plugin, seen, register };
}

async function loadWith(
  candidate: ModPlugin['candidate'],
  settings: ModsPolicyInput,
  userConfig: object = USER_CONFIG,
) {
  const { plugin, seen, register } = withConfig(candidate, userConfig);
  const { host } = session({ [candidate.name]: register }, { policy: settings });
  const report = await host.load([plugin]);
  return { seen, report };
}

const options = (values: Record<string, string | number | boolean>) => ({ options: values });

spec('mods.setting.pluginConfigs', () => {
  test('a mod loaded with --plugin-dir is keyed by its name and @inline; saved values first, then the declared defaults', async () => {
    const { seen } = await loadWith(
      inline('first-mod'),
      policy({
        user: {
          pluginConfigs: { 'first-mod@inline': options({ greeting: 'hi', token: 't' }) },
        },
      }),
    );
    expect(seen).toEqual([{ greeting: 'hi', count: 1, token: 't' }]);
  });

  test('an installed mod is keyed by its name and its marketplace, `name@marketplace`', async () => {
    const { seen } = await loadWith(
      installed('first-mod', 'acme-tools'),
      policy({
        user: {
          pluginConfigs: { 'first-mod@acme-tools': options({ count: 7, token: 't' }) },
        },
      }),
    );
    expect(seen).toEqual([{ greeting: 'hello', count: 7, token: 't' }]);
  });

  test('the managed home holds it too, and a managed value wins over the user value for the same option', async () => {
    const { seen } = await loadWith(
      installed('first-mod'),
      policy({
        managed: { pluginConfigs: { 'first-mod@market': options({ count: 9, token: 'managed' }) } },
        user: { pluginConfigs: { 'first-mod@market': options({ count: 2, greeting: 'yo' }) } },
      }),
    );
    expect(seen).toEqual([{ greeting: 'yo', count: 9, token: 'managed' }]);
  });

  test('an entry for another id changes nothing: the mod gets its defaults and its own missing required value fails the load', async () => {
    const { seen, report } = await loadWith(
      installed('first-mod'),
      policy({
        user: { pluginConfigs: { 'other-mod@market': options({ greeting: 'nope', token: 'x' }) } },
      }),
    );
    expect(seen).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: options do not fit plugin.json userConfig: token is required and has no value (pluginConfigs["first-mod@market"].options in settings.json)',
    ]);
  });

  test('a value of the wrong type fails the load with the reason and the entry of settings.json that holds it', async () => {
    const { seen, report } = await loadWith(
      installed('first-mod'),
      policy({
        user: {
          pluginConfigs: { 'first-mod@market': options({ count: 'many', token: 't' }) },
        },
      }),
    );
    expect(seen).toEqual([]);
    expect(report.loaded).toEqual([]);
    expect(report.lines).toEqual([
      'first-mod: hooks module did not load: options do not fit plugin.json userConfig: count must be a number (pluginConfigs["first-mod@market"].options in settings.json)',
    ]);
  });

  test('a number above the field`s max fails the load', async () => {
    const { report } = await loadWith(
      installed('first-mod'),
      policy({
        user: { pluginConfigs: { 'first-mod@market': options({ count: 11, token: 't' }) } },
      }),
    );
    expect(report.lines[0]).toContain('count 11 is above the maximum 10');
  });

  test('an option with neither a saved value nor a default is left out of options (judgment)', async () => {
    const { seen } = await loadWith(
      installed('first-mod'),
      policy({ user: { pluginConfigs: { 'first-mod@market': options({ token: 't' }) } } }),
    );
    expect(seen).toEqual([{ greeting: 'hello', count: 1, token: 't' }]);
    expect(Object.keys(seen[0] ?? {})).not.toContain('note');
  });
});
