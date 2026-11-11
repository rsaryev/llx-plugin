/**
 * plugins/host-marketplace.md § Uninstall removed plugins from users' machines (what
 * `forceRemoveDeletedPlugins: true` does at each session start: compare what users installed from
 * the marketplace with the entries and the `renames` map, treat a plugin that is neither listed nor
 * renamed as removed, uninstall it from the user, project and local scopes, leave what only managed
 * settings installed, flag it `Removed from marketplace`; without the field a removed plugin stays
 * installed) and § Work around what a marketplace can't do ("Mark a plugin deprecated": remove the entry, map
 * its name to `null`, optionally set the flag). The kit decides; the host uninstalls. What the docs
 * leave open (a null entry, a broken chain, a managed-only install, other marketplaces) is outside
 * `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { Marketplace } from '../../src/format/marketplace/types.ts';
import { removedPlugins, type InstalledPlugin } from '../../src/marketplace/removal.ts';
import { spec } from '../support/spec.ts';

const NAME = 'your-marketplace';

const marketplace = (
  plugins: readonly string[],
  extra: Partial<Pick<Marketplace, 'renames' | 'forceRemoveDeletedPlugins'>> = {},
): Marketplace => ({
  name: NAME,
  owner: { name: 'Your Org' },
  plugins: plugins.map((name) => ({
    name,
    source: { kind: 'relative', path: `plugins/${name}`, bare: false },
    strict: true,
    components: {},
    display: {},
  })),
  forceRemoveDeletedPlugins: true,
  allowCrossMarketplaceDependenciesOn: [],
  renames: {},
  ...extra,
});

const installed = (
  name: string,
  scopes: InstalledPlugin['scopes'] = ['user'],
  from = NAME,
): InstalledPlugin => ({ name, marketplace: from, scopes });

const FLAGGED = 'Removed from marketplace';

spec('marketplace.field.forceRemoveDeletedPlugins', () => {
  test('a plugin that is neither listed nor renamed is removed, flagged and uninstalled', () => {
    const found = removedPlugins(
      [installed('legacy-linter', ['user', 'project'])],
      marketplace(['code-formatter']),
    );
    expect(found).toEqual([
      { id: `legacy-linter@${NAME}`, status: FLAGGED, uninstallFrom: ['user', 'project'] },
    ]);
  });

  test('a listed plugin stays', () => {
    expect(removedPlugins([installed('code-formatter')], marketplace(['code-formatter']))).toEqual(
      [],
    );
  });

  test('a renamed plugin stays: the renames map is consulted as well as the entries', () => {
    const m = marketplace(['code-formatter'], { renames: { formatter: 'code-formatter' } });
    expect(removedPlugins([installed('formatter')], m)).toEqual([]);
  });

  test('without the field a removed plugin stays installed', () => {
    const m = marketplace([], { forceRemoveDeletedPlugins: false });
    expect(removedPlugins([installed('legacy-linter')], m)).toEqual([]);
  });

  test('it is uninstalled from the user, project and local scopes, never from managed', () => {
    const found = removedPlugins(
      [installed('gone', ['user', 'project', 'local', 'managed'])],
      marketplace([]),
    );
    expect(found.map((one) => one.uninstallFrom)).toEqual([['user', 'project', 'local']]);
  });

  test('a plugin that only managed settings installed stays in place: nothing to uninstall', () => {
    const found = removedPlugins([installed('gone', ['managed'])], marketplace([]));
    expect(found.flatMap((one) => one.uninstallFrom)).toEqual([]);
  });

  test('"mark a plugin deprecated": the entry removed and its name mapped to null is uninstalled', () => {
    const m = marketplace(['code-formatter'], { renames: { 'legacy-linter': null } });
    expect(removedPlugins([installed('legacy-linter')], m).map((one) => one.id)).toEqual([
      `legacy-linter@${NAME}`,
    ]);
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('a plugin that only managed settings installed is still reported as flagged', () => {
    const found = removedPlugins([installed('gone', ['managed'])], marketplace([]));
    expect(found).toEqual([{ id: `gone@${NAME}`, status: FLAGGED, uninstallFrom: [] }]);
  });

  test('removed plugins come in the order they were installed', () => {
    const found = removedPlugins(
      [installed('b-gone'), installed('kept'), installed('a-gone')],
      marketplace(['kept']),
    );
    expect(found.map((one) => one.id)).toEqual([`b-gone@${NAME}`, `a-gone@${NAME}`]);
  });

  test('only what was installed from this marketplace is considered', () => {
    expect(
      removedPlugins([installed('gone', ['user'], 'another-marketplace')], marketplace([])),
    ).toEqual([]);
  });

  test('a renames entry whose chain does not resolve still counts as renamed: nothing is uninstalled on doubt', () => {
    const m = marketplace(['x'], { renames: { a: 'b', b: 'a', c: 'missing' } });
    expect(removedPlugins([installed('a'), installed('c')], m)).toEqual([]);
  });

  test('a plugin that is both listed and a key of renames is listed', () => {
    const m = marketplace(['formatter'], { renames: { formatter: null } });
    expect(removedPlugins([installed('formatter')], m)).toEqual([]);
  });

  test('names of object members are plain names', () => {
    expect(
      removedPlugins([installed('constructor')], marketplace([])).map((one) => one.id),
    ).toEqual([`constructor@${NAME}`]);
  });

  test('nothing installed, nothing removed', () => {
    expect(removedPlugins([], marketplace([]))).toEqual([]);
  });
});
