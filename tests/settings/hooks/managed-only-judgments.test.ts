/**
 * settings-reference.md § `allowManagedHooksOnly` and § `strictPluginOnlyCustomization.hooks`, where
 * the docs leave the origin or the order open: which reason is named when two locks stop one hook,
 * how skill and command frontmatter and mods are treated, and the sources the `hooks` lock reaches.
 * Every test here is a judgment recorded in `spec/judgments.md`, so none counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { plain } from '../../support/settings-layers.ts';
import {
  forceEnable,
  fromFrontmatter,
  fromPlugin,
  fromPluginFrontmatter,
  fromSettings,
  hookPolicyOf,
  managed,
  runs,
} from '../../support/hook-policy.ts';

const only = { allowManagedHooksOnly: true };
const blocked = { run: false, reason: 'allowManagedHooksOnly' };

describe('which reason is given when two locks stop one hook (judgment: the docs do not rank them)', () => {
  const everything = [
    managed({ allowManagedHooksOnly: true, disableAllHooks: true }),
    forceEnable('built@acme'),
  ] as const;

  test('disableAllHooks is named before allowManagedHooksOnly, then the surface lock', () => {
    const policy = hookPolicyOf(everything, { locks: { hooks: true } });
    expect(plain(policy.runs(fromSettings('user')))).toEqual({
      run: false,
      reason: 'disableAllHooks',
    });
    const noDisable = hookPolicyOf([managed(only)], { locks: { hooks: true } });
    expect(plain(noDisable.runs(fromSettings('user')))).toEqual(blocked);
  });

  test('a plugin that is never loaded (command source) is named first: its hooks never exist', () => {
    const policy = hookPolicyOf(everything, { locks: { hooks: true } });
    expect(
      plain(policy.runs(fromPlugin('built@acme', { commandSource: true, skillsDirPlugin: true }))),
    ).toEqual({ run: false, reason: 'commandSourceDisabled' });
  });
});

describe('origins the docs leave open (judgments)', () => {
  test('a skill or command frontmatter hook follows the same rule as an agent one under the key', () => {
    const policy = hookPolicyOf([managed(only)]);
    expect(plain(policy.runs(fromFrontmatter('skill', 'managed')))).toEqual(blocked);
    expect(plain(policy.runs(fromFrontmatter('command', 'bundled')))).toEqual(blocked);
  });

  test('a skill frontmatter hook of a force-enabled plugin runs, an agent one does not', () => {
    const policy = hookPolicyOf([managed(only), forceEnable('vetted@acme')]);
    expect(runs(policy, fromPluginFrontmatter('skill', 'vetted@acme'))).toBe(true);
    expect(runs(policy, fromPluginFrontmatter('command', 'vetted@acme'))).toBe(true);
    expect(runs(policy, fromPluginFrontmatter('agent', 'vetted@acme'))).toBe(false);
  });
});

describe('the hooks lock on the sources the docs name only through the skills and agents locks (judgments)', () => {
  const policy = hookPolicyOf([managed({})], { locks: { hooks: true } });
  const stopped = { run: false, reason: 'strictPluginOnlyCustomization.hooks' };

  test('--settings and the SDK settings option are the user own hooks: the lock stops them', () => {
    expect(plain(policy.runs(fromSettings('flag')))).toEqual(stopped);
    expect(plain(policy.runs(fromSettings('sdkSettingsOption')))).toEqual(stopped);
  });

  test('frontmatter hooks from --add-dir and claude.ai sync are stopped like user and project ones', () => {
    for (const from of ['user', 'project', 'addDir', 'synced'] as const) {
      expect(plain(policy.runs(fromFrontmatter('skill', from)))).toEqual(stopped);
      expect(plain(policy.runs(fromFrontmatter('command', from)))).toEqual(stopped);
      expect(plain(policy.runs(fromFrontmatter('agent', from)))).toEqual(stopped);
    }
  });

  test('frontmatter hooks of the managed policy directory and bundled with Claude Code are kept', () => {
    for (const from of ['managed', 'bundled'] as const) {
      expect(runs(policy, fromFrontmatter('skill', from))).toBe(true);
      expect(runs(policy, fromFrontmatter('command', from))).toBe(true);
    }
  });
});

describe('mods and built-in plugins (judgments)', () => {
  test('a mod the host calls the organization own still needs the managed enabledPlugins entry', () => {
    const policy = hookPolicyOf([managed(only)]);
    expect(plain(policy.runs(fromPlugin('guard@acme', { isMod: true, isOrgMod: true })))).toEqual(
      blocked,
    );
  });

  test('a built-in plugin runs under every hook setting', () => {
    const policy = hookPolicyOf([managed({ ...only, disableAllHooks: true })]);
    expect(runs(policy, fromPlugin('cc-plugin-diff@builtin'))).toBe(true);
    expect(
      runs(hookPolicyOf([managed(only)], { locks: { hooks: true } }), fromPlugin('x@builtin')),
    ).toBe(true);
  });
});
