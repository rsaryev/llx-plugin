/**
 * marketplace-reference.md § Plugin sources, § Validation messages (`'unsupported'` placeholder),
 * § Invalid input on a source; the entry reader of a marketplace over the real source parser.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginIssue } from '../../../src/format/issues.ts';
import { createEntryReader } from '../../../src/format/marketplace/entries.ts';
import { readMarketplace } from '../../../src/format/marketplace/marketplace.ts';
import { parsePluginSource } from '../../../src/format/marketplace/plugin-source.ts';
import type { MarketplaceContext } from '../../../src/format/marketplace/types.ts';
import { slotAt } from '../../support/marketplace-entries.ts';
import { withFields } from '../../support/marketplace-fixtures.ts';

const PATH = 'plugins[0].source';

const parse = (raw: unknown) => parsePluginSource(raw, slotAt());
const invalid = (raw: unknown): void => {
  const result = parse(raw);
  expect(result.source).toBeUndefined();
  expect(result.issues).toEqual([{ severity: 'error', path: PATH, message: 'Invalid input' }]);
};
const issuesOf = (raw: unknown): readonly PluginIssue[] => parse(raw).issues;

describe('plugin source types', () => {
  test('a source type that is none of the seven is Invalid input', () => {
    invalid({ source: 'git' });
    invalid({ source: 'relative', path: './x' });
    invalid({ source: 5 });
    invalid({ repo: 'a/b' });
    invalid({});
  });

  test("'unsupported' is a placeholder that cannot be authored, with the quoted message", () => {
    expect(parse({ source: 'unsupported' })).toEqual({
      source: undefined,
      issues: [
        {
          severity: 'error',
          path: PATH,
          message:
            "source.source: 'unsupported' is a parse-time placeholder and cannot be authored",
        },
      ],
    });
    expect(issuesOf({ source: 'unsupported', error: 'why' })).toHaveLength(1);
  });

  test('a prototype member name as the type is not a type', () => {
    invalid({ source: 'constructor' });
    invalid({ source: '__proto__' });
  });
});

describe('judgments: plugin source fields', () => {
  test('an empty required string is Invalid input, like a missing field', () => {
    invalid({ source: 'github', repo: '' });
    invalid({ source: 'archive', url: '' });
  });

  test('keys a type does not list are ignored without a report', () => {
    expect(parse({ source: 'github', repo: 'a/b', timeout: 5 })).toEqual({
      source: { kind: 'github', repo: 'a/b' },
      issues: [],
    });
  });

  test('a command broken in two ways reports both rules', () => {
    const found = issuesOf({ source: 'command', command: `${'a'.repeat(500)}    é` });
    expect(found).toHaveLength(3);
  });
});

describe('the entry reader with the real plugin source parser', () => {
  const reader = createEntryReader(parsePluginSource);
  const read = (plugins: readonly unknown[], context: MarketplaceContext = {}) =>
    readMarketplace(withFields({ plugins }), context, reader);

  test('each entry carries its parsed source; an entry with a bad source is dropped alone', () => {
    const result = read([
      { name: 'a', source: './plugins/a' },
      { name: 'b', source: { source: 'github' } },
      { name: 'c', source: { source: 'npm', package: '@o/c' } },
    ]);
    expect(result.marketplace?.plugins.map((entry) => [entry.name, entry.source.kind])).toEqual([
      ['a', 'relative'],
      ['c', 'npm'],
    ]);
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'plugins[1].source',
      message: 'Invalid input',
    });
  });

  test('metadata.pluginRoot reaches the parser: a bare name resolves under it', () => {
    const result = readMarketplace(
      withFields({
        metadata: { pluginRoot: './plugins' },
        plugins: [{ name: 'f', source: 'formatter' }],
      }),
      {},
      reader,
    );
    expect(result.marketplace?.plugins[0]?.source).toEqual({
      kind: 'relative',
      path: 'plugins/formatter',
      bare: true,
    });
  });

  test('the platform of the context decides whether a backslash is refused', () => {
    const entry = { name: 'f', source: './a\\b' };
    expect(read([entry]).marketplace?.plugins).toEqual([]);
    expect(read([entry], { platform: 'windows' }).marketplace?.plugins[0]?.source).toMatchObject({
      path: 'a/b',
    });
  });
});
