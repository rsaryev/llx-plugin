/**
 * plugins/loading.md § Find plugins on disk (the plugins root, `CLAUDE_CODE_PLUGIN_CACHE_DIR`, and
 * every path under it: `cache/<marketplace>/<plugin>/<version>/`, `data/<plugin-id>/`,
 * `marketplaces/<name>/`, `synced/`, `.trash/`, the two JSON records, `known_marketplaces_claudeai.json`,
 * `flagged-plugins.json` and the dated set-aside and unreadable copies) and env-vars.md
 * (`CLAUDE_CODE_PLUGIN_CACHE_DIR` "sets the parent directory, not the cache itself"; `CLAUDE_CONFIG_DIR`: "All settings, session history, and plugins are stored under this path"). The table has
 * no requirement id of its own, so the root tests sit under the two variables' ids and the rest outside `spec(...)`; the wording of an empty
 * override and the date form of the dated copies are rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../support/spec.ts';
import {
  classifyStoreEntry,
  type StoreEntry,
  createStoreLayout,
  resolvePluginsRoot,
} from '../../src/marketplace/store-layout.ts';

const join = (base: string, relative: string): string => `${base}/${relative}`;
const layout = createStoreLayout('/home/u/.claude/plugins', join);

spec(
  ['environment.host.CLAUDE_CODE_PLUGIN_CACHE_DIR', 'environment.host.CLAUDE_CONFIG_DIR'],
  () => {
    test('is ~/.claude/plugins unless CLAUDE_CODE_PLUGIN_CACHE_DIR sets it', () => {
      expect(resolvePluginsRoot({ home: '/home/u', join })).toBe('/home/u/.claude/plugins');
      expect(resolvePluginsRoot({ home: '/home/u', override: '/mnt/plugins', join })).toBe(
        '/mnt/plugins',
      );
    });

    test('an empty override is no override', () => {
      expect(resolvePluginsRoot({ home: '/home/u', override: '', join })).toBe(
        '/home/u/.claude/plugins',
      );
    });

    test('CLAUDE_CONFIG_DIR moves the default root: plugins are stored under it', () => {
      expect(resolvePluginsRoot({ home: '/home/u', configDir: '/srv/work', join })).toBe(
        '/srv/work/plugins',
      );
      expect(resolvePluginsRoot({ home: '/home/u', configDir: '', join })).toBe(
        '/home/u/.claude/plugins',
      );
    });

    test('the override is the parent: the cache is a folder under it, not the override itself', () => {
      const custom = createStoreLayout('/mnt/plugins', join);
      expect(custom.cache()).toBe('/mnt/plugins/cache');
      expect(custom.marketplace('m')).toBe('/mnt/plugins/marketplaces/m');
    });
  },
);

describe('the plugins root: a judgment', () => {
  test('a judgment: CLAUDE_CODE_PLUGIN_CACHE_DIR, which names the root itself, wins over CLAUDE_CONFIG_DIR', () => {
    expect(
      resolvePluginsRoot({
        home: '/home/u',
        override: '/mnt/plugins',
        configDir: '/srv/work',
        join,
      }),
    ).toBe('/mnt/plugins');
  });
});

describe('the paths under the root (loading.md, "Find plugins on disk")', () => {
  test('one directory per installed version: cache/<marketplace>/<plugin>/<version>', () => {
    expect(layout.versionDir('acme-tools', 'formatter', '1.2.0')).toBe(
      '/home/u/.claude/plugins/cache/acme-tools/formatter/1.2.0',
    );
  });

  test('the persistent directory is data/<plugin-id>', () => {
    expect(layout.pluginData('formatter-acme-tools')).toBe(
      '/home/u/.claude/plugins/data/formatter-acme-tools',
    );
  });

  test('a marketplace clone lives in marketplaces/<name>; synced and .trash are folders of the root', () => {
    expect(layout.marketplace('acme-tools')).toBe(
      '/home/u/.claude/plugins/marketplaces/acme-tools',
    );
    expect(layout.synced()).toBe('/home/u/.claude/plugins/synced');
    expect(layout.trash()).toBe('/home/u/.claude/plugins/.trash');
  });

  test('the records and the flagged list are files of the root', () => {
    expect(layout.installedPlugins()).toBe('/home/u/.claude/plugins/installed_plugins.json');
    expect(layout.knownMarketplaces()).toBe('/home/u/.claude/plugins/known_marketplaces.json');
    expect(layout.flaggedPlugins()).toBe('/home/u/.claude/plugins/flagged-plugins.json');
  });

  test('a marketplace hosted on claude.ai is recorded in known_marketplaces_claudeai.json instead', () => {
    expect(layout.knownMarketplacesClaudeAi()).toBe(
      '/home/u/.claude/plugins/known_marketplaces_claudeai.json',
    );
  });

  test('the dated copies are installed_plugins.set-aside.<date>.<hash>.json and installed_plugins.unreadable.<date>.<hash>.kept', () => {
    expect(layout.setAsideCopy('2026-11-08', 'a1b2c3')).toBe(
      '/home/u/.claude/plugins/installed_plugins.set-aside.2026-11-08.a1b2c3.json',
    );
    expect(layout.unreadableCopy('2026-11-08', 'a1b2c3')).toBe(
      '/home/u/.claude/plugins/installed_plugins.unreadable.2026-11-08.a1b2c3.kept',
    );
  });
});

describe('what a name under the root is', () => {
  test.each<[string, StoreEntry]>([
    ['installed_plugins.json', 'installed-plugins'],
    ['known_marketplaces.json', 'known-marketplaces'],
    ['known_marketplaces_claudeai.json', 'known-marketplaces-claudeai'],
    ['flagged-plugins.json', 'flagged-plugins'],
    ['installed_plugins.set-aside.2026-11-08.a1b2c3.json', 'set-aside-copy'],
    ['installed_plugins.unreadable.2026-11-08.a1b2c3.kept', 'unreadable-copy'],
    ['cache', 'cache'],
    ['data', 'data'],
    ['marketplaces', 'marketplaces'],
    ['synced', 'synced'],
    ['.trash', 'trash'],
    ['notes.txt', 'unknown'],
    ['installed_plugins.set-aside.json', 'unknown'],
  ])('%s is %s', (name, expected) => {
    expect(classifyStoreEntry(name)).toBe(expected);
  });
});
