/**
 * plugins/host-marketplace.md § Migrate users with a renames map: what a user who still has the
 * old name enabled sees (a renamed entry loads under its new name and the old key is rewritten in
 * `enabledPlugins` and `pluginConfigs` of the user, project and local scopes; a `null` entry drops
 * the key; managed settings cannot be rewritten, so the notice recurs), the notice texts, the chain
 * "from the oldest name", and the case without a `renames` entry, `Plugin "<name>" not found`.
 * Validation of the map itself is tests/format/marketplace/renames-validation.test.ts. What the docs
 * leave open (a key that is also a plugin, a rewrite that collides, keys that are not ids) is
 * outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { Marketplace } from '../../src/format/marketplace/types.ts';
import {
  migrateSettingsKeys,
  migrateSettingsScopes,
  renameNotice,
  resolveRename,
} from '../../src/marketplace/renames.ts';
import { spec } from '../support/spec.ts';

const NAME = 'your-marketplace';

const marketplace = (plugins: readonly string[], renames: Marketplace['renames']): Marketplace => ({
  name: NAME,
  owner: { name: 'Your Org' },
  plugins: plugins.map((name) => ({
    name,
    source: { kind: 'relative', path: `plugins/${name}`, bare: false },
    strict: true,
    components: {},
    display: {},
  })),
  forceRemoveDeletedPlugins: false,
  allowCrossMarketplaceDependenciesOn: [],
  renames,
});

/** The documented example: `formatter` became `code-formatter`, `legacy-linter` was removed. */
const documented = marketplace(['code-formatter'], {
  formatter: 'code-formatter',
  'legacy-linter': null,
});

spec('marketplace.field.renames', () => {
  describe('what a name resolves to', () => {
    test('a renamed entry loads under its new name', () => {
      expect(resolveRename('formatter', documented)).toEqual({
        status: 'renamed',
        to: 'code-formatter',
      });
    });

    test('a null entry is a removed plugin', () => {
      expect(resolveRename('legacy-linter', documented)).toEqual({ status: 'removed' });
    });

    test('a listed plugin is current', () => {
      expect(resolveRename('code-formatter', documented)).toEqual({ status: 'current' });
    });

    test('a name in neither plugins nor renames is unknown: "not found in marketplace"', () => {
      expect(resolveRename('never-heard-of', documented)).toEqual({ status: 'unknown' });
    });

    test('the chain is followed from the oldest name, so a second rename is a second entry', () => {
      const later = marketplace(['fmt'], {
        formatter: 'code-formatter',
        'code-formatter': 'fmt',
      });
      expect(resolveRename('formatter', later)).toEqual({ status: 'renamed', to: 'fmt' });
      expect(resolveRename('code-formatter', later)).toEqual({ status: 'renamed', to: 'fmt' });
    });

    test('a chain that ends at null is removed from its oldest name on', () => {
      const gone = marketplace([], { a: 'b', b: null });
      expect(resolveRename('a', gone)).toEqual({ status: 'removed' });
    });
  });

  describe('the notice the user sees', () => {
    test('a renamed entry says where it went', () => {
      expect(renameNotice('formatter', documented)).toBe(
        'Renamed to "code-formatter" in the "your-marketplace" marketplace',
      );
    });

    test('a null entry says it was removed', () => {
      expect(renameNotice('legacy-linter', documented)).toBe(
        'Removed from the "your-marketplace" marketplace',
      );
    });

    test('a current or unknown name has no notice', () => {
      expect(renameNotice('code-formatter', documented)).toBeUndefined();
      expect(renameNotice('nope', documented)).toBeUndefined();
    });
  });

  describe('rewriting the settings keys', () => {
    const enabled = {
      [`formatter@${NAME}`]: true,
      [`legacy-linter@${NAME}`]: true,
      [`code-formatter-extras@${NAME}`]: false,
      'formatter@another-marketplace': true,
    };

    test('the old key becomes the new one in enabledPlugins, the value unchanged', () => {
      const { map, notices } = migrateSettingsKeys(enabled, NAME, documented);
      expect(map).toEqual({
        [`code-formatter@${NAME}`]: true,
        [`code-formatter-extras@${NAME}`]: false,
        'formatter@another-marketplace': true,
      });
      expect(notices).toEqual([
        'Renamed to "code-formatter" in the "your-marketplace" marketplace',
        'Removed from the "your-marketplace" marketplace',
      ]);
    });

    test('pluginConfigs carry their whole value to the new key', () => {
      const config = { [`formatter@${NAME}`]: { options: { tabs: 2 } } };
      expect(migrateSettingsKeys(config, NAME, documented).map).toEqual({
        [`code-formatter@${NAME}`]: { options: { tabs: 2 } },
      });
    });

    test('a null entry drops the key', () => {
      const { map } = migrateSettingsKeys({ [`legacy-linter@${NAME}`]: true }, NAME, documented);
      expect(map).toEqual({});
    });

    test('a key of another marketplace is left alone, even with a renamed plugin name', () => {
      const other = { 'formatter@another-marketplace': true };
      expect(migrateSettingsKeys(other, NAME, documented)).toEqual({ map: other, notices: [] });
    });

    test('a key that holds the oldest name is rewritten straight to the current one', () => {
      const later = marketplace(['fmt'], { formatter: 'code-formatter', 'code-formatter': 'fmt' });
      const { map } = migrateSettingsKeys({ [`formatter@${NAME}`]: true }, NAME, later);
      expect(map).toEqual({ [`fmt@${NAME}`]: true });
    });

    test('a rewritten map gives no further notice: the renamed notice appears once', () => {
      const first = migrateSettingsKeys(enabled, NAME, documented);
      expect(first.notices).toHaveLength(2);
      expect(migrateSettingsKeys(first.map, NAME, documented)).toEqual({
        map: first.map,
        notices: [],
      });
    });

    test('the map it was given is not changed', () => {
      const given = { [`formatter@${NAME}`]: true };
      migrateSettingsKeys(given, NAME, documented);
      expect(given).toEqual({ [`formatter@${NAME}`]: true });
    });
  });

  describe('scopes', () => {
    const settings = { [`formatter@${NAME}`]: true };

    test('user, project and local settings are rewritten', () => {
      const { scopes } = migrateSettingsScopes(
        { user: settings, project: settings, local: settings },
        NAME,
        documented,
      );
      for (const scope of ['user', 'project', 'local'] as const) {
        expect(scopes[scope]).toEqual({ [`code-formatter@${NAME}`]: true });
      }
    });

    test('managed settings cannot be rewritten: the key stays and the notice comes again', () => {
      const first = migrateSettingsScopes({ managed: settings }, NAME, documented);
      expect(first.scopes.managed).toEqual(settings);
      expect(first.notices).toEqual([
        'Renamed to "code-formatter" in the "your-marketplace" marketplace',
      ]);
      const next = migrateSettingsScopes({ managed: first.scopes.managed ?? {} }, NAME, documented);
      expect(next.notices).toEqual(first.notices);
    });

    test('the same notice from several scopes is given once', () => {
      const { notices } = migrateSettingsScopes(
        { user: settings, project: settings },
        NAME,
        documented,
      );
      expect(notices).toHaveLength(1);
    });

    test('the plugin still loads under its new name when only managed settings enable it', () => {
      const { scopes } = migrateSettingsScopes({ managed: settings }, NAME, documented);
      expect(resolveRename('formatter', documented)).toEqual({
        status: 'renamed',
        to: 'code-formatter',
      });
      expect(scopes.managed).toEqual(settings);
    });

    test('the notice is given once for a rewritten scope and again for managed settings', () => {
      const first = migrateSettingsScopes(
        { user: settings, project: settings, local: settings, managed: settings },
        NAME,
        documented,
      );
      expect(first.notices).toHaveLength(1);
      const again = migrateSettingsScopes(first.scopes, NAME, documented);
      expect(again.notices).toEqual(first.notices);
      const writable = migrateSettingsScopes(
        {
          user: first.scopes.user ?? {},
          project: first.scopes.project ?? {},
          local: first.scopes.local ?? {},
        },
        NAME,
        documented,
      );
      expect(writable.notices).toEqual([]);
    });
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('a name that is still a plugin is current, even when it is also a key', () => {
    const readded = marketplace(['formatter', 'code-formatter'], { formatter: 'code-formatter' });
    expect(resolveRename('formatter', readded)).toEqual({ status: 'current' });
    expect(migrateSettingsKeys({ [`formatter@${NAME}`]: true }, NAME, readded).map).toEqual({
      [`formatter@${NAME}`]: true,
    });
  });

  test('a chain that does not resolve leaves the key and gives no notice', () => {
    const broken = marketplace([], { a: 'b', b: 'a', c: 'missing' });
    for (const name of ['a', 'c'])
      expect(resolveRename(name, broken)).toEqual({ status: 'unknown' });
    const given = { [`a@${NAME}`]: true, [`c@${NAME}`]: true };
    expect(migrateSettingsKeys(given, NAME, broken)).toEqual({ map: given, notices: [] });
  });

  test('a rewrite onto a key the user already has keeps the user value under the new name', () => {
    const both = { [`formatter@${NAME}`]: true, [`code-formatter@${NAME}`]: false };
    expect(migrateSettingsKeys(both, NAME, documented).map).toEqual({
      [`code-formatter@${NAME}`]: false,
    });
  });

  test('a key is matched and noticed under the registered name, not the name in the file', () => {
    const REGISTERED = 'my-registered-name';
    const given = {
      [`formatter@${REGISTERED}`]: true,
      [`formatter@${NAME}`]: false,
    };
    const { map, notices } = migrateSettingsKeys(given, REGISTERED, documented);
    expect(map).toEqual({
      [`code-formatter@${REGISTERED}`]: true,
      [`formatter@${NAME}`]: false,
    });
    expect(notices).toEqual([`Renamed to "code-formatter" in the "${REGISTERED}" marketplace`]);
  });

  test('two old keys rewritten to one new key, the user having none: the first in map order wins', () => {
    const merged = marketplace(['fmt'], { v1: 'fmt', v2: 'fmt' });
    const forward = { [`v1@${NAME}`]: 1, [`v2@${NAME}`]: 2 };
    expect(migrateSettingsKeys(forward, NAME, merged).map).toEqual({ [`fmt@${NAME}`]: 1 });
    const backward = { [`v2@${NAME}`]: 2, [`v1@${NAME}`]: 1 };
    expect(migrateSettingsKeys(backward, NAME, merged).map).toEqual({ [`fmt@${NAME}`]: 2 });
  });

  test('a key that is not name@marketplace is kept', () => {
    const odd = { formatter: true, 'a@b@c': true, '@': true };
    expect(migrateSettingsKeys(odd, NAME, documented)).toEqual({ map: odd, notices: [] });
  });

  test('names of object members are plain names, and a "__proto__" key is data', () => {
    expect(resolveRename('constructor', documented)).toEqual({ status: 'unknown' });
    expect(resolveRename('__proto__', documented)).toEqual({ status: 'unknown' });
    const renameEntries: [string, string | null][] = [
      ['__proto__', null],
      ['toString', 'fmt'],
    ];
    const parsed = marketplace(['fmt'], Object.fromEntries(renameEntries));
    expect(resolveRename('__proto__', parsed)).toEqual({ status: 'removed' });
    const given = Object.fromEntries([
      [`__proto__@${NAME}`, true],
      [`toString@${NAME}`, 1],
    ]);
    const { map } = migrateSettingsKeys(given, NAME, parsed);
    expect(Object.keys(map)).toEqual([`fmt@${NAME}`]);
    expect(Object.getPrototypeOf(map)).toBe(Object.prototype);
  });
});
