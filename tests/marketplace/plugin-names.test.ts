/**
 * plugins/loading.md § Entry name and manifest name (the entry name is the install and enable key,
 * the cache directory's name and what `claude plugin list` shows; the manifest name is what the
 * components are namespaced under); plugins/create-marketplace.md § Keep the entry name and the
 * manifest name the same (installing by the manifest name reports `Plugin "<manifest-name>" not
 * found in marketplace "<marketplace>"`). Entries are read with the real entry reader.
 */
import { expect, test } from 'bun:test';
import { mergeEntryWithManifest } from '../../src/format/marketplace/entry-merge.ts';
import { lookupPlugin, pluginNames } from '../../src/marketplace/plugin-names.ts';
import { loaded, rawEntry } from '../support/marketplace-entries.ts';
import { spec } from '../support/spec.ts';

const deploy = loaded(rawEntry({ name: 'deploy' }));
const merged = mergeEntryWithManifest(deploy, { name: 'deploy-tools' });

spec('install.loading.Entry name and manifest name', () => {
  test('the install and enable key is the entry name with the marketplace', () => {
    expect(pluginNames(merged, 'acme').installId).toBe('deploy@acme');
  });

  test('the cache directory is named after the entry name', () => {
    expect(pluginNames(merged, 'acme').cacheName).toBe('deploy');
  });

  test('components are namespaced under the manifest name', () => {
    expect(pluginNames(merged, 'acme').namespace).toBe('deploy-tools');
  });

  test('with no plugin.json the entry name serves for the namespace too', () => {
    const noManifest = mergeEntryWithManifest(deploy, undefined);
    expect(pluginNames(noManifest, 'acme')).toEqual({
      installId: 'deploy@acme',
      cacheName: 'deploy',
      namespace: 'deploy',
    });
  });

  test('a plugin that fails to load keeps its entry name for the key and the directory', () => {
    const conflicting = loaded(rawEntry({ name: 'deploy', strict: false, skills: ['./s/'] }));
    const failed = mergeEntryWithManifest(conflicting, { name: 'deploy-tools' });
    expect(failed.manifest).toBeUndefined();
    expect(pluginNames(failed, 'acme').installId).toBe('deploy@acme');
    expect(pluginNames(failed, 'acme').cacheName).toBe('deploy');
  });
});

spec('marketplace.create.Keep the entry name and the manifest name the same', () => {
  const entries = [deploy, loaded(rawEntry({ name: 'lint' }))];
  const missing = { done: true } as const;

  test('installing by the entry name finds the plugin', () => {
    expect(lookupPlugin(entries, 'deploy', 'acme', missing)).toEqual({ entry: deploy });
  });

  test('installing by the manifest name reports it as not found in the marketplace', () => {
    expect(lookupPlugin(entries, 'deploy-tools', 'acme', missing)).toEqual({
      notFound: { message: 'Plugin "deploy-tools" not found in marketplace "acme"' },
    });
  });

  test('a name that matches no entry keeps the refresh hint of a catalog that was not refreshed', () => {
    const result = lookupPlugin(entries, 'nope', 'acme', { done: false });
    expect(result).toEqual({
      notFound: {
        message: 'Plugin "nope" not found in marketplace "acme"',
        hint: 'Your local copy may be out of date — try claude plugin marketplace update acme',
      },
    });
  });

  test('equal names, the recommended setup, make both spellings one', () => {
    const same = mergeEntryWithManifest(loaded(rawEntry({ name: 'lint' })), { name: 'lint' });
    const names = pluginNames(same, 'acme');
    expect(names.cacheName).toBe(names.namespace);
  });
});
