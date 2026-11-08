/**
 * settings-reference.md § `allowManagedHooksOnly` ("`true`: only managed hooks run, plus Agent SDK
 * hooks and hooks from plugins your managed settings force-enable"; "`false`: hooks from every
 * settings scope and plugin run"; Scope: Managed), § "What runs under `allowManagedHooksOnly`"
 * (managed and SDK hooks run; force-enabled plugin hooks run, matched on the full `plugin@marketplace`
 * ID "so a plugin with the same name from a different marketplace stays blocked"; a mod in such a
 * plugin loads only when it counts as the organization's; monitors of other plugins are blocked;
 * everything else is blocked, "hooks declared in agent frontmatter" among it, built-in mods keep
 * running; plugins with a `command` source are disabled "including plugins force-enabled in managed
 * `enabledPlugins`, unless you set `disableCommandPluginSources` to `false` explicitly"; the status
 * line and file suggestion "narrow to managed settings"; "The `/goal` command can't run while this key
 * is set"), hooks.md § "Hooks in plugins/managed policy" (the same list),
 * plugins/mods/troubleshoot.md § "Refusal messages" (`only managed plugins and built-in plugins run`),
 * statusline.md § "Subagent status lines".
 */
import { describe, expect, test } from 'bun:test';
import { plain } from '../../support/settings-layers.ts';
import {
  forceEnable,
  fromFrontmatter,
  fromManaged,
  fromPlugin,
  fromPluginFrontmatter,
  fromSdk,
  fromSettings,
  hookPolicyOf,
  local,
  managed,
  project,
  runs,
  user,
} from '../../support/hook-policy.ts';
import { issuesOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const only = { allowManagedHooksOnly: true };
const blocked = { run: false, reason: 'allowManagedHooksOnly' };

spec('settings.key.allowManagedHooksOnly', () => {
  describe('true', () => {
    const policy = hookPolicyOf([managed(only), forceEnable('vetted@acme')]);

    test('managed settings hooks and Agent SDK hooks run', () => {
      expect(plain(policy.runs(fromManaged))).toEqual({ run: true });
      expect(plain(policy.runs(fromSdk))).toEqual({ run: true });
    });

    test('user, project and local hooks are blocked', () => {
      for (const scope of ['user', 'project', 'local', 'flag', 'sdkSettingsOption'] as const) {
        expect(plain(policy.runs(fromSettings(scope)))).toEqual(blocked);
      }
    });

    test('hooks of a plugin managed settings force-enable run', () => {
      expect(plain(policy.runs(fromPlugin('vetted@acme')))).toEqual({ run: true });
    });

    test('the full plugin@marketplace id decides: the same plugin name from another marketplace stays blocked', () => {
      expect(plain(policy.runs(fromPlugin('vetted@public')))).toEqual(blocked);
    });

    test('hooks of a plugin the user enabled are blocked, a plugin disabled by managed settings too', () => {
      const withUser = hookPolicyOf([
        managed(only),
        user({ enabledPlugins: { 'mine@team': true } }),
        managed({ enabledPlugins: { 'off@acme': false } }),
      ]);
      expect(plain(withUser.runs(fromPlugin('mine@team')))).toEqual(blocked);
      expect(plain(withUser.runs(fromPlugin('off@acme')))).toEqual(blocked);
    });

    test('hooks declared in agent frontmatter are blocked, from every source', () => {
      for (const from of ['user', 'project', 'addDir', 'synced', 'managed', 'bundled'] as const) {
        expect(plain(policy.runs(fromFrontmatter('agent', from)))).toEqual(blocked);
      }
      expect(plain(policy.runs(fromPluginFrontmatter('agent', 'vetted@acme')))).toEqual(blocked);
    });
  });

  describe('false or unset', () => {
    test('hooks from every settings scope and plugin run', () => {
      for (const sources of [[managed({ allowManagedHooksOnly: false })], [managed({})]]) {
        const policy = hookPolicyOf(sources);
        for (const scope of ['user', 'project', 'local'] as const) {
          expect(runs(policy, fromSettings(scope))).toBe(true);
        }
        expect(runs(policy, fromPlugin('lint@team'))).toBe(true);
        expect(runs(policy, fromFrontmatter('agent', 'project'))).toBe(true);
        expect(policy.commandSettingsNarrowedToManaged).toBe(false);
        expect(policy.goalCommandAvailable).toBe(true);
      }
    });
  });

  describe('Scope: Managed', () => {
    for (const [name, source] of [
      ['user', user(only)],
      ['project', project(only)],
      ['local', local(only)],
    ] as const) {
      test(`a true in the ${name} file is not read and blocks nothing`, () => {
        expect(issuesOf(source[0], only).map((issue) => issue.severity)).toEqual(['warning']);
        const policy = hookPolicyOf([source]);
        expect(runs(policy, fromSettings('user'))).toBe(true);
        expect(runs(policy, fromPlugin('lint@team'))).toBe(true);
      });
    }
  });

  describe('mods', () => {
    test('a mod in a force-enabled plugin loads only when it counts as the organization own', () => {
      const policy = hookPolicyOf([managed(only), forceEnable('guard@acme', 'theme@acme')]);
      expect(runs(policy, fromPlugin('guard@acme', { isMod: true, isOrgMod: true }))).toBe(true);
      expect(plain(policy.runs(fromPlugin('theme@acme', { isMod: true })))).toEqual(blocked);
    });

    test('a mod the user installed does not load', () => {
      const policy = hookPolicyOf([managed(only)]);
      expect(plain(policy.runs(fromPlugin('theme@team', { isMod: true })))).toEqual(blocked);
    });

    test('mods built into Claude Code keep running', () => {
      const policy = hookPolicyOf([managed(only)]);
      expect(runs(policy, fromPlugin('cc-plugin-agents-md@builtin', { isMod: true }))).toBe(true);
    });
  });

  describe('monitors', () => {
    test('a plugin monitors do not start unless the plugin is force-enabled', () => {
      const policy = hookPolicyOf([managed(only)]);
      expect(policy.monitorsRun(false)).toBe(false);
      expect(policy.monitorsRun(true)).toBe(true);
    });

    test('without the key every plugin monitors start', () => {
      expect(hookPolicyOf([managed({})]).monitorsRun(false)).toBe(true);
    });
  });

  describe('command-sourced plugins', () => {
    const commandPlugin = fromPlugin('built@acme', { commandSource: true });

    test('are disabled, a force-enabled one included', () => {
      const policy = hookPolicyOf([managed(only), forceEnable('built@acme')]);
      expect(plain(policy.runs(commandPlugin))).toEqual({
        run: false,
        reason: 'commandSourceDisabled',
      });
    });

    test('run again when disableCommandPluginSources is explicitly false', () => {
      const policy = hookPolicyOf([
        managed({ ...only, disableCommandPluginSources: false }),
        forceEnable('built@acme'),
      ]);
      expect(runs(policy, commandPlugin)).toBe(true);
    });

    test('a command-sourced plugin that is not force-enabled stays blocked by the key', () => {
      const policy = hookPolicyOf([managed({ ...only, disableCommandPluginSources: false })]);
      expect(plain(policy.runs(commandPlugin))).toEqual(blocked);
    });

    test('are not disabled without the key', () => {
      expect(runs(hookPolicyOf([managed({})]), commandPlugin)).toBe(true);
    });
  });

  describe('status line, file suggestion and subagent status line', () => {
    test('narrow to managed settings, and are not turned off entirely', () => {
      const policy = hookPolicyOf([managed(only)]);
      expect(policy.commandSettingsNarrowedToManaged).toBe(true);
      expect(policy.commandsDisabled.statusLine).toBe(false);
      expect(policy.commandsDisabled.fileSuggestion).toBe(false);
    });

    test('--safe-mode narrows them to managed settings too', () => {
      const policy = hookPolicyOf([managed({})], { context: { safeMode: true } });
      expect(policy.commandSettingsNarrowedToManaged).toBe(true);
    });
  });

  test('/goal cannot run while the key is set', () => {
    expect(hookPolicyOf([managed(only)]).goalCommandAvailable).toBe(false);
  });
});

describe('what the lock on hooks of strictPluginOnlyCustomization adds (consumed as an input)', () => {
  const locks = { hooks: true };

  test('stops user, project and local settings hooks and frontmatter hooks of those sources', () => {
    const policy = hookPolicyOf([managed({})], { locks });
    const stopped = { run: false, reason: 'strictPluginOnlyCustomization.hooks' };
    for (const scope of ['user', 'project', 'local'] as const) {
      expect(plain(policy.runs(fromSettings(scope)))).toEqual(stopped);
    }
    expect(plain(policy.runs(fromFrontmatter('skill', 'user')))).toEqual(stopped);
    expect(plain(policy.runs(fromFrontmatter('agent', 'project')))).toEqual(stopped);
  });

  test('keeps managed settings hooks, SDK hooks and plugin hooks, a skills-directory plugin excepted', () => {
    const policy = hookPolicyOf([managed({})], { locks });
    expect(runs(policy, fromManaged)).toBe(true);
    expect(runs(policy, fromSdk)).toBe(true);
    expect(runs(policy, fromPlugin('lint@team'))).toBe(true);
    expect(runs(policy, fromPlugin('mine@skills-dir', { skillsDirPlugin: true }))).toBe(false);
    expect(runs(policy, fromFrontmatter('skill', 'bundled'))).toBe(true);
    expect(runs(policy, fromFrontmatter('skill', 'managed'))).toBe(true);
    expect(runs(policy, fromPluginFrontmatter('skill', 'lint@team'))).toBe(true);
  });

  test('is not a lock when the surface is not locked', () => {
    const policy = hookPolicyOf([managed({})], { locks: { hooks: false } });
    expect(runs(policy, fromSettings('user'))).toBe(true);
    expect(runs(policy, fromPlugin('mine@skills-dir', { skillsDirPlugin: true }))).toBe(true);
  });
});

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
