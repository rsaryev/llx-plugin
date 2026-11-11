/**
 * managed-settings.md § "Find entries Claude Code dropped" and § "Keys that fail closed" (the
 * table of fields with their own fallback: `allowedHttpHookUrls`, `httpHookAllowedEnvVars`,
 * `allowedChannelPlugins`, `strictKnownMarketplaces`, `blockedMarketplaces`,
 * `strictPluginOnlyCustomization`, `enabledPlugins`; an invalid `disableAllHooks`, even a quoted
 * Boolean, is dropped; "For every other Boolean key the rule covers, the string "true" or "false"
 * reads as that Boolean"); settings.md § "Fix a broken settings file" (an individual entry that
 * fails is skipped, a user, project or local file keeps the rest); settings-reference.md § "Allowed
 * source types". This is the framework: what each key does with its valid value has ids of its own
 * and is proven where that behaviour is, so this file is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import type { PolicyScope } from '../../../src/settings/index.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';

/** The value of `key` after a source of `scope` sets it to `raw`. */
const read = (scope: PolicyScope, key: string, raw: unknown): unknown =>
  layerOf(scope, { [key]: raw }).settings[key];

const warned = (scope: PolicyScope, key: string, raw: unknown): string[] =>
  issuesOf(scope, { [key]: raw }).map((found) => found.message);

describe('lists that fail closed in managed settings', () => {
  test.each(['allowedHttpHookUrls', 'httpHookAllowedEnvVars'])(
    '%s that is no list is an empty allowlist, and says so',
    (key) => {
      for (const bad of ['https://a.example/*', 5, { a: 1 }, true]) {
        expect(read('managed', key, bad)).toEqual([]);
        expect(warned('managed', key, bad).join()).toContain('was present but invalid');
      }
    },
  );

  test.each(['allowedHttpHookUrls', 'httpHookAllowedEnvVars'])(
    '%s that is no list is only dropped in a user file',
    (key) => {
      expect(read('user', key, 'text')).toBeUndefined();
      expect(warned('user', key, 'text')).toHaveLength(1);
    },
  );

  test.each(['allowedHttpHookUrls', 'httpHookAllowedEnvVars'])(
    '%s with one invalid entry strips that entry and keeps the rest',
    (key) => {
      for (const scope of ['managed', 'user'] as const) {
        expect(read(scope, key, ['a', 5, 'b', null])).toEqual(['a', 'b']);
        expect(warned(scope, key, ['a', 5, 'b', null])).toHaveLength(2);
      }
    },
  );

  test('a parent that fails closed does so like managed settings', () => {
    expect(read('parent', 'strictKnownMarketplaces', 'oops')).toEqual([]);
  });
});

describe('allowedChannelPlugins', () => {
  test('an object entry and the string form are both read, the string as the equivalent object', () => {
    expect(
      read('managed', 'allowedChannelPlugins', [
        { marketplace: 'claude-plugins-official', plugin: 'telegram' },
        'discord@claude-plugins-official',
      ]),
    ).toEqual([
      { marketplace: 'claude-plugins-official', plugin: 'telegram' },
      { marketplace: 'claude-plugins-official', plugin: 'discord' },
    ]);
  });

  test('that is no list is an empty allowlist: no channel plugin is admitted', () => {
    expect(read('managed', 'allowedChannelPlugins', 'telegram@official')).toEqual([]);
  });

  test('an invalid entry is stripped and the rest enforced', () => {
    expect(
      read('managed', 'allowedChannelPlugins', [
        'no-at-sign',
        { plugin: 'x' },
        { marketplace: 'm', plugin: 'p' },
      ]),
    ).toEqual([{ marketplace: 'm', plugin: 'p' }]);
  });
});

/** One allowlist entry per source type, from the table of "Allowed source types". */
const DOCUMENTED_SOURCES = [
  { source: 'github', repo: 'acme-corp/plugins', ref: 'main', path: 'marketplace' },
  { source: 'git', url: 'https://gitlab.example.com/tools/plugins.git', ref: 'production' },
  { source: 'url', url: 'https://plugins.example.com/marketplace.json', headers: { A: 'b' } },
  { source: 'file', path: '/opt/acme-corp/plugins/marketplace.json' },
  { source: 'directory', path: '/opt/acme-corp/approved-marketplaces' },
  { source: 'hostPattern', hostPattern: '^github\\.example\\.com$' },
  { source: 'pathPattern', pathPattern: '^/opt/approved/' },
  { source: 'skills-dir' },
];

describe('strictKnownMarketplaces', () => {
  test('the eight documented entries are kept as they are', () => {
    expect(read('managed', 'strictKnownMarketplaces', DOCUMENTED_SOURCES)).toEqual(
      DOCUMENTED_SOURCES,
    );
  });

  test('an empty array stays empty: a complete lockdown', () => {
    expect(read('managed', 'strictKnownMarketplaces', [])).toEqual([]);
    expect(warned('managed', 'strictKnownMarketplaces', [])).toEqual([]);
  });

  test('that is no list is an empty allowlist', () => {
    expect(read('managed', 'strictKnownMarketplaces', { source: 'github' })).toEqual([]);
  });

  test('an invalid entry, or a hostPattern that does not compile, is stripped and the rest enforced', () => {
    const good = { source: 'github', repo: 'acme/plugins' };
    const entries = [
      good,
      { source: 'github' },
      { source: 'teleport', url: 'x' },
      'github',
      { source: 'hostPattern', hostPattern: '(' },
      { source: 'pathPattern', pathPattern: '[' },
    ];
    expect(read('managed', 'strictKnownMarketplaces', entries)).toEqual([good]);
    expect(warned('managed', 'strictKnownMarketplaces', entries)).toHaveLength(5);
  });
});

describe('blockedMarketplaces', () => {
  test('that is no list is dropped with a warning, in managed settings too', () => {
    expect(read('managed', 'blockedMarketplaces', 'github')).toBeUndefined();
    expect(warned('managed', 'blockedMarketplaces', 'github')).toHaveLength(1);
  });

  test('an invalid entry is stripped and the valid subset is enforced', () => {
    const bad = { source: 'github', repo: 'evil/plugins' };
    expect(read('managed', 'blockedMarketplaces', [bad, { source: 'github' }, 7])).toEqual([bad]);
  });

  test('an entry that can never match is kept, with a warning', () => {
    const never = { source: 'hostPattern', hostPattern: '(' };
    expect(read('managed', 'blockedMarketplaces', [never])).toEqual([never]);
    const found = issuesOf('managed', { blockedMarketplaces: [never] });
    expect(found.map((one) => one.severity)).toEqual(['warning']);
    expect(found[0]?.path).toBe('managed:blockedMarketplaces[0]');
  });
});

describe('strictPluginOnlyCustomization', () => {
  test('true, false and a list of surfaces are kept', () => {
    for (const good of [true, false, ['skills', 'hooks'], []]) {
      expect(read('managed', 'strictPluginOnlyCustomization', good)).toEqual(good);
    }
  });

  test('a value that is neither a Boolean nor a list is treated as true, locking all four surfaces', () => {
    for (const bad of ['yes', 1, { hooks: true }]) {
      expect(read('managed', 'strictPluginOnlyCustomization', bad)).toBe(true);
      expect(warned('managed', 'strictPluginOnlyCustomization', bad).join()).toContain(
        'was present but invalid',
      );
    }
  });

  test('a list entry this version does not know is kept for the customization policy to count', () => {
    expect(read('managed', 'strictPluginOnlyCustomization', ['hooks', 'themes'])).toEqual([
      'hooks',
      'themes',
    ]);
  });
});

describe('enabledPlugins', () => {
  test('a valid map is kept', () => {
    const map = { 'code-formatter@team-tools': true, 'experimental-features@personal': false };
    expect(read('managed', 'enabledPlugins', map)).toEqual(map);
  });

  test('an invalid entry is dropped with a warning and the others stay', () => {
    expect(
      read('managed', 'enabledPlugins', { 'a@b': true, 'no-marketplace': true, 'c@d': 'yes' }),
    ).toEqual({
      'a@b': true,
    });
    expect(warned('managed', 'enabledPlugins', { 'a@b': true, bad: true })).toHaveLength(1);
  });

  test('a value that is no map of plugin ids is dropped whole', () => {
    for (const bad of [['a@b'], 'a@b', true]) {
      expect(read('managed', 'enabledPlugins', bad)).toBeUndefined();
    }
  });

  test('a map whose every entry is invalid is dropped whole', () => {
    expect(read('managed', 'enabledPlugins', { x: true, y: 1 })).toBeUndefined();
    expect(read('managed', 'enabledPlugins', {})).toEqual({});
  });
});

describe('Boolean keys', () => {
  test('an invalid disableAllHooks is dropped with a warning, even a quoted Boolean', () => {
    for (const scope of ['managed', 'user'] as const) {
      for (const bad of ['true', 'false', 1, 'yes']) {
        expect(read(scope, 'disableAllHooks', bad)).toBeUndefined();
        expect(warned(scope, 'disableAllHooks', bad)).toHaveLength(1);
      }
    }
    expect(read('managed', 'disableAllHooks', true)).toBe(true);
    expect(read('managed', 'disableAllHooks', false)).toBe(false);
  });

  test('a lock in managed settings reads "true" and "false" as Booleans, with a notice', () => {
    expect(read('managed', 'allowManagedHooksOnly', 'true')).toBe(true);
    expect(read('managed', 'allowManagedHooksOnly', 'false')).toBe(false);
    expect(warned('managed', 'allowManagedHooksOnly', 'true').join()).toContain('drop the quotes');
  });

  test('a lock in managed settings that cannot be read reads as true', () => {
    for (const key of [
      'allowManagedHooksOnly',
      'disableSkillShellExecution',
      'disableBundledSkills',
    ]) {
      expect(read('managed', key, 'maybe')).toBe(true);
      expect(warned('managed', key, 'maybe').join()).toContain('was present but invalid');
    }
  });

  test('a lock in another source that cannot be read is dropped, not enforced', () => {
    expect(read('user', 'disableSkillShellExecution', 'maybe')).toBeUndefined();
    expect(read('user', 'disableSkillShellExecution', 'true')).toBeUndefined();
  });

  test('a Boolean key without a lock is dropped when invalid, in managed settings too', () => {
    expect(read('managed', 'channelsEnabled', 'maybe')).toBeUndefined();
    expect(read('user', 'syncClaudeAiPlugins', 'false')).toBeUndefined();
  });
});

describe('other keys', () => {
  test('an invalid skillOverrides entry is dropped, the others stay', () => {
    expect(read('user', 'skillOverrides', { deploy: 'off', lint: 'sometimes', x: 1 })).toEqual({
      deploy: 'off',
    });
  });

  test('a workflowSizeGuideline that is none of the four is dropped', () => {
    expect(read('user', 'workflowSizeGuideline', 'huge')).toBeUndefined();
    expect(read('user', 'workflowSizeGuideline', 'unrestricted')).toBe('unrestricted');
  });

  test('a text or a map of the wrong type is dropped', () => {
    expect(read('managed', 'pluginTrustMessage', 3)).toBeUndefined();
    expect(read('user', 'pluginConfigs', ['a'])).toBeUndefined();
    expect(read('user', 'prependPlugins', 'a@b')).toBeUndefined();
    expect(read('user', 'prependPlugins', ['a@b', 4])).toEqual(['a@b']);
    expect(read('project', 'extraKnownMarketplaces', { m: 'github' })).toEqual({});
  });
});
