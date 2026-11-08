/**
 * plugins/mods/reference.md § Settings and environment variables (the table and the two paragraphs
 * under it), plugins/mods/admin.md § Stop user-installed mods from loading, § Know what happens by
 * default, § Choose how much to allow, § Set options on the built-in guard, § Install your
 * organization's mods and set the order, plugins/mods/troubleshoot.md § Refusal messages and §
 * Messages from the built-in guard, plugins/settings-reference.md § `disableAllHooks`,
 * `allowManagedHooksOnly`, plugins/loading.md § Hooks when two enabled plugins share a name.
 */
import { expect, test } from 'bun:test';
import { MOD_SETTINGS } from '../../../src/protocol/mods-settings.ts';
import { decideModLoad, pluginDirsOf, sideloadRefusal } from '../../../src/mods/load/index.ts';
import {
  inline,
  installed,
  managed,
  modPlugin,
  organizations,
  policy,
  session,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const register = (on: unknown): void => void on;

spec('mods.setting.disableAllHooks', () => {
  test("in managed settings no mod of an installed plugin runs, the organization's included: the documented line", () => {
    const policy = managed({ disableAllHooks: true });
    const org = decideModLoad(policy, organizations('acme-guard'));
    const user = decideModLoad(policy, installed('first-mod'));
    expect(org).toMatchObject({ load: false, reason: 'disableAllHooks in managed settings' });
    expect(user).toMatchObject({ load: false, reason: 'disableAllHooks in managed settings' });
    expect(decideModLoad(policy, inline('first-mod')).reason).toBe(
      'disableAllHooks in managed settings',
    );
  });

  test("in any other settings file the mods you installed stop and the organization's keep running", () => {
    const settings = policy({ managed: {}, user: { disableAllHooks: true } });
    expect(decideModLoad(settings, installed('first-mod'))).toMatchObject({
      load: false,
      reason: 'only managed plugins and built-in plugins run',
    });
    expect(decideModLoad(settings, organizations('acme-guard')).load).toBe(true);
    // on a machine without managed settings it stops every installed mod too
    const alone = policy({ user: { disableAllHooks: true } });
    expect(decideModLoad(alone, inline('first-mod')).load).toBe(false);
  });

  test('mods built into Claude Code keep running in both cases', () => {
    const builtinMod = { ...installed('agents-md'), isBuiltin: true, id: 'agents-md@builtin' };
    expect(decideModLoad(managed({ disableAllHooks: true }), builtinMod).load).toBe(true);
    expect(decideModLoad(policy({ user: { disableAllHooks: true } }), builtinMod).load).toBe(true);
  });

  test('it is read from any settings file: both homes count', () => {
    expect(MOD_SETTINGS.disableAllHooks.homes).toEqual(['any-file']);
  });

  test('a plugin that is not loaded keeps the rest of itself: the decision is about the hooks module only', () => {
    const decision = decideModLoad(managed({ disableAllHooks: true }), installed('first-mod'));
    expect(Object.keys(decision).toSorted()).toEqual(['load', 'reason', 'tier']);
  });
});

spec('mods.setting.allowManagedHooksOnly', () => {
  test("only the organization's mods and the built-in mods load; a user's plugin does not, with the documented line", () => {
    const settings = managed({ allowManagedHooksOnly: true });
    expect(decideModLoad(settings, installed('first-mod'))).toMatchObject({
      load: false,
      reason: 'only managed plugins and built-in plugins run',
    });
    expect(decideModLoad(settings, organizations('acme-guard')).load).toBe(true);
    const builtinMod = { ...installed('agents-md'), isBuiltin: true, id: 'agents-md@builtin' };
    expect(decideModLoad(settings, builtinMod).load).toBe(true);
  });

  test('a plugin enabled in managed settings from a marketplace the kit copies still does not count: it does not load', () => {
    const copied = {
      ...organizations('acme-guard'),
      managed: { isEnabled: true, isLoadedInPlace: false, marketplaceDirectory: '/opt/acme' },
    };
    expect(decideModLoad(managed({ allowManagedHooksOnly: true }), copied).load).toBe(false);
  });

  test("it is read from managed settings only: the user's own file changes nothing", () => {
    expect(MOD_SETTINGS.allowManagedHooksOnly.homes).toEqual(['managed']);
    const userSet = policy({ managed: {}, user: { allowManagedHooksOnly: true } });
    expect(decideModLoad(userSet, installed('first-mod')).load).toBe(true);
  });
});

spec('mods.setting.disableSideloadFlags', () => {
  test('--plugin-dir is rejected at startup, with the documented message, and nothing loads', async () => {
    const settings = managed({ disableSideloadFlags: true });
    const flags = { ...settings, flags: { pluginDirs: ['./any-mod'] } };
    expect(sideloadRefusal(flags)).toBe(
      "--plugin-dir is disabled by your organization's managed settings (disableSideloadFlags)",
    );
    const { host } = session({ 'any-mod': register }, { policy: flags });
    const report = await host.load([modPlugin(inline('any-mod'), register)]);
    expect(report.startupRefusal).toMatch(
      /^--plugin-dir is disabled by your organization's managed settings \(disableSideloadFlags\)/,
    );
    expect(report.loaded).toEqual([]);
  });

  test('no flag, no refusal; and the key is read from managed settings only', () => {
    expect(sideloadRefusal(managed({ disableSideloadFlags: true }))).toBeUndefined();
    expect(sideloadRefusal(policy({ flags: { pluginDirs: ['./x'] } }))).toBeUndefined();
    const userSet = policy({
      user: { disableSideloadFlags: true },
      flags: { pluginDirs: ['./x'] },
    });
    expect(sideloadRefusal(userSet)).toBeUndefined();
    expect(MOD_SETTINGS.disableSideloadFlags.homes).toEqual(['managed']);
  });

  test('judgment: directories from CLAUDE_CODE_PLUGIN_DIRS are sideloaded too, so none loads', () => {
    const settings = managed({ disableSideloadFlags: true });
    expect(pluginDirsOf({ ...settings, env: { CLAUDE_CODE_PLUGIN_DIRS: '/a' } })).toEqual([]);
  });
});

spec('mods.setting.pluginConfigs', () => {
  const grader = (on: unknown): void => void on;
  void grader;

  test('holds userConfig values for a mod, keyed by its id, or its name and @inline for one loaded with --plugin-dir', async () => {
    const seen: unknown[] = [];
    const mod = (_on: unknown, options?: unknown): void => void seen.push(options);
    const manifest = JSON.stringify({
      name: 'first-mod',
      userConfig: {
        greeting: {
          type: 'string',
          title: 'Greeting',
          description: 'What to say',
          default: 'hello',
        },
        count: { type: 'number', title: 'Count', description: 'How many', default: 1 },
      },
    });
    const files = modPlugin(inline('first-mod'), register).files;
    const withConfig = {
      candidate: inline('first-mod'),
      files: {
        ...files,
        readText: (path: string) =>
          path === '.claude-plugin/plugin.json' ? Promise.resolve(manifest) : files.readText(path),
      },
    };
    const { host } = session(
      { 'first-mod': (on, options) => mod(on, options) },
      {
        policy: policy({
          user: { pluginConfigs: { 'first-mod@inline': { options: { greeting: 'hi' } } } },
        }),
      },
    );
    await host.load([withConfig]);
    // saved value first, the declared default for the rest ("defaults filled in")
    expect(seen).toEqual([{ greeting: 'hi', count: 1 }]);
  });

  test('both user and managed settings hold it; an entry for another id changes nothing', () => {
    expect(MOD_SETTINGS.pluginConfigs.homes).toEqual(['user', 'managed']);
  });
});
