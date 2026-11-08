/**
 * plugins/manifest-reference.md § `defaultEnabled` ("Whether the plugin starts enabled when the user
 * hasn't set it in `enabledPlugins`. Defaults to `true`. ... The same field in the marketplace entry
 * overrides this one. Once a user's `enabledPlugins` entry is written, it persists across plugin
 * updates") and § `displayName` ("The name shown in UI in place of `name`. ... isn't used for
 * namespacing or lookup. ... a `displayName` on the marketplace entry takes precedence"). The type
 * checks of both fields are in manifest-fields.test.ts; here is what each field does.
 */
import { expect, test } from 'bun:test';
import { readManifest } from '../../src/format/index.ts';
import {
  effectiveDisplayName,
  mergeEntryWithManifest,
} from '../../src/format/marketplace/entry-merge.ts';
import { enabledPlugin } from '../../src/settings/plugins/index.ts';
import { loadPlugin } from '../../src/index.ts';
import { loaded, rawEntry } from '../support/marketplace-entries.ts';
import { json } from '../support/plugin-folder.ts';
import { memoryFiles } from '../support/ports.ts';
import { viewOf } from '../support/plugin-settings.ts';
import { spec } from '../support/spec.ts';

const manifestOf = (raw: Record<string, unknown>) => {
  const { manifest } = readManifest({ name: 'my-plugin', ...raw });
  if (!manifest) throw new Error('the manifest does not load');
  return manifest;
};
const merge = (entry: Record<string, unknown>, raw: Record<string, unknown>) =>
  mergeEntryWithManifest(loaded(rawEntry(entry)), manifestOf(raw));

spec('manifest.field.defaultEnabled', () => {
  const id = 'my-plugin@acme';

  test('a plugin with no enabledPlugins entry starts as its manifest says, and enabled when it says nothing', () => {
    const view = viewOf(['user', {}]);
    expect(enabledPlugin(view, id, manifestOf({ defaultEnabled: false }).defaultEnabled).on).toBe(
      false,
    );
    expect(enabledPlugin(view, id, manifestOf({ defaultEnabled: true }).defaultEnabled).on).toBe(
      true,
    );
    expect(enabledPlugin(view, id, manifestOf({}).defaultEnabled).on).toBe(true);
    expect(enabledPlugin(view, id, false).decidedBy).toBe('defaultEnabled');
  });

  test('once the user has an entry it wins either way, so a later release changing the field changes nothing for them', () => {
    const on = viewOf(['user', { enabledPlugins: { [id]: true } }]);
    const off = viewOf(['user', { enabledPlugins: { [id]: false } }]);
    expect(enabledPlugin(on, id, false).on).toBe(true);
    expect(enabledPlugin(off, id, true).on).toBe(false);
  });

  test("the marketplace entry's value overrides the manifest's", () => {
    const merged = merge({ defaultEnabled: false }, { defaultEnabled: true });
    const view = viewOf(['user', {}]);
    expect(enabledPlugin(view, id, merged.manifest?.defaultEnabled).on).toBe(false);
  });
});

spec('manifest.field.displayName', () => {
  test('is the name shown in place of name: users see it, and the name when it is absent', () => {
    expect(effectiveDisplayName(merge({}, { displayName: 'Deploy Tools' }))).toBe('Deploy Tools');
    expect(effectiveDisplayName(merge({}, {}))).toBe('my-plugin');
  });

  test('may hold spaces and any casing, and is not used for namespacing: components stay under name', async () => {
    const { plugin, issues } = await loadPlugin({
      files: memoryFiles({
        '.claude-plugin/plugin.json': json({
          name: 'deploy-tools',
          displayName: 'Deploy Tools (Team A)',
        }),
        'commands/status.md': 'Show status.',
      }),
    });
    expect(issues).toEqual([]);
    expect(plugin?.commands.map((one) => one.qualifiedName)).toEqual(['deploy-tools:status']);
    expect(plugin?.name).toBe('deploy-tools');
  });

  test('a displayName on the marketplace entry takes precedence', () => {
    expect(effectiveDisplayName(merge({ displayName: 'Entry' }, { displayName: 'Manifest' }))).toBe(
      'Entry',
    );
  });
});
