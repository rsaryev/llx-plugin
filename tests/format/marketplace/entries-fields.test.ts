/**
 * marketplace-reference.md § Plugin entries (the field table), § Validation messages (the
 * `plugins[i]` rows). manifest-reference.md § Marketplace entries and the manifest (an entry accepts every plugin.json field but the directory listing fields).
 *
 * The plugin source parser is a later piece of the stream: a stand-in (`stubSourceParser`) proves
 * that the entry reader delegates `source` to it; marketplaces are read with the real entry reader.
 */
import { describe, expect, test } from 'bun:test';
import { ENTRY_KEYS } from '../../../src/format/marketplace/entry-schema.ts';
import { MANIFEST_SCHEMAS } from '../../../src/format/manifest-schema.ts';
import { loaded, rawEntry, readOne, slotAt } from '../../support/marketplace-entries.ts';
import { errorsOf } from '../../support/marketplace-fixtures.ts';
import { spec } from '../../support/spec.ts';

spec('marketplace.entry.dependencies', () => {
  test('each item is "name", "name@marketplace" or an object with name, marketplace and version', () => {
    const dependencies = [
      'audit-logger',
      'audit-logger@your-shared-marketplace',
      { name: 'secrets-vault', marketplace: 'your-shared-marketplace', version: '~2.1.0' },
      { name: 'bare' },
    ];
    expect(loaded(rawEntry({ dependencies })).dependencies).toEqual(dependencies);
  });

  test('an object without a name, or a value that is not an array, drops the entry', () => {
    for (const dependencies of [[{ marketplace: 'm' }], 'audit-logger', [3], [{ name: '' }]]) {
      const { entry, issues } = readOne(rawEntry({ dependencies }));
      expect(entry).toBeUndefined();
      expect(
        errorsOf(issues).every((found) => found.path.startsWith('plugins[0].dependencies')),
      ).toBe(true);
      expect(errorsOf(issues)).not.toEqual([]);
    }
  });
});

spec('marketplace.entry.metadata', () => {
  test('a free-form object of any nested content passes and is carried verbatim', () => {
    const metadata = { team: 'infra', tiers: [1, 2, { deep: null }], nested: { a: { b: true } } };
    const { entry, issues } = readOne(rawEntry({ metadata }));
    expect(issues).toEqual([]);
    expect(entry?.metadata).toEqual(metadata);
  });

  test('anything that is not an object gets the quoted warning and is dropped; the entry loads', () => {
    const cases: [unknown, string][] = [
      ['text', 'string'],
      [5, 'number'],
      [['a'], 'array'],
      [null, 'null'],
      [true, 'boolean'],
    ];
    for (const [metadata, type] of cases) {
      const { entry, issues } = readOne(rawEntry({ metadata }));
      expect(issues).toEqual([
        {
          severity: 'warning',
          path: 'plugins[0].metadata',
          message: `'metadata' must be a free-form object; got ${type}. It will be ignored at load time.`,
        },
      ]);
      expect(entry?.metadata).toBeUndefined();
    }
  });
});

describe('fields an entry accepts beside its own', () => {
  test('every plugin.json field but the directory listing fields is a known key', () => {
    const listing = [
      'icon',
      'documentationUrl',
      'supportUrl',
      'privacyPolicyUrl',
      'termsOfServiceUrl',
    ];
    for (const key of Object.keys(MANIFEST_SCHEMAS)) {
      expect(ENTRY_KEYS.includes(key) || listing.includes(key)).toBe(true);
      expect(ENTRY_KEYS.includes(key)).toBe(!listing.includes(key));
    }
  });

  test('the fields of the entry table are known keys', () => {
    for (const key of [
      'name',
      'source',
      'description',
      'version',
      'category',
      'tags',
      'strict',
      'relevance',
      'dependencies',
      'defaultEnabled',
      'displayName',
      'metadata',
      'headers',
      'headersHelper',
    ]) {
      expect(ENTRY_KEYS).toContain(key);
    }
  });

  test('plugin.json fields load without an unknown-field warning and are carried', () => {
    const raw = rawEntry({
      author: { name: 'Your Org', email: 'o@example.com' },
      homepage: 'https://example.com',
      repository: 'https://github.com/your-org/p',
      license: 'MIT',
      keywords: ['format', 'lint'],
      commands: ['./extra/'],
      hooks: { PostToolUse: [] },
    });
    const { entry, issues } = readOne(raw);
    expect(issues).toEqual([]);
    expect(entry?.display).toEqual({
      author: { name: 'Your Org', email: 'o@example.com' },
      homepage: 'https://example.com',
      repository: 'https://github.com/your-org/p',
      license: 'MIT',
      keywords: ['format', 'lint'],
    });
    expect(entry?.components.commands).toEqual(['./extra/']);
    expect(entry?.components.hooks).toEqual({ PostToolUse: [] });
  });

  test('a plugin.json field of the wrong type drops the entry (homepage must parse as a URL)', () => {
    const { entry, issues } = readOne(rawEntry({ homepage: 'not a url' }));
    expect(entry).toBeUndefined();
    expect(errorsOf(issues).map((found) => found.path)).toEqual(['plugins[0].homepage']);
  });

  test('an unknown key is a warning, not an error, and the entry loads', () => {
    const { entry, issues } = readOne(rawEntry({ tpyo: 1 }), slotAt(5));
    expect(entry?.name).toBe('my-plugin');
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: 'plugins[5].tpyo',
        message: "Unknown field 'tpyo'. Claude Code ignores it at load time.",
      },
    ]);
  });

  test('a directory listing field is reported as an unknown field in an entry', () => {
    const { entry, issues } = readOne(
      rawEntry({ icon: './logo.png', supportUrl: 'https://x.dev' }),
    );
    expect(entry).toBeDefined();
    expect(issues.map((found) => [found.severity, found.path, found.message])).toEqual([
      ['warning', 'plugins[0].icon', "Unknown field 'icon'. Claude Code ignores it at load time."],
      [
        'warning',
        'plugins[0].supportUrl',
        "Unknown field 'supportUrl'. Claude Code ignores it at load time.",
      ],
    ]);
  });

  test("an 'experimental' that is not an object gets the quoted warning and is dropped", () => {
    const { entry, issues } = readOne(rawEntry({ experimental: 'themes' }));
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: 'plugins[0].experimental',
        message:
          "'experimental' must be an object containing component declarations; got string. It will be ignored at load time.",
      },
    ]);
    expect(entry?.components.experimental).toBeUndefined();
  });

  test('an experimental object is carried', () => {
    const experimental = { themes: './themes', evals: './evals' };
    expect(loaded(rawEntry({ experimental })).components.experimental).toEqual(experimental);
  });
});

describe('headers and headersHelper on an entry', () => {
  const archive = { source: 'archive', url: 'https://example.com/p.zip' };

  test('headersHelper on an archive entry that is not "strict": false is the documented error', () => {
    const { entry, issues } = readOne(rawEntry({ source: archive, headersHelper: './h.sh' }));
    expect(entry).toBeUndefined();
    expect(issues).toContainEqual({
      severity: 'error',
      path: 'plugins[0].headersHelper',
      message: 'Plugin "my-plugin" sets headersHelper but is not "strict": false',
    });
  });

  test('with "strict": false the helper is accepted', () => {
    const { entry, issues } = readOne(
      rawEntry({ source: archive, headersHelper: './h.sh', strict: false }),
    );
    expect(errorsOf(issues)).toEqual([]);
    expect(entry?.headersHelper).toBe('./h.sh');
  });

  test('headers on an archive entry are carried', () => {
    const headers = { Authorization: 'Bearer x', 'X-Team': 'infra' };
    expect(loaded(rawEntry({ source: archive, headers })).headers).toEqual(headers);
  });

  test('headers or headersHelper on another source warn that they have no effect, and the entry loads', () => {
    const message =
      'Plugin "my-plugin" sets headers/headersHelper, which only apply to "archive" sources; they have no effect on this entry.';
    for (const extra of [{ headers: { A: 'b' } }, { headersHelper: './h.sh', strict: false }]) {
      const { entry, issues } = readOne(rawEntry(extra));
      expect(entry).toBeDefined();
      expect(issues).toContainEqual({
        severity: 'warning',
        path: `plugins[0].${Object.keys(extra)[0]}`,
        message,
      });
    }
  });

  test('headers must be an object of strings', () => {
    const { entry, issues } = readOne(rawEntry({ source: archive, headers: { A: 1 } }));
    expect(entry).toBeUndefined();
    expect(errorsOf(issues).map((found) => found.path)).toEqual(['plugins[0].headers.A']);
  });
});
