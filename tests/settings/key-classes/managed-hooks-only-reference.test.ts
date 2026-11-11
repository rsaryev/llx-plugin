/**
 * settings-reference.md § What runs under `allowManagedHooksOnly`: "When you set it to `true`,
 * Claude Code changes which hooks and hook-like commands load", one bullet per origin, then "The
 * `/goal` command can't run while this key is set, because it depends on hooks."
 */
import { describe, expect, test } from 'bun:test';
import {
  forceEnable,
  fromFrontmatter,
  fromManaged,
  fromPlugin,
  fromPluginFrontmatter,
  fromSdk,
  fromSettings,
  hookPolicyOf,
  managed,
  runs,
  user,
} from '../../support/hook-policy.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const ID = 'settings.reference.What runs under allowManagedHooksOnly';
const only = { allowManagedHooksOnly: true };
const blocked = { run: false, reason: 'allowManagedHooksOnly' };

spec(ID, () => {
  test('with the key true the hooks and hook-like commands load only as the bullets say, and /goal is unavailable', () => {
    const policy = hookPolicyOf([managed(only)]);
    expect(runs(policy, fromSettings('user'))).toBe(false);
    expect(policy.goalCommandAvailable).toBe(false);
  });

  test('with the key false or unset nothing changes', () => {
    for (const source of [managed({ allowManagedHooksOnly: false }), managed({})]) {
      const policy = hookPolicyOf([source]);
      expect(runs(policy, fromSettings('user'))).toBe(true);
      expect(runs(policy, fromPlugin('lint@team'))).toBe(true);
      expect(policy.goalCommandAvailable).toBe(true);
    }
  });

  test('only a managed source sets it: a user file that sets it changes nothing', () => {
    const policy = hookPolicyOf([user(only)]);
    expect(runs(policy, fromSettings('user'))).toBe(true);
    expect(policy.goalCommandAvailable).toBe(true);
  });
});

spec(`${ID}.Managed and SDK hooks run`, () => {
  const policy = hookPolicyOf([managed(only)]);

  test('hooks from managed settings run', () => {
    expect(plain(policy.runs(fromManaged))).toEqual({ run: true });
  });

  test('hooks the Agent SDK registers in process run', () => {
    expect(plain(policy.runs(fromSdk))).toEqual({ run: true });
  });

  test('hooks in the SDK settings option do not: that option counts as the user own', () => {
    expect(plain(policy.runs(fromSettings('sdkSettingsOption')))).toEqual(blocked);
  });
});

spec(`${ID}.Force-enabled plugin hooks run`, () => {
  const policy = hookPolicyOf([managed(only), forceEnable('vetted@acme')]);

  test('hooks of a plugin managed enabledPlugins force-enables run', () => {
    expect(runs(policy, fromPlugin('vetted@acme'))).toBe(true);
    expect(runs(policy, fromPluginFrontmatter('skill', 'vetted@acme'))).toBe(true);
  });

  test('the match is on the full plugin@marketplace ID: the same name from another marketplace stays blocked', () => {
    expect(plain(policy.runs(fromPlugin('vetted@elsewhere')))).toEqual(blocked);
  });

  test('a mod in such a plugin loads only when it counts as the organization own', () => {
    const mods = hookPolicyOf([managed(only), forceEnable('guard@acme', 'theme@acme')]);
    expect(runs(mods, fromPlugin('guard@acme', { isMod: true, isOrgMod: true }))).toBe(true);
    expect(runs(mods, fromPlugin('theme@acme', { isMod: true, isOrgMod: false }))).toBe(false);
  });

  test('a plugin only enabled by the user is not force-enabled', () => {
    const userOnly = hookPolicyOf([
      managed(only),
      user({ enabledPlugins: { 'vetted@acme': true } }),
    ]);
    expect(plain(userOnly.runs(fromPlugin('vetted@acme')))).toEqual(blocked);
  });
});

spec(`${ID}.Monitors from other plugins are blocked`, () => {
  test("a plugin's monitors do not start unless the plugin is force-enabled", () => {
    const policy = hookPolicyOf([managed(only), forceEnable('vetted@acme')]);
    expect(policy.monitorsRun('vetted@acme')).toBe(true);
    expect(policy.monitorsRun('other@acme')).toBe(false);
    expect(policy.monitorsRun('vetted@elsewhere')).toBe(false);
  });

  test('without the key every plugin monitors start', () => {
    expect(hookPolicyOf([managed({})]).monitorsRun('other@acme')).toBe(true);
  });
});

spec(`${ID}.Everything else is blocked`, () => {
  const policy = hookPolicyOf([managed(only)]);

  test('user, project and local hooks', () => {
    for (const scope of ['user', 'project', 'local'] as const) {
      expect(plain(policy.runs(fromSettings(scope)))).toEqual(blocked);
    }
  });

  test('hooks and mods from other installed plugins', () => {
    expect(plain(policy.runs(fromPlugin('lint@team')))).toEqual(blocked);
    expect(plain(policy.runs(fromPlugin('theme@team', { isMod: true })))).toEqual(blocked);
  });

  test('hooks declared in agent frontmatter, from every source', () => {
    for (const from of ['user', 'project', 'managed', 'bundled'] as const) {
      expect(plain(policy.runs(fromFrontmatter('agent', from)))).toEqual(blocked);
    }
  });

  test('mods built into Claude Code keep running', () => {
    expect(runs(policy, fromPlugin('cc-plugin-agents-md@builtin', { isMod: true }))).toBe(true);
  });
});

spec(`${ID}.Command-sourced plugins are disabled`, () => {
  const commandPlugin = fromPlugin('built@acme', { commandSource: true });

  test('a plugin with a command source is disabled, a force-enabled one included', () => {
    const policy = hookPolicyOf([managed(only), forceEnable('built@acme')]);
    expect(plain(policy.runs(commandPlugin))).toEqual({
      run: false,
      reason: 'commandSourceDisabled',
    });
  });

  test('unless disableCommandPluginSources is explicitly false', () => {
    const policy = hookPolicyOf([
      managed({ ...only, disableCommandPluginSources: false }),
      forceEnable('built@acme'),
    ]);
    expect(runs(policy, commandPlugin)).toBe(true);
  });

  describe('a plugin without a command source is not disabled for that reason', () => {
    test('a force-enabled one runs', () => {
      expect(
        runs(hookPolicyOf([managed(only), forceEnable('built@acme')]), fromPlugin('built@acme')),
      ).toBe(true);
    });
  });
});
