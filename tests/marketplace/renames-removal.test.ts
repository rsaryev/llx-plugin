/**
 * plugins/host-marketplace.md § Rename or remove a plugin → Uninstall removed plugins from users'
 * machines (`forceRemoveDeletedPlugins`), and plugins/publish.md § Rename or remove a plugin (never
 * change a published `name`, `displayName` changes the label). Without the field a removed plugin
 * stays installed and reports `Plugin "<name>" not found in marketplace`: that wording is the
 * host's, and the kit decides the outcome, `unknown` of `resolveRename` (spec/judgments.md). The
 * renames map itself is in renames-migration.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { readManifest } from '../../src/format/index.ts';
import {
  effectiveDisplayName,
  mergeEntryWithManifest,
} from '../../src/format/marketplace/entry-merge.ts';
import { renameNotice, resolveRename } from '../../src/marketplace/renames.ts';
import { removedPlugins, REMOVED_STATUS } from '../../src/marketplace/removal.ts';
import { loaded, rawEntry } from '../support/marketplace-entries.ts';
import {
  documented,
  documentedFile,
  key,
  NAME,
  read,
  REMOVED,
} from '../support/marketplace-renames.ts';
import { spec } from '../support/spec.ts';

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

  test('without the field a removed plugin stays installed and is not found in the marketplace', () => {
    expect(removedPlugins(installed, flagged(false))).toEqual([]);
    // `Plugin "<name>" not found in marketplace` is the host's wording of this outcome.
    const unlisted = read({ ...documentedFile, renames: undefined });
    expect(resolveRename('legacy-linter', unlisted)).toEqual({ status: 'unknown' });
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
