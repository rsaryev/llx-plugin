/**
 * plugins/host-marketplace.md § Rename or remove a plugin → Migrate users with a renames map (the
 * example marketplace and its three results: a renamed entry loads under its new name and the old
 * key is rewritten in `enabledPlugins` and `pluginConfigs` of the user, project and local scopes; a
 * `null` entry drops the key; managed settings cannot be rewritten, so the notice recurs; the chain
 * is followed from the oldest name, `renames` is append-only history, `claude plugin validate`
 * rejects `renames.<name>: chain does not resolve`), → Uninstall removed plugins from users'
 * machines (`forceRemoveDeletedPlugins`), and plugins/publish.md § Rename or remove a plugin (never
 * change a published `name`, `displayName` changes the label). The tests read the documented
 * `marketplace.json` through `readMarketplace`, so the decisions run over what a host loads. The
 * mechanics are unit-tested in renames.test.ts and removal.test.ts under marketplace.field.*; the
 * cases the docs leave open are in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { readManifest } from '../../src/format/index.ts';
import {
  effectiveDisplayName,
  mergeEntryWithManifest,
} from '../../src/format/marketplace/entry-merge.ts';
import { readMarketplace, validateMarketplace } from '../../src/format/marketplace/marketplace.ts';
import type { Marketplace } from '../../src/format/marketplace/types.ts';
import {
  migrateSettingsScopes,
  renameNotice,
  resolveRename,
  type ScopedSettings,
} from '../../src/marketplace/renames.ts';
import { removedPlugins, REMOVED_STATUS } from '../../src/marketplace/removal.ts';
import { loaded, rawEntry } from '../support/marketplace-entries.ts';
import { spec } from '../support/spec.ts';

const NAME = 'your-marketplace';
const RENAMED = 'Renamed to "code-formatter" in the "your-marketplace" marketplace';
const REMOVED = 'Removed from the "your-marketplace" marketplace';

/** The marketplace.json of the docs: `formatter` became `code-formatter`, `legacy-linter` was removed. */
const documentedFile = {
  name: NAME,
  owner: { name: 'Your Org' },
  plugins: [{ name: 'code-formatter', source: './plugins/code-formatter' }],
  renames: { formatter: 'code-formatter', 'legacy-linter': null },
};

const read = (raw: unknown): Marketplace => {
  const { marketplace } = readMarketplace(raw);
  if (marketplace === undefined) throw new Error('the marketplace does not load');
  return marketplace;
};
const documented = read(documentedFile);

const key = (plugin: string) => `${plugin}@${NAME}`;

spec('updates.hosting.Migrate users with a renames map.Renamed entry', () => {
  test('the plugin loads under its new name', () => {
    expect(resolveRename('formatter', documented)).toEqual({
      status: 'renamed',
      to: 'code-formatter',
    });
  });

  test('claude plugin list and /plugin show the renamed notice', () => {
    expect(renameNotice('formatter', documented)).toBe(RENAMED);
  });

  test('the old key becomes the new one in enabledPlugins and pluginConfigs of the user, project and local scopes', () => {
    const enabled: ScopedSettings<boolean> = {
      user: { [key('formatter')]: true },
      project: { [key('formatter')]: false },
      local: { [key('formatter')]: true },
    };
    const configs: ScopedSettings<unknown> = {
      user: { [key('formatter')]: { options: { indent: 2 } } },
      project: { [key('formatter')]: { options: { indent: 4 } } },
      local: { [key('formatter')]: {} },
    };
    const migratedEnabled = migrateSettingsScopes(enabled, NAME, documented);
    const migratedConfigs = migrateSettingsScopes(configs, NAME, documented);
    expect(migratedEnabled.scopes).toEqual({
      user: { [key('code-formatter')]: true },
      project: { [key('code-formatter')]: false },
      local: { [key('code-formatter')]: true },
    });
    expect(migratedConfigs.scopes).toEqual({
      user: { [key('code-formatter')]: { options: { indent: 2 } } },
      project: { [key('code-formatter')]: { options: { indent: 4 } } },
      local: { [key('code-formatter')]: {} },
    });
    expect(migratedEnabled.notices).toEqual([RENAMED]);
  });

  test('a user who already uses the new name sees no rename at all', () => {
    expect(resolveRename('code-formatter', documented)).toEqual({ status: 'current' });
    expect(renameNotice('code-formatter', documented)).toBeUndefined();
  });
});

spec('updates.hosting.Migrate users with a renames map.null entry', () => {
  test('the old key is dropped from the user, project and local scopes', () => {
    const enabled: ScopedSettings<boolean> = {
      user: { [key('legacy-linter')]: true, [key('code-formatter')]: true },
      project: { [key('legacy-linter')]: true },
      local: { [key('legacy-linter')]: false },
    };
    const { scopes } = migrateSettingsScopes(enabled, NAME, documented);
    expect(scopes).toEqual({
      user: { [key('code-formatter')]: true },
      project: {},
      local: {},
    });
  });

  test('the user sees Removed from the "your-marketplace" marketplace', () => {
    expect(resolveRename('legacy-linter', documented)).toEqual({ status: 'removed' });
    expect(renameNotice('legacy-linter', documented)).toBe(REMOVED);
    expect(
      migrateSettingsScopes({ user: { [key('legacy-linter')]: true } }, NAME, documented).notices,
    ).toEqual([REMOVED]);
  });
});

spec('updates.hosting.Migrate users with a renames map.Enabled in managed settings', () => {
  const managed: ScopedSettings<boolean> = { managed: { [key('formatter')]: true } };

  test('the plugin still loads under its new name', () => {
    expect(resolveRename('formatter', documented)).toEqual({
      status: 'renamed',
      to: 'code-formatter',
    });
  });

  test('Claude Code cannot rewrite managed settings: the key stays as the admin wrote it', () => {
    expect(migrateSettingsScopes(managed, NAME, documented).scopes).toEqual(managed);
  });

  test('the notice recurs on every session until an admin updates enabledPlugins there', () => {
    const first = migrateSettingsScopes(managed, NAME, documented);
    const second = migrateSettingsScopes(first.scopes, NAME, documented);
    expect(first.notices).toEqual([RENAMED]);
    expect(second.notices).toEqual([RENAMED]);
    const updated: ScopedSettings<boolean> = { managed: { [key('code-formatter')]: true } };
    expect(migrateSettingsScopes(updated, NAME, documented).notices).toEqual([]);
  });

  test('a user scope with the same key is rewritten while the managed scope beside it is not', () => {
    const both: ScopedSettings<boolean> = {
      managed: { [key('formatter')]: true },
      user: { [key('formatter')]: true },
    };
    const { scopes } = migrateSettingsScopes(both, NAME, documented);
    expect(scopes.managed).toEqual({ [key('formatter')]: true });
    expect(scopes.user).toEqual({ [key('code-formatter')]: true });
  });
});

/** The rest of the section has no id of its own (its three results do); its prose is checked here, outside `spec(...)`. */
describe('the rest of the renames section: no entry, append-only history, validate', () => {
  test('without a renames entry the old name is not found: Plugin "<name>" not found in marketplace', () => {
    const noMap = read({ ...documentedFile, renames: undefined });
    expect(resolveRename('formatter', noMap)).toEqual({ status: 'unknown' });
    expect(
      migrateSettingsScopes({ user: { [key('formatter')]: true } }, NAME, noMap).notices,
    ).toEqual([]);
  });

  test('renames is append-only history: renaming again adds a second entry and the chain is followed from the oldest name', () => {
    const again = read({
      ...documentedFile,
      plugins: [{ name: 'fmt', source: './plugins/fmt' }],
      renames: { formatter: 'code-formatter', 'code-formatter': 'fmt', 'legacy-linter': null },
    });
    expect(resolveRename('formatter', again)).toEqual({ status: 'renamed', to: 'fmt' });
    expect(resolveRename('code-formatter', again)).toEqual({ status: 'renamed', to: 'fmt' });
    const { scopes } = migrateSettingsScopes(
      { user: { [key('formatter')]: true, [key('code-formatter')]: false } },
      NAME,
      again,
    );
    expect(scopes.user).toEqual({ [key('fmt')]: true });
  });

  test('claude plugin validate rejects a chain that cycles', () => {
    const issues = validateMarketplace({
      ...documentedFile,
      renames: { formatter: 'fmt', fmt: 'formatter' },
    });
    const found = issues.filter((i) => i.message.startsWith('chain does not resolve'));
    expect(found.map((i) => [i.severity, i.path])).toEqual([
      ['error', 'renames.formatter'],
      ['error', 'renames.fmt'],
    ]);
  });

  test('claude plugin validate rejects a chain that ends anywhere other than null or a name in plugins', () => {
    const issues = validateMarketplace({ ...documentedFile, renames: { formatter: 'gone' } });
    expect(
      issues.filter((i) => i.severity === 'error' && i.path === 'renames.formatter'),
    ).toHaveLength(1);
  });

  test('the documented example validates cleanly', () => {
    expect(validateMarketplace(documentedFile).filter((i) => i.path.startsWith('renames'))).toEqual(
      [],
    );
  });
});

/**
 * The id holds an apostrophe, which the `check:spec` literal scan (`'...'` or `"..."` only) cannot
 * read, so it is a name here; `spec()` still refuses an id that is not in requirements.json.
 */
const UNINSTALL_REMOVED = `updates.hosting.Uninstall removed plugins from users${String.fromCodePoint(39)} machines`;

spec(UNINSTALL_REMOVED, () => {
  const flagged = (flag: boolean) =>
    read({ ...documentedFile, ...(flag ? { forceRemoveDeletedPlugins: true } : {}) });
  const installed = [
    { name: 'legacy-linter', marketplace: NAME, scopes: ['user', 'project', 'local'] as const },
    { name: 'dropped', marketplace: NAME, scopes: ['user'] as const },
    { name: 'formatter', marketplace: NAME, scopes: ['user'] as const },
    { name: 'code-formatter', marketplace: NAME, scopes: ['user'] as const },
  ];

  test('without the field a removed plugin stays installed', () => {
    expect(removedPlugins(installed, flagged(false))).toEqual([]);
  });

  test('with it, a plugin neither listed nor renamed is removed; listed and renamed ones stay', () => {
    expect(removedPlugins(installed, flagged(true)).map((one) => one.id)).toEqual([
      key('legacy-linter'),
      key('dropped'),
    ]);
  });

  test('each removed plugin is uninstalled from the user, project and local scopes', () => {
    const [legacy] = removedPlugins(installed, flagged(true));
    expect(legacy?.uninstallFrom).toEqual(['user', 'project', 'local']);
  });

  test('plugins that only managed settings installed stay in place', () => {
    const [only] = removedPlugins(
      [{ name: 'dropped', marketplace: NAME, scopes: ['managed'] }],
      flagged(true),
    );
    expect(only?.uninstallFrom).toEqual([]);
  });

  test('each removed plugin is listed with the status Removed from marketplace', () => {
    const found = removedPlugins(installed, flagged(true));
    expect(found.every((one) => one.status === REMOVED_STATUS)).toBe(true);
    expect(REMOVED_STATUS).toBe('Removed from marketplace');
  });

  test('the field is read from the top level of marketplace.json', () => {
    expect(flagged(true).forceRemoveDeletedPlugins).toBe(true);
    expect(flagged(false).forceRemoveDeletedPlugins).toBe(false);
  });
});

spec('updates.publish.Rename or remove a plugin', () => {
  test('displayName changes the label users see and keeps the name unchanged', () => {
    const { manifest } = readManifest({
      name: 'code-formatter',
      displayName: 'Code Formatter Pro',
    });
    if (manifest === undefined) throw new Error('the manifest does not load');
    const merged = mergeEntryWithManifest(loaded(rawEntry({ name: 'code-formatter' })), manifest);
    expect(effectiveDisplayName(merged)).toBe('Code Formatter Pro');
    expect(merged.installName).toBe('code-formatter');
  });

  test('after a rename with no renames entry users lose the plugin: their install is under the old name', () => {
    const renamedWithoutMap = read({ ...documentedFile, renames: undefined });
    expect(resolveRename('formatter', renamedWithoutMap)).toEqual({ status: 'unknown' });
  });

  test('a renames entry migrates them instead', () => {
    expect(resolveRename('formatter', documented)).toEqual({
      status: 'renamed',
      to: 'code-formatter',
    });
  });

  test('to remove a plugin, delete the entry and map its name to null: existing installs are told, not failed', () => {
    expect(resolveRename('legacy-linter', documented)).toEqual({ status: 'removed' });
    expect(renameNotice('legacy-linter', documented)).toBe(REMOVED);
  });
});

describe('judgments', () => {
  test('a plugin listed again under an old name is current, so a rename that was reverted loads as is', () => {
    const reverted = read({
      ...documentedFile,
      plugins: [{ name: 'formatter', source: './plugins/formatter' }],
      renames: { formatter: 'code-formatter', 'code-formatter': 'formatter' },
    });
    expect(resolveRename('formatter', reverted)).toEqual({ status: 'current' });
  });
});
