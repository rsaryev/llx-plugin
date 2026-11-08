/**
 * marketplace-reference.md § Plugin entries (the field table: source, description, version,
 * category, tags, strict, defaultEnabled, displayName) and § Validation messages (the `plugins[i]`
 * rows). The name is `entries-name.test.ts`; the other fields are `entries-fields.test.ts`.
 *
 * The plugin source parser is a later piece of the stream: a stand-in (`stubSourceParser`) proves
 * that the entry reader delegates `source` to it; marketplaces are read with the real entry reader.
 */
import { describe, expect, test } from 'bun:test';
import {
  loaded,
  rawEntry,
  readOne,
  readPlugins,
  slotAt,
  stubSourceParser,
} from '../../support/marketplace-entries.ts';
import { errorsOf } from '../../support/marketplace-fixtures.ts';
import { spec } from '../../support/spec.ts';

describe('the documented entry', () => {
  test('create-marketplace.md: name, source and description load without an issue', () => {
    const raw = {
      name: 'my-first-plugin',
      source: './plugins/my-first-plugin',
      description: 'A greeting plugin to learn the basics',
    };
    const { entry, issues } = readOne(raw);
    expect(issues).toEqual([]);
    expect(entry?.name).toBe('my-first-plugin');
    expect(entry?.description).toBe('A greeting plugin to learn the basics');
    expect(entry?.strict).toBe(true);
  });

  test('an entry that is not an object is dropped alone', () => {
    for (const raw of [null, 'text', 3, ['a']]) {
      const { entry, issues } = readOne(raw, slotAt(2));
      expect(entry).toBeUndefined();
      expect(errorsOf(issues).map((found) => found.path)).toEqual(['plugins[2]']);
    }
  });

  test('one invalid entry does not fail the marketplace', () => {
    const result = readPlugins([
      rawEntry({ name: 'a' }),
      rawEntry({ name: 'b c' }),
      rawEntry({ name: 'd' }),
    ]);
    expect(result.marketplace?.plugins.map((entry) => entry.name)).toEqual(['a', 'd']);
    expect(errorsOf(result.issues).every((found) => found.path.startsWith('plugins[1]'))).toBe(
      true,
    );
  });
});

spec('marketplace.entry.source', () => {
  test('is required: an entry without one is "Invalid input" on plugins[i].source and is dropped', () => {
    const { entry, issues } = readOne(rawEntry({ source: undefined }), slotAt(1));
    expect(entry).toBeUndefined();
    expect(issues).toEqual([
      { severity: 'error', path: 'plugins[1].source', message: 'Invalid input' },
    ]);
  });

  test("the value is handed to the plugin source parser with the entry's slot, and its source is kept", () => {
    const seen: unknown[] = [];
    const slot = slotAt(4, { pluginRoot: './plugins' });
    const raw = { source: 'github', repo: 'your-org/formatter' };
    const { entry } = readOne(rawEntry({ source: raw }), slot, (value, at) => {
      seen.push({ raw: value, index: at.index, pluginRoot: at.pluginRoot });
      return stubSourceParser(value, at);
    });
    expect(seen).toEqual([{ raw, index: 4, pluginRoot: './plugins' }]);
    expect(entry?.source).toEqual({ kind: 'github', repo: 'your-org/formatter' });
  });

  test('what the parser reports as an error drops the entry and is reported as it came', () => {
    const { entry, issues } = readOne(rawEntry({ source: { source: 'nowhere' } }), slotAt(2));
    expect(entry).toBeUndefined();
    expect(issues).toEqual([
      { severity: 'error', path: 'plugins[2].source', message: 'Invalid input' },
    ]);
  });

  test('a string or an object is what a source is; anything else never reaches a source', () => {
    for (const source of ['./plugins/x', { source: 'github', repo: 'a/b' }]) {
      expect(readOne(rawEntry({ source })).entry).toBeDefined();
    }
    expect(readOne(rawEntry({ source: 5 })).entry).toBeUndefined();
  });
});

spec(['marketplace.entry.description', 'marketplace.entry.displayName'], () => {
  test('are strings carried on the entry', () => {
    const entry = loaded(rawEntry({ description: 'Shown in /plugin', displayName: 'My Plugin' }));
    expect(entry.description).toBe('Shown in /plugin');
    expect(entry.displayName).toBe('My Plugin');
  });

  test('a displayName may hold spaces and any casing', () => {
    expect(readOne(rawEntry({ displayName: 'My  Plugin, v2' })).issues).toEqual([]);
  });

  test('another type drops the entry, naming the field', () => {
    for (const key of ['description', 'displayName']) {
      const { entry, issues } = readOne(rawEntry({ [key]: 4 }));
      expect(entry).toBeUndefined();
      expect(issues).toEqual([
        {
          severity: 'error',
          path: `plugins[0].${key}`,
          message: 'Invalid input: expected string, received number',
        },
      ]);
    }
  });
});

spec('marketplace.entry.version', () => {
  test('is a string carried on the entry and is not checked against semver', () => {
    expect(loaded(rawEntry({ version: '2.1.0' })).version).toBe('2.1.0');
    expect(readOne(rawEntry({ version: 'nightly' })).issues).toEqual([]);
  });

  test('another type drops the entry', () => {
    const { entry, issues } = readOne(rawEntry({ version: 2 }));
    expect(entry).toBeUndefined();
    expect(errorsOf(issues).map((found) => found.path)).toEqual(['plugins[0].version']);
  });

  test('a relative entry whose plugin.json says another version gets the documented warning', () => {
    const context = { pluginManifests: new Map([[0, { name: 'my-plugin', version: '2.0.0' }]]) };
    const result = readPlugins([rawEntry({ version: '1.0.0' })], context);
    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: 'plugins[0].version',
        message:
          'Entry declares version "1.0.0" but ./plugins/my-plugin/.claude-plugin/plugin.json says "2.0.0". At install time, plugin.json wins',
      },
    ]);
    expect(result.marketplace?.plugins[0]?.version).toBe('1.0.0');
  });

  test('no warning when the versions agree, plugin.json has none, or the entry has none', () => {
    const agree = { pluginManifests: new Map([[0, { name: 'p', version: '1.0.0' }]]) };
    expect(readPlugins([rawEntry({ version: '1.0.0' })], agree).issues).toEqual([]);
    const silent = { pluginManifests: new Map([[0, { name: 'p' }]]) };
    expect(readPlugins([rawEntry({ version: '1.0.0' })], silent).issues).toEqual([]);
    const none = { pluginManifests: new Map([[0, { name: 'p', version: '2.0.0' }]]) };
    expect(readPlugins([rawEntry()], none).issues).toEqual([]);
  });

  test('only a relative-path entry is compared: plugin.json of any other source is not read before install', () => {
    const context = { pluginManifests: new Map([[0, { name: 'p', version: '2.0.0' }]]) };
    const entry = rawEntry({ version: '1.0.0', source: { source: 'github', repo: 'a/b' } });
    expect(readPlugins([entry], context).issues).toEqual([]);
  });
});

spec(['marketplace.entry.category', 'marketplace.entry.tags'], () => {
  // The docs call both free-form labels and describe nothing a host does with them: only the type
  // contract is proven, and the wording of the type errors is a judgment (spec/judgments.md).
  test('a category string and an array of tag strings are carried verbatim', () => {
    const entry = loaded(rawEntry({ category: 'My Category!', tags: ['a b', 'C', '日本'] }));
    expect(entry.category).toBe('My Category!');
    expect(entry.tags).toEqual(['a b', 'C', '日本']);
  });

  test('a wrong type is an error on that field and drops that entry alone', () => {
    const bad = [
      rawEntry({ name: 'c', category: 3 }),
      rawEntry({ name: 't1', tags: 'ci' }),
      rawEntry({ name: 't2', tags: ['ok', 4] }),
      rawEntry({ name: 'fine' }),
    ];
    const result = readPlugins(bad);
    expect(result.marketplace?.plugins.map((entry) => entry.name)).toEqual(['fine']);
    expect(errorsOf(result.issues).map((found) => found.path)).toEqual([
      'plugins[0].category',
      'plugins[1].tags',
      'plugins[2].tags[1]',
    ]);
  });
});

spec('marketplace.entry.strict', () => {
  test('defaults to true', () => {
    expect(loaded(rawEntry()).strict).toBe(true);
  });

  test('false is carried', () => {
    expect(loaded(rawEntry({ strict: false })).strict).toBe(false);
  });

  test('a value that is not a boolean drops the entry', () => {
    for (const strict of ['false', 0, null]) {
      const { entry, issues } = readOne(rawEntry({ strict }));
      expect(entry).toBeUndefined();
      expect(errorsOf(issues).map((found) => found.path)).toEqual(['plugins[0].strict']);
    }
  });
});

spec('marketplace.entry.defaultEnabled', () => {
  test('a boolean is carried; absent stays absent so the plugin.json value can apply', () => {
    expect(loaded(rawEntry({ defaultEnabled: false })).defaultEnabled).toBe(false);
    expect(loaded(rawEntry({ defaultEnabled: true })).defaultEnabled).toBe(true);
    expect(loaded(rawEntry()).defaultEnabled).toBeUndefined();
  });

  test('another type drops the entry', () => {
    const { entry, issues } = readOne(rawEntry({ defaultEnabled: 'yes' }));
    expect(entry).toBeUndefined();
    expect(errorsOf(issues).map((found) => found.path)).toEqual(['plugins[0].defaultEnabled']);
  });
});
