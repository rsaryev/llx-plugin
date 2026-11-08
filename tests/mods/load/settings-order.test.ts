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
import {
  decideModLoad,
  orderMods,
  parsePluginDirs,
  pluginDirsOf,
  watchesPluginDirs,
} from '../../../src/mods/load/index.ts';
import { installed, managed, organizations, policy } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const names = (order: ReturnType<typeof orderMods>) =>
  order.ordered.map((mod) => `${mod.candidate.name}:${mod.tier}`);

spec('mods.setting.CLAUDE_CODE_PLUGIN_DIRS', () => {
  test('absolute paths separated by `:`, or `;` on Windows', () => {
    expect(parsePluginDirs('/a/one:/b/two', 'posix')).toEqual(['/a/one', '/b/two']);
    expect(parsePluginDirs('C:\\mods\\one;C:\\mods\\two', 'windows')).toEqual([
      'C:\\mods\\one',
      'C:\\mods\\two',
    ]);
    // the separator of the other platform is a character of the path
    expect(parsePluginDirs('/a;b:/c', 'posix')).toEqual(['/a;b', '/c']);
    expect(parsePluginDirs('/a;b:/c', 'windows')).toEqual(['/a', 'b:/c']);
    expect(parsePluginDirs(undefined, 'posix')).toEqual([]);
    expect(parsePluginDirs('/a::/b:', 'posix')).toEqual(['/a', '/b']);
  });

  test('read from the environment, or `env` in ~/.claude/settings.json, and loaded as --plugin-dir does (after the flags)', () => {
    const fromEnv = policy({ env: { CLAUDE_CODE_PLUGIN_DIRS: '/env/one' } });
    expect(pluginDirsOf(fromEnv)).toEqual(['/env/one']);
    const fromSettings = policy({ user: { env: { CLAUDE_CODE_PLUGIN_DIRS: '/settings/one' } } });
    expect(pluginDirsOf(fromSettings)).toEqual(['/settings/one']);
    const both = policy({
      env: { CLAUDE_CODE_PLUGIN_DIRS: '/env/one:/flag/one' },
      flags: { pluginDirs: ['/flag/one'] },
    });
    expect(pluginDirsOf(both)).toEqual(['/flag/one', '/env/one']);
  });

  test('it is read from the environment and the user settings only: managed `env` is not one of its homes', () => {
    expect(MOD_SETTINGS.CLAUDE_CODE_PLUGIN_DIRS.homes).toEqual(['environment', 'user-env']);
    const viaManaged = policy({ managed: { env: { CLAUDE_CODE_PLUGIN_DIRS: '/managed' } } });
    expect(pluginDirsOf(viaManaged)).toEqual([]);
  });
});

spec('mods.setting.CLAUDE_CODE_PLUGIN_DIR_WATCH', () => {
  test('`1` makes a long-running non-interactive session reload --plugin-dir mods on save; other values do not', () => {
    expect(watchesPluginDirs(policy({ env: { CLAUDE_CODE_PLUGIN_DIR_WATCH: '1' } }), false)).toBe(
      true,
    );
    for (const value of [undefined, '0', 'true', '']) {
      expect(
        watchesPluginDirs(policy({ env: { CLAUDE_CODE_PLUGIN_DIR_WATCH: value } }), false),
      ).toBe(false);
    }
  });

  test('an interactive session watches a --plugin-dir directory without it (create.md: it hot-reloads when you save)', () => {
    expect(watchesPluginDirs(policy(), true)).toBe(true);
  });
});

spec(['mods.setting.prependPlugins', 'mods.setting.appendPlugins'], () => {
  const guardRow = (ids: readonly string[]) => ids;

  test('mods in prependPlugins run before every mod a user installs, those in appendPlugins after, in the listed order', () => {
    const settings = {
      prependPlugins: guardRow(['acme-b@acme-tools', 'acme-a@acme-tools', 'sec-default@builtin']),
      appendPlugins: guardRow(['acme-z@acme-tools', 'acme-y@acme-tools']),
    };
    const order = orderMods(managed(settings), [
      installed('user-mod'),
      organizations('acme-y'),
      organizations('acme-a'),
      organizations('acme-z'),
      organizations('acme-b'),
    ]);
    expect(names(order)).toEqual([
      'acme-b:prepend',
      'acme-a:prepend',
      'cc-plugin-sec-default:prepend',
      'user-mod:user',
      'acme-z:append',
      'acme-y:append',
    ]);
  });

  test('a list in managed settings replaces the default: the guard loads only where the list names it, at that place', () => {
    const plugins = [organizations('acme-guard'), installed('user-mod')];
    const without = orderMods(managed({ prependPlugins: ['acme-guard@acme-tools'] }), plugins);
    expect(names(without)).toEqual(['acme-guard:prepend', 'user-mod:user']);
    const empty = orderMods(managed({ prependPlugins: [] }), plugins);
    expect(names(empty)).toEqual(['acme-guard:prepend', 'user-mod:user']);
    const named = orderMods(
      managed({ prependPlugins: ['sec-default@builtin', 'acme-guard@acme-tools'] }),
      plugins,
    );
    expect(names(named)).toEqual([
      'cc-plugin-sec-default:prepend',
      'acme-guard:prepend',
      'user-mod:user',
    ]);
    const unset = orderMods(managed(), plugins);
    expect(names(unset)).toEqual([
      'cc-plugin-sec-default:prepend',
      'acme-guard:prepend',
      'user-mod:user',
    ]);
  });

  test("an id whose plugin does not count as the organization's is skipped, with the documented debug line, and runs as a user mod", () => {
    const order = orderMods(
      managed({ prependPlugins: ['stranger@market', 'sec-default@builtin'] }),
      [installed('stranger')],
    );
    expect(names(order)).toEqual(['cc-plugin-sec-default:prepend', 'stranger:user']);
    expect(order.notes).toEqual([
      'prependPlugins names stranger@market, which is not an enabled managed plugin with a hooks module; skipped',
    ]);
  });

  test("a mod that counts as the organization's runs before the users' even when it is listed nowhere", () => {
    const order = orderMods(managed(), [installed('user-mod'), organizations('acme-guard')]);
    expect(names(order)).toEqual([
      'cc-plugin-sec-default:prepend',
      'acme-guard:prepend',
      'user-mod:user',
    ]);
  });

  test("a plugin copied into the cache, or not enabled in managed settings, counts as a user's", () => {
    const copied = {
      ...organizations('acme-guard'),
      managed: { isEnabled: true, isLoadedInPlace: false, marketplaceDirectory: '/opt/acme' },
    };
    const relative = {
      ...organizations('acme-two'),
      managed: { isEnabled: true, isLoadedInPlace: true, marketplaceDirectory: 'plugins' },
    };
    const disabled = {
      ...organizations('acme-three'),
      managed: { isEnabled: false, isLoadedInPlace: true, marketplaceDirectory: '/opt/acme' },
    };
    expect(decideModLoad(managed(), copied).tier).toBe('user');
    expect(decideModLoad(managed(), relative).tier).toBe('user');
    expect(decideModLoad(managed(), disabled).tier).toBe('user');
  });

  test('a user may list their own mods only on a machine with no managed settings and no Team or Enterprise login', () => {
    const lists = { prependPlugins: ['b@market'], appendPlugins: ['a@market'] };
    const plugins = [installed('a'), installed('c'), installed('b')];
    const alone = orderMods(policy({ user: lists }), plugins);
    expect(names(alone)).toEqual(['b:prepend', 'c:user', 'a:append']);
    const oauth = orderMods(policy({ user: lists, credential: 'oauth-token' }), plugins);
    expect(names(oauth)).toEqual(['b:prepend', 'c:user', 'a:append']);
    for (const guarded of [
      policy({ user: lists, managed: {} }),
      policy({ user: lists, credential: 'team-or-enterprise-login' }),
    ]) {
      const order = orderMods(guarded, plugins);
      // the list neither adds nor removes the built-in guard, and orders nothing
      expect(names(order)).toEqual(['cc-plugin-sec-default:prepend', 'a:user', 'c:user', 'b:user']);
    }
  });

  test('settings: a repository cannot set them, so they have no home in project or local settings', () => {
    for (const name of ['prependPlugins', 'appendPlugins'] as const) {
      expect(MOD_SETTINGS[name].homes).toEqual(['managed', 'user']);
    }
  });

  test('among the mods a user installs, a mod runs before the mods it lists under dependencies (events.md)', () => {
    const dependent = { ...installed('base'), dependencies: [] };
    const top = { ...installed('top'), dependencies: ['base'] };
    expect(names(orderMods(policy(), [dependent, top]))).toEqual(['top:user', 'base:user']);
  });

  test("the built-in mods run last, after the user's and appended mods", () => {
    const order = orderMods(managed(), [
      { ...installed('agents-md'), isBuiltin: true, id: 'agents-md@builtin' },
      installed('user-mod'),
    ]);
    expect(names(order)).toEqual([
      'cc-plugin-sec-default:prepend',
      'user-mod:user',
      'agents-md:builtin',
    ]);
  });
});
