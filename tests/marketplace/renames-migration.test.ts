/**
 * plugins/host-marketplace.md § Rename or remove a plugin → Migrate users with a renames map (the
 * example marketplace and its three results: a renamed entry loads under its new name and the old
 * key is rewritten in `enabledPlugins` and `pluginConfigs` of the user, project and local scopes,
 * and the notice is shown once; a `null` entry drops the key; managed settings cannot be rewritten,
 * so the notice recurs; the chain is followed from the oldest name, `renames` is append-only
 * history, `claude plugin validate` rejects `renames.<name>: chain does not resolve`). The
 * uninstall of removed plugins and publish.md's rename page are in renames-removal.test.ts. The
 * tests read the documented `marketplace.json` through `readMarketplace`, so the decisions run over
 * what a host loads. The mechanics are unit-tested in renames.test.ts under marketplace.field.*;
 * the cases the docs leave open are in spec/judgments.md. One message is the host's to print and
 * the kit only decides when: `Plugin "<name>" not cached at <path>` follows a rename in a
 * marketplace added from a git repository or URL until the user runs `/plugin install`; the kit has
 * no cache to look in (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { validateMarketplace } from '../../src/format/marketplace/marketplace.ts';
import {
  migrateSettingsScopes,
  renameNotice,
  resolveRename,
  type ScopedSettings,
} from '../../src/marketplace/renames.ts';
import {
  documented,
  documentedFile,
  key,
  NAME,
  read,
  REMOVED,
} from '../support/marketplace-renames.ts';
import { spec } from '../support/spec.ts';

const RENAMED = 'Renamed to "code-formatter" in the "your-marketplace" marketplace';

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

  test('the rename is shown once: after the keys are rewritten, user, project and local scopes give no second notice', () => {
    const first = migrateSettingsScopes(
      {
        user: { [key('formatter')]: true },
        project: { [key('formatter')]: true },
        local: { [key('formatter')]: true },
      },
      NAME,
      documented,
    );
    expect(first.notices).toEqual([RENAMED]);
    expect(migrateSettingsScopes(first.scopes, NAME, documented).notices).toEqual([]);
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

  test('claude plugin validate rejects a chain that ends anywhere other than null or a name in plugins, with renames.<name>: chain does not resolve', () => {
    const issues = validateMarketplace({ ...documentedFile, renames: { formatter: 'gone' } });
    const found = issues.filter((i) => i.severity === 'error' && i.path === 'renames.formatter');
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toStartWith('chain does not resolve');
  });

  test('the documented example validates cleanly', () => {
    expect(validateMarketplace(documentedFile).filter((i) => i.path.startsWith('renames'))).toEqual(
      [],
    );
  });
});
