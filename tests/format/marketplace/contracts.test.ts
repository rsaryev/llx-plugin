/**
 * marketplace-reference.md § Plugin sources, § Marketplace sources and § Plugin entries: the
 * contract types every part of the marketplace stream shares. This file claims no requirement:
 * the readers prove the fields. It proves the closed lists are the ones the docs print, that each
 * kind has a documented example (a kind added to a list fails here until it has one), and that the
 * fixtures the readers' tests use are values of the contract types, which `typecheck` enforces.
 */
import { describe, expect, test } from 'bun:test';
import {
  MARKETPLACE_SOURCE_KINDS,
  PLUGIN_SOURCE_KINDS,
} from '../../../src/format/marketplace/index.ts';
import type { MarketplaceSource, PluginSource } from '../../../src/format/marketplace/types.ts';
import {
  MARKETPLACE_SOURCES,
  PLUGIN_SOURCES,
  RELEVANCE_MARKETPLACE,
  RENAMES_MARKETPLACE,
  parsedMarketplace,
  rawMarketplace,
} from '../../support/marketplace-fixtures.ts';

const sorted = (list: readonly string[]): string[] => [...list].toSorted();

describe('the closed lists of source kinds', () => {
  test('plugin sources: a relative path and the six object types of "Plugin sources"', () => {
    expect(sorted(PLUGIN_SOURCE_KINDS)).toEqual(
      ['archive', 'command', 'git-subdir', 'github', 'npm', 'relative', 'url'].toSorted(),
    );
  });

  test('marketplace sources: the ten rows of the "Marketplace sources" table', () => {
    expect(sorted(MARKETPLACE_SOURCE_KINDS)).toEqual(
      [
        'directory',
        'file',
        'git',
        'github',
        'hostPattern',
        'npm',
        'pathPattern',
        'settings',
        'skills-dir',
        'url',
      ].toSorted(),
    );
  });

  test('"git-subdir", "archive" and "command" are plugin sources only; "git" is a marketplace source only', () => {
    for (const kind of ['git-subdir', 'archive', 'command'])
      expect(MARKETPLACE_SOURCE_KINDS as readonly string[]).not.toContain(kind);
    expect(PLUGIN_SOURCE_KINDS as readonly string[]).not.toContain('git');
  });
});

describe('the lists and the unions agree', () => {
  // A record over the union's own `kind`: a kind added to a union and missing here fails `typecheck`,
  // and one missing from a list fails the comparison.
  const pluginKinds: Record<PluginSource['kind'], true> = {
    relative: true,
    github: true,
    url: true,
    'git-subdir': true,
    npm: true,
    archive: true,
    command: true,
  };
  const marketplaceKinds: Record<MarketplaceSource['kind'], true> = {
    url: true,
    github: true,
    git: true,
    npm: true,
    file: true,
    directory: true,
    settings: true,
    'skills-dir': true,
    hostPattern: true,
    pathPattern: true,
  };

  test('each list holds exactly the kinds of its union', () => {
    expect(sorted(PLUGIN_SOURCE_KINDS)).toEqual(Object.keys(pluginKinds).toSorted());
    expect(sorted(MARKETPLACE_SOURCE_KINDS)).toEqual(Object.keys(marketplaceKinds).toSorted());
  });
});

describe('the fixtures', () => {
  test('every kind has a documented example, raw and parsed, of its own kind', () => {
    for (const kind of PLUGIN_SOURCE_KINDS) expect(PLUGIN_SOURCES[kind].parsed.kind).toBe(kind);
    for (const kind of MARKETPLACE_SOURCE_KINDS)
      expect(MARKETPLACE_SOURCES[kind].parsed.kind).toBe(kind);
  });

  test('an object source names its type in `source`; the kit names the parsed field `kind`', () => {
    for (const kind of PLUGIN_SOURCE_KINDS) {
      const { raw } = PLUGIN_SOURCES[kind];
      if (kind === 'relative') expect(typeof raw).toBe('string');
      else expect(raw).toMatchObject({ source: kind });
    }
  });

  test('the smallest marketplace has the three required fields, and its parsed twin the defaults', () => {
    expect(Object.keys(rawMarketplace())).toEqual(
      expect.arrayContaining(['name', 'owner', 'plugins']),
    );
    const parsed = parsedMarketplace();
    expect(parsed.plugins[0]?.strict).toBe(true);
    expect(parsed.forceRemoveDeletedPlugins).toBe(false);
    expect(parsed.allowCrossMarketplaceDependenciesOn).toEqual([]);
  });

  test("the renames and relevance examples are the docs' own", () => {
    expect(RENAMES_MARKETPLACE.renames).toEqual({
      formatter: 'code-formatter',
      'legacy-linter': null,
    });
    expect(RELEVANCE_MARKETPLACE.plugins).toMatchObject([
      {
        relevance: { topic: 'Terraform', signals: { cli: ['terraform'], filesRead: ['**/*.tf'] } },
      },
    ]);
  });
});
