/**
 * marketplace-reference.md § Plugin sources, § Marketplace sources and § Plugin entries: the
 * contract types every part of the marketplace stream shares. This file claims no requirement:
 * the readers prove the fields. It proves the closed lists are the ones the docs print, and that
 * the kit's marketplace source union names the same kinds and fields as the SDK's `source` shape
 * (`Settings['extraKnownMarketplaces']`), by type-level assertions `typecheck` enforces. The
 * fixtures the readers' tests use are checked where they are inputs and outputs of real code.
 */
import { describe, expect, test } from 'bun:test';
import {
  MARKETPLACE_SOURCE_KINDS,
  PLUGIN_SOURCE_KINDS,
} from '../../../src/format/marketplace/index.ts';
import type { MarketplaceSource, PluginSource } from '../../../src/format/marketplace/types.ts';
import type { Settings } from '../../../src/protocol/official.ts';

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

// The SDK declares the ten marketplace sources; the kit's union is the parsed form of them: `kind`
// for `source`, defaults applied (`path` always present on git sources) and read-only arrays. The
// assertions below fail `typecheck` when the SDK adds, drops or renames a kind or a field.
type SdkSource = NonNullable<Settings['extraKnownMarketplaces']>[string]['source'];
type SdkSourceOf<Kind extends string> = Extract<SdkSource, { source: Kind }>;
type MutableValue<Value> = Value extends readonly (infer Item)[] ? Item[] : Value;
type Mutable<T> = { -readonly [Key in keyof T]: MutableValue<T[Key]> };
type FieldNames<T, Tag extends string> = Exclude<keyof T, Tag>;
type SameNames<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Per kind: the field names agree, and (but for `settings`, whose entries are parsed) each kit field fits the SDK's. */
type KindAgrees<Kind extends MarketplaceSource['kind']> =
  SameNames<
    FieldNames<Extract<MarketplaceSource, { kind: Kind }>, 'kind'>,
    FieldNames<SdkSourceOf<Kind>, 'source'>
  > extends true
    ? Kind extends 'settings'
      ? true
      : Mutable<Omit<Extract<MarketplaceSource, { kind: Kind }>, 'kind'>> extends Omit<
            SdkSourceOf<Kind>,
            'source'
          >
        ? true
        : false
    : false;

const sdkKinds: SameNames<MarketplaceSource['kind'], SdkSource['source']> = true;
const everyKindAgrees: { [Kind in MarketplaceSource['kind']]: KindAgrees<Kind> } = {
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

describe('the marketplace source union and the SDK', () => {
  test('both name the same ten kinds, and each kind the same fields (checked by `typecheck`)', () => {
    expect(sdkKinds).toBe(true);
    expect(Object.keys(everyKindAgrees).toSorted()).toEqual(sorted(MARKETPLACE_SOURCE_KINDS));
  });
});
