/**
 * manifest-reference.md § Marketplace entries and the manifest (Metadata precedence);
 * marketplace-reference.md § Display fields; create-marketplace.md § Keep the entry name and the
 * manifest name the same: which of the entry and plugin.json wins for each field, whatever `strict`
 * says. Entries are read with the real entry reader.
 */
import { expect, test } from 'bun:test';
import {
  effectiveDisplayName,
  mergeEntryWithManifest,
} from '../../../src/format/marketplace/entry-merge.ts';
import type { PluginManifest } from '../../../src/format/manifest-schema.ts';
import { loaded, rawEntry } from '../../support/marketplace-entries.ts';
import { spec } from '../../support/spec.ts';

const merge = (changes: Record<string, unknown>, manifest?: PluginManifest) =>
  mergeEntryWithManifest(loaded(rawEntry(changes)), manifest);
const manifestOf = (rest: Record<string, unknown> = {}): PluginManifest => ({
  name: 'my-plugin',
  ...rest,
});

spec('marketplace.entry.defaultEnabled', () => {
  test("the entry's defaultEnabled overrides the manifest's, with strict true or false", () => {
    for (const strict of [true, false]) {
      const result = merge({ strict, defaultEnabled: false }, manifestOf({ defaultEnabled: true }));
      expect(result.manifest?.defaultEnabled).toBe(false);
    }
    expect(
      merge({ defaultEnabled: true }, manifestOf({ defaultEnabled: false })).manifest
        ?.defaultEnabled,
    ).toBe(true);
  });

  test("an entry that leaves it unset keeps the manifest's; with neither it stays unset", () => {
    expect(merge({}, manifestOf({ defaultEnabled: false })).manifest?.defaultEnabled).toBe(false);
    expect(merge({}, manifestOf()).manifest?.defaultEnabled).toBeUndefined();
  });
});

spec(['marketplace.entry.displayName', 'marketplace.entry.description'], () => {
  test('a display field the entry sets is what users see, even when plugin.json sets another', () => {
    const result = merge(
      {
        displayName: 'Entry Name',
        description: 'from the entry',
        author: { name: 'Entry Author' },
        homepage: 'https://entry.example',
        repository: 'https://github.com/entry/repo',
        license: 'MIT',
        keywords: ['entry'],
      },
      manifestOf({
        displayName: 'Manifest Name',
        description: 'from plugin.json',
        author: { name: 'Manifest Author' },
        homepage: 'https://manifest.example',
        repository: 'https://github.com/manifest/repo',
        license: 'Apache-2.0',
        keywords: ['manifest'],
      }),
    );
    expect(result.manifest).toEqual({
      name: 'my-plugin',
      displayName: 'Entry Name',
      description: 'from the entry',
      author: { name: 'Entry Author' },
      homepage: 'https://entry.example',
      repository: 'https://github.com/entry/repo',
      license: 'MIT',
      keywords: ['entry'],
    });
  });

  test('a display field the entry leaves unset shows the plugin.json value', () => {
    const result = merge(
      { description: 'from the entry' },
      manifestOf({ displayName: 'Manifest Name', license: 'MIT', description: 'from plugin.json' }),
    );
    expect(result.manifest?.displayName).toBe('Manifest Name');
    expect(result.manifest?.license).toBe('MIT');
    expect(result.manifest?.description).toBe('from the entry');
  });

  test("users see the plugin's name when neither sets a displayName", () => {
    expect(effectiveDisplayName(merge({}, manifestOf()))).toBe('my-plugin');
    expect(effectiveDisplayName(merge({}))).toBe('my-plugin');
  });

  test('the entry displayName comes first, then the plugin.json one', () => {
    expect(
      effectiveDisplayName(merge({ displayName: 'Entry' }, manifestOf({ displayName: 'M' }))),
    ).toBe('Entry');
    expect(effectiveDisplayName(merge({}, manifestOf({ displayName: 'Manifest' })))).toBe(
      'Manifest',
    );
  });
});

spec('marketplace.entry.version', () => {
  test("the manifest's version overrides the entry's", () => {
    const result = merge({ version: '1.0.0' }, manifestOf({ version: '2.0.0' }));
    expect(result.manifest?.version).toBe('2.0.0');
  });

  test("the entry's version applies when plugin.json has none or is absent", () => {
    expect(merge({ version: '1.0.0' }, manifestOf()).manifest?.version).toBe('1.0.0');
    expect(merge({ version: '1.0.0' }).manifest?.version).toBe('1.0.0');
  });
});

spec('marketplace.entry.name', () => {
  test('the entry name is the install id and the manifest name is the namespace when they differ', () => {
    const result = merge({ name: 'deploy' }, manifestOf({ name: 'deploy-tools' }));
    expect(result.installName).toBe('deploy');
    expect(result.manifest?.name).toBe('deploy-tools');
  });

  test('without a plugin.json the entry name serves as both', () => {
    const result = merge({ name: 'deploy' });
    expect(result.installName).toBe('deploy');
    expect(result.manifest?.name).toBe('deploy');
  });

  test('with equal names (the recommended setup) they are one', () => {
    const result = merge({}, manifestOf());
    expect(result.installName).toBe(result.manifest?.name ?? '');
  });
});

spec('marketplace.entry.metadata', () => {
  // "Claude Code doesn't read it": a field no host reads has no place in the merged manifest.
  test('metadata, category, tags, relevance and the header fields never reach the merged manifest', () => {
    const result = merge({
      source: { source: 'archive', url: 'https://example.com/p.zip' },
      metadata: { team: 'infra' },
      category: 'devtools',
      tags: ['a'],
      relevance: { topic: 'T', signals: { cli: ['x'] } },
      headers: { Authorization: 'Bearer x' },
      headersHelper: './h.sh',
      strict: false,
    });
    expect(result.manifest).toEqual({ name: 'my-plugin' });
  });
});
