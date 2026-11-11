/**
 * plugins/marketplace-reference.md § Display fields: the seven display fields an entry and
 * plugin.json can both set, which the user sees before and after install, and that "before
 * install, Claude Code can read plugin.json only for entries with a relative-path source".
 */
import { expect, test } from 'bun:test';
import { listingFields } from '../../../src/format/marketplace/display-fields.ts';
import type { PluginManifest } from '../../../src/format/manifest-schema.ts';
import { loaded, rawEntry } from '../../support/marketplace-entries.ts';
import { spec } from '../../support/spec.ts';

const FROM_MANIFEST: PluginManifest = {
  name: 'my-plugin',
  displayName: 'Manifest Name',
  description: 'from plugin.json',
  author: { name: 'Manifest Author' },
  homepage: 'https://manifest.example',
  repository: 'https://github.com/manifest/repo',
  license: 'Apache-2.0',
  keywords: ['manifest'],
};

const github = { source: 'github', repo: 'acme/formatter' };

spec('marketplace.rule.Display fields', () => {
  test('after install, a field the entry leaves unset shows the plugin.json value, for all seven fields', () => {
    const shown = listingFields(loaded(rawEntry()), FROM_MANIFEST, 'installed');
    expect(shown).toEqual({
      displayName: 'Manifest Name',
      description: 'from plugin.json',
      author: { name: 'Manifest Author' },
      homepage: 'https://manifest.example',
      repository: 'https://github.com/manifest/repo',
      license: 'Apache-2.0',
      keywords: ['manifest'],
    });
  });

  test("after install, each field the entry sets is the entry's, one at a time", () => {
    const fromEntry = {
      displayName: 'Entry Name',
      description: 'from the entry',
      author: { name: 'Entry Author' },
      homepage: 'https://entry.example',
      repository: 'https://github.com/entry/repo',
      license: 'MIT',
      keywords: ['entry'],
    };
    for (const [key, value] of Object.entries(fromEntry)) {
      const shown = listingFields(loaded(rawEntry({ [key]: value })), FROM_MANIFEST, 'installed');
      expect(Reflect.get(shown, key)).toEqual(value);
      const others = Object.keys(fromEntry).filter((other) => other !== key);
      for (const other of others) {
        expect(Reflect.get(shown, other)).toEqual(Reflect.get(FROM_MANIFEST, other));
      }
    }
  });

  test('before install, a relative-path entry shows plugin.json too: its files are inside the marketplace', () => {
    const entry = loaded(rawEntry({ description: 'from the entry' }));
    const shown = listingFields(entry, FROM_MANIFEST, 'listed');
    expect(shown.description).toBe('from the entry');
    expect(shown.license).toBe('Apache-2.0');
    expect(shown.displayName).toBe('Manifest Name');
  });

  test("before install, an entry with any other source shows only the entry's own fields", () => {
    const entry = loaded(rawEntry({ source: github, description: 'from the entry' }));
    expect(listingFields(entry, FROM_MANIFEST, 'listed')).toEqual({
      description: 'from the entry',
    });
  });

  test('after install, the same github entry shows the plugin.json values it could not before', () => {
    const entry = loaded(rawEntry({ source: github, description: 'from the entry' }));
    const shown = listingFields(entry, FROM_MANIFEST, 'installed');
    expect(shown.license).toBe('Apache-2.0');
    expect(shown.description).toBe('from the entry');
  });

  test('a plugin with no plugin.json shows what the entry sets, and nothing is invented', () => {
    expect(listingFields(loaded(rawEntry({ license: 'MIT' })), undefined, 'installed')).toEqual({
      license: 'MIT',
    });
  });
});
