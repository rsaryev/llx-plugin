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

  test('either file turns it on: on its own the user file stops every installed mod, beside managed settings the managed file stops the organization too', () => {
    const userOnly = policy({ user: { disableAllHooks: true } });
    for (const candidate of [installed('a'), inline('b')]) {
      expect(decideModLoad(userOnly, candidate).load).toBe(false);
    }
    expect(decideModLoad(userOnly, organizations('c')).load).toBe(true);
    const bothFiles = policy({ managed: { disableAllHooks: true }, user: {} });
    for (const candidate of [installed('a'), inline('b'), organizations('c')]) {
      expect(decideModLoad(bothFiles, candidate)).toMatchObject({
        load: false,
        reason: 'disableAllHooks in managed settings',
      });
    }
    // false in a file turns nothing off
    const off = policy({ managed: { disableAllHooks: false }, user: { disableAllHooks: false } });
    expect(decideModLoad(off, installed('a')).load).toBe(true);
  });

  test('a plugin that is not loaded keeps the rest of itself: the host reports the hooks module only, with the documented debug line', async () => {
    const { host, debug } = session(
      { 'first-mod': register },
      { policy: managed({ disableAllHooks: true }) },
    );
    const report = await host.load([modPlugin(installed('first-mod'), register)]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['cc-plugin-sec-default']);
    expect(report.lines).toEqual([
      'hooks module first-mod@market not loaded: disableAllHooks in managed settings',
    ]);
    expect(debug).toEqual([...report.lines]);
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

  test('--plugin-url is rejected at startup too, with its own flag in the message, and nothing loads', async () => {
    const flags = {
      ...managed({ disableSideloadFlags: true }),
      flags: { pluginDirs: [], pluginUrls: ['https://example.com/mod.zip'] },
    };
    expect(sideloadRefusal(flags)).toBe(
      "--plugin-url is disabled by your organization's managed settings (disableSideloadFlags)",
    );
    const { host } = session({ 'any-mod': register }, { policy: flags });
    const report = await host.load([modPlugin(inline('any-mod'), register)]);
    expect(report.startupRefusal).toMatch(/^--plugin-url is disabled by your organization's/);
    expect(report.loaded).toEqual([]);
    // a user's file does not reject it, and without the flag nothing is refused
    const userSet = policy({
      user: { disableSideloadFlags: true },
      flags: { pluginDirs: [], pluginUrls: ['https://example.com/mod.zip'] },
    });
    expect(sideloadRefusal(userSet)).toBeUndefined();
    expect(sideloadRefusal(managed({ disableSideloadFlags: true }))).toBeUndefined();
  });

  test('the host hands over no directory of CLAUDE_CODE_PLUGIN_DIRS once the setting is on, and flags first when it is off', async () => {
    const settings = managed({ disableSideloadFlags: true });
    const { host } = session(
      { 'any-mod': register },
      { policy: { ...settings, env: { CLAUDE_CODE_PLUGIN_DIRS: '/a:/b' } } },
    );
    expect(host.pluginDirs()).toEqual([]);
    const open = session(
      { 'any-mod': register },
      {
        policy: policy({
          env: { CLAUDE_CODE_PLUGIN_DIRS: '/a:/b' },
          flags: { pluginDirs: ['/c'] },
        }),
      },
    );
    expect(open.host.pluginDirs()).toEqual(['/c', '/a', '/b']);
  });
});

spec('mods.setting.disableSideloadFlags', () => {
  const settings = managed({ disableSideloadFlags: true });

  test('CLAUDE_CODE_PLUGIN_DIRS naming a plugin folder makes startup exit with an error that names the variable and says to unset it', async () => {
    const withVariable = { ...settings, env: { CLAUDE_CODE_PLUGIN_DIRS: '/a:/b' } };
    expect(sideloadRefusal(withVariable)).toBe(
      "CLAUDE_CODE_PLUGIN_DIRS is disabled by your organization's managed settings (disableSideloadFlags): unset the variable",
    );
    expect(pluginDirsOf(withVariable)).toEqual([]);
    const { host } = session({ 'any-mod': register }, { policy: withVariable });
    const report = await host.load([modPlugin(inline('any-mod'), register)]);
    expect(report.startupRefusal).toMatch(/^CLAUDE_CODE_PLUGIN_DIRS is disabled by your/);
    expect(report.loaded).toEqual([]);
  });

  test('the variable set in env of the user settings counts the same', () => {
    const fromSettings = {
      ...settings,
      user: { env: { CLAUDE_CODE_PLUGIN_DIRS: '/a' } },
    };
    expect(sideloadRefusal(fromSettings)).toContain('CLAUDE_CODE_PLUGIN_DIRS');
  });

  test('an empty variable names no plugin folder, so nothing is refused', () => {
    expect(sideloadRefusal({ ...settings, env: { CLAUDE_CODE_PLUGIN_DIRS: ':' } })).toBeUndefined();
  });

  test('without the setting the variable loads its directories', () => {
    const open = policy({ env: { CLAUDE_CODE_PLUGIN_DIRS: '/a' } });
    expect(sideloadRefusal(open)).toBeUndefined();
    expect(pluginDirsOf(open)).toEqual(['/a']);
  });

  test('--agents and a --mcp-config with a server that is not in process are rejected at startup too', () => {
    const agents = { ...settings, flags: { pluginDirs: [], agents: true } };
    expect(sideloadRefusal(agents)).toContain('--agents is disabled by your organization');
    const mcp = {
      ...settings,
      flags: { pluginDirs: [], mcpServers: [{ name: 'a', type: 'stdio' }] },
    };
    expect(sideloadRefusal(mcp)).toContain('--mcp-config is disabled by your organization');
    const inProcess = {
      ...settings,
      flags: { pluginDirs: [], mcpServers: [{ name: 'a', type: 'sdk' }] },
    };
    expect(sideloadRefusal(inProcess)).toBeUndefined();
  });

  test('every rejected flag and the variable are named in the one error', () => {
    const all = {
      ...settings,
      env: { CLAUDE_CODE_PLUGIN_DIRS: '/a' },
      flags: { pluginDirs: ['./x'], pluginUrls: ['https://e/p.zip'], agents: true },
    };
    const lines = sideloadRefusal(all)?.split('\n') ?? [];
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.split(' ')[0])).toEqual([
      '--plugin-dir',
      '--plugin-url',
      '--agents',
      'CLAUDE_CODE_PLUGIN_DIRS',
    ]);
  });

  test('in a cloud session a server-delivered --mcp-config no longer exits, its servers are dropped by sideloadVerdict', () => {
    const cloud = {
      ...settings,
      cloud: true,
      flags: { pluginDirs: [], mcpServers: [{ name: 'a', type: 'http' }] },
    };
    expect(sideloadRefusal(cloud)).toBeUndefined();
    expect(sideloadRefusal({ ...cloud, flags: { pluginDirs: ['./x'] } })).toContain('--plugin-dir');
  });
});
