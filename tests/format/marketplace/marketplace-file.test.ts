/**
 * marketplace-reference.md § Top-level fields (the `owner`, `plugins`, `$schema`, `description`,
 * `version` and `metadata.*` rows) and § Validation messages (the marketplace-level rows);
 * create-marketplace.md § Problems that validation reports. The documented example file is the
 * base of every case; a test changes only the field it is about. The `name` row is
 * `marketplace-name-field.test.ts`.
 *
 * The entries are read by the entry reader (sub-package B); here a recording stand-in proves that
 * the marketplace hands each entry on alone and survives a bad one.
 */
import { describe, expect, test } from 'bun:test';
import {
  readMarketplace,
  validateMarketplace,
} from '../../../src/format/marketplace/marketplace.ts';
import {
  docMarketplace,
  errorsOf,
  recordingEntryReader,
  withFields,
} from '../../support/marketplace-fixtures.ts';
import { spec } from '../../support/spec.ts';

const read = (raw: unknown) => readMarketplace(raw, {}, recordingEntryReader().read);
const validate = (raw: unknown) => validateMarketplace(raw, {}, recordingEntryReader().read);

describe('the documented example', () => {
  test('loads without an issue', () => {
    const result = read(docMarketplace());
    expect(result.issues).toEqual([]);
    expect(result.marketplace?.name).toBe('my-marketplace');
    expect(validate(docMarketplace())).toEqual([]);
  });

  test('a file that is not a JSON object does not load', () => {
    for (const raw of [null, [], 'text', 3]) {
      const result = read(raw);
      expect(result.marketplace).toBeUndefined();
      expect(errorsOf(result.issues)).toHaveLength(1);
    }
  });
});

spec('marketplace.field.owner', () => {
  test('is required: a file without one does not load, with the documented "owner: Invalid input"', () => {
    const result = read(withFields({ owner: undefined }));
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'owner',
      message: 'Invalid input',
    });
  });

  test('an owner that is not an object does not load', () => {
    for (const owner of ['Your Name', 3, null, ['Your Name']]) {
      const result = read(withFields({ owner }));
      expect(result.marketplace).toBeUndefined();
      expect(errorsOf(result.issues).map((found) => found.path)).toEqual(['owner']);
    }
  });

  test('name is required in it', () => {
    const result = read(withFields({ owner: { email: 'a@b.c' } }));
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'owner.name',
      message: 'Invalid input',
    });
  });

  test('an empty name is "Author name cannot be empty"', () => {
    const result = read(withFields({ owner: { name: '' } }));
    expect(result.marketplace).toBeUndefined();
    expect(errorsOf(result.issues)).toEqual([
      { severity: 'error', path: 'owner.name', message: 'Author name cannot be empty' },
    ]);
  });

  test('email and url are optional and carried', () => {
    const owner = { name: 'Your Name', email: 'you@example.com', url: 'https://example.com' };
    expect(read(withFields({ owner })).marketplace?.owner).toEqual(owner);
    expect(read(docMarketplace()).marketplace?.owner).toEqual({ name: 'Your Name' });
  });

  test('an email or url that is not a string does not load', () => {
    for (const owner of [
      { name: 'n', email: 3 },
      { name: 'n', url: false },
    ]) {
      expect(read(withFields({ owner })).marketplace).toBeUndefined();
    }
  });
});

spec('marketplace.field.plugins', () => {
  test('is required: a file without it does not load', () => {
    const result = read(withFields({ plugins: undefined }));
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'plugins',
      message: 'Invalid input',
    });
  });

  test('anything but an array does not load', () => {
    for (const plugins of [{}, 'one', 3, null]) {
      expect(read(withFields({ plugins })).marketplace).toBeUndefined();
    }
  });

  test('each entry is handed on alone, in order, with its index', () => {
    const reader = recordingEntryReader();
    const plugins = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
    const result = readMarketplace(withFields({ plugins }), {}, reader.read);
    expect(result.marketplace?.plugins.map((entry) => entry.name)).toEqual(['a', 'b', 'c']);
    expect(reader.slots.map((slot) => slot.index)).toEqual([0, 1, 2]);
  });

  test('one invalid entry does not fail the marketplace: it is dropped, the rest load, the error is reported', () => {
    const plugins = [{ name: 'a' }, { name: 'bad' }, { name: 'c' }];
    const result = read(withFields({ plugins }));
    expect(result.marketplace?.plugins.map((entry) => entry.name)).toEqual(['a', 'c']);
    expect(result.issues).toEqual([
      { severity: 'error', path: 'plugins[1]', message: 'invalid entry' },
    ]);
    expect(validate(withFields({ plugins }))).toEqual([...result.issues]);
  });

  test('an empty array loads with the warning "Marketplace has no plugins defined"', () => {
    const result = read(withFields({ plugins: [] }));
    expect(result.marketplace?.plugins).toEqual([]);
    expect(result.issues).toEqual([
      { severity: 'warning', path: 'plugins', message: 'Marketplace has no plugins defined' },
    ]);
  });

  test('an entry that is not an object reaches the entry reader like any other', () => {
    const reader = recordingEntryReader();
    readMarketplace(withFields({ plugins: ['./plugins/a', null] }), {}, reader.read);
    expect(reader.slots).toHaveLength(2);
  });

  test('metadata.pluginRoot goes to the entry reader with every entry', () => {
    const reader = recordingEntryReader();
    readMarketplace(
      withFields({ metadata: { pluginRoot: './plugins' }, plugins: [{ name: 'a' }] }),
      {},
      reader.read,
    );
    expect(reader.slots).toEqual([{ index: 0, pluginRoot: './plugins' }]);
  });
});

spec('marketplace.field.$schema', () => {
  const without = withFields({ $schema: undefined });
  const withSchema = withFields({
    $schema: 'https://json.schemastore.org/claude-code-marketplace.json',
  });

  test('is ignored at load time: the same marketplace, the same issues', () => {
    expect(read(withSchema)).toEqual(read(without));
    expect(read(withSchema).issues).toEqual([]);
  });

  test('is not an unknown field and is not on the marketplace', () => {
    const result = read(withSchema);
    expect(result.issues.map((found) => found.message).join('\n')).not.toContain('Unknown field');
    expect(Object.keys(result.marketplace ?? {})).not.toContain('$schema');
  });

  test('a $schema that is not a string is an error on $schema', () => {
    const result = read(withFields({ $schema: 7 }));
    expect(result.marketplace).toBeUndefined();
    expect(errorsOf(result.issues).map((found) => found.path)).toEqual(['$schema']);
  });
});

describe('top-level keys Claude Code does not read', () => {
  test('are ignored with the quoted warning on the key, and the marketplace loads', () => {
    const result = read(withFields({ pluginz: [] }));
    expect(result.marketplace).toBeDefined();
    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: 'pluginz',
        message: "Unknown field 'pluginz'. Claude Code ignores it at load time.",
      },
    ]);
  });
});

describe('the other top-level keys (read as typed values; their rules belong to renames and removal)', () => {
  test('forceRemoveDeletedPlugins, allowCrossMarketplaceDependenciesOn and renames default and are carried', () => {
    const bare = read(docMarketplace()).marketplace;
    expect(bare?.forceRemoveDeletedPlugins).toBe(false);
    expect(bare?.allowCrossMarketplaceDependenciesOn).toEqual([]);
    expect(bare?.renames).toEqual({});
    const set = read(
      withFields({
        forceRemoveDeletedPlugins: true,
        allowCrossMarketplaceDependenciesOn: ['shared-libs'],
        renames: { old: 'new', gone: null },
      }),
    ).marketplace;
    expect(set?.forceRemoveDeletedPlugins).toBe(true);
    expect(set?.allowCrossMarketplaceDependenciesOn).toEqual(['shared-libs']);
    expect(set?.renames).toEqual({ old: 'new', gone: null });
  });

  test('a value of the wrong type is an error on its key', () => {
    for (const [key, value] of [
      ['forceRemoveDeletedPlugins', 'yes'],
      ['allowCrossMarketplaceDependenciesOn', 'shared-libs'],
      ['allowCrossMarketplaceDependenciesOn', [1]],
      ['renames', ['a']],
      ['renames', { old: 3 }],
    ] as const) {
      expect(read(withFields({ [key]: value })).marketplace).toBeUndefined();
    }
  });
});
