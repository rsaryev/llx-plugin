/**
 * plugins/loading.md § Check which stage a plugin reached (`known_marketplaces.json` "records each
 * marketplace Claude Code has fetched, with its `source`, `installLocation`, `lastUpdated`, and
 * `autoUpdate`"; one per user) and § Find plugins on disk (`marketplaces/<name>/` holds the clone of
 * a GitHub, Git or URL marketplace; "a marketplace added from a local `file` or `directory` source
 * has no copy here, and its `installLocation` ... is the path you gave"); errors.md § Failed to load
 * marketplace configuration (the file is unreadable, or valid JSON that does not match the schema);
 * plugins/troubleshooting.md § `Marketplace "<name>" is already added from a different source` ("the
 * same type and the same value in every field"). The kit's source names its kind `directory` and
 * `file`; the file writes it under `source`. The Localix name `local` is not a kind.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource } from '../../src/format/marketplace/types.ts';
import {
  installLocationFor,
  parseKnownMarketplaces,
  sameMarketplaceSource,
  serializeKnownMarketplaces,
} from '../../src/marketplace/known-marketplaces.ts';
import { createStoreLayout } from '../../src/marketplace/store-layout.ts';

const layout = createStoreLayout('/home/u/.claude/plugins', (base, rel) => `${base}/${rel}`);

const entry = (source: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  source,
  installLocation: '/home/u/.claude/plugins/marketplaces/acme',
  lastUpdated: '2026-11-08T10:00:00.000Z',
  ...extra,
});

describe('reading the file', () => {
  test('each marketplace has its source, installLocation, lastUpdated and autoUpdate', () => {
    const read = parseKnownMarketplaces(
      JSON.stringify({
        acme: entry({ source: 'github', repo: 'acme/plugins', ref: 'v1' }, { autoUpdate: true }),
        local: entry({ source: 'directory', path: '/work/mk' }, { installLocation: '/work/mk' }),
      }),
    );
    expect(read.failure).toBeUndefined();
    expect(read.marketplaces['acme']).toEqual({
      source: {
        kind: 'github',
        repo: 'acme/plugins',
        ref: 'v1',
        path: '.claude-plugin/marketplace.json',
      },
      installLocation: '/home/u/.claude/plugins/marketplaces/acme',
      lastUpdated: '2026-11-08T10:00:00.000Z',
      autoUpdate: true,
    });
    expect(read.marketplaces['local']?.source).toEqual({ kind: 'directory', path: '/work/mk' });
  });

  test('no file is no marketplaces', () => {
    expect(parseKnownMarketplaces(undefined)).toEqual({ marketplaces: {}, issues: [] });
  });

  test('text that is not JSON, and an empty file, fail to load', () => {
    for (const text of ['', '{ nope']) {
      const read = parseKnownMarketplaces(text);
      expect(read.failure?.code).toBe('unreadable');
      expect(read.failure?.message.startsWith('Failed to load marketplace configuration')).toBe(
        true,
      );
      expect(read.marketplaces).toEqual({});
    }
  });

  test('valid JSON that does not match the schema is a corrupted file, naming the entries', () => {
    const read = parseKnownMarketplaces(
      JSON.stringify({
        good: entry({ source: 'directory', path: '/x' }),
        bad: { source: { source: 'github', repo: 'a/b' }, installLocation: 4 },
        worse: [],
      }),
    );
    expect(read.failure?.code).toBe('corrupted');
    expect(read.failure?.message).toBe(
      'Marketplace configuration file is corrupted: "bad", "worse" do not match the registry schema',
    );
    expect(read.marketplaces).toEqual({});
  });

  test('a top level that is not an object is corrupted', () => {
    expect(parseKnownMarketplaces('[]').failure?.code).toBe('corrupted');
  });

  test('an entry whose source is no marketplace source is corrupted', () => {
    const read = parseKnownMarketplaces(
      JSON.stringify({ x: entry({ source: 'local', path: '/x' }) }),
    );
    expect(read.failure?.code).toBe('corrupted');
  });
});

describe('writing the file', () => {
  test('a source is written under `source`, its kind as the `source` field, and reads back the same', () => {
    const sources: MarketplaceSource[] = [
      { kind: 'github', repo: 'acme/plugins', path: '.claude-plugin/marketplace.json' },
      { kind: 'git', url: 'https://git.example.com/a.git', ref: 'main', path: 'm.json' },
      { kind: 'url', url: 'https://example.com/marketplace.json' },
      { kind: 'file', path: '/work/marketplace.json' },
      { kind: 'directory', path: '/work/mk' },
    ];
    for (const source of sources) {
      const text = serializeKnownMarketplaces({
        m: { source, installLocation: '/x', lastUpdated: '2026-01-01T00:00:00Z' },
      });
      expect(JSON.parse(text).m.source.source).toBe(source.kind);
      expect(parseKnownMarketplaces(text).marketplaces['m']?.source).toEqual(source);
    }
  });

  test('the Localix kind `local` is never written', () => {
    const text = serializeKnownMarketplaces({
      m: {
        source: { kind: 'directory', path: '/work/mk' },
        installLocation: '/work/mk',
        lastUpdated: '2026-01-01T00:00:00Z',
      },
    });
    expect(text).not.toContain('"local"');
  });
});

describe('where a marketplace lives on disk (loading.md, "Find plugins on disk")', () => {
  test('a GitHub, git, URL or npm marketplace is in marketplaces/<name>', () => {
    const sources: MarketplaceSource[] = [
      { kind: 'github', repo: 'a/b', path: 'm.json' },
      { kind: 'git', url: 'https://x.y/z.git', path: 'm.json' },
      { kind: 'url', url: 'https://x.y/m.json' },
    ];
    for (const source of sources) {
      expect(installLocationFor(source, 'acme', layout)).toBe(
        '/home/u/.claude/plugins/marketplaces/acme',
      );
    }
  });

  test('a local file or directory has no copy: its installLocation is the path you gave', () => {
    expect(installLocationFor({ kind: 'directory', path: '/work/mk' }, 'acme', layout)).toBe(
      '/work/mk',
    );
    expect(installLocationFor({ kind: 'file', path: '/work/m.json' }, 'acme', layout)).toBe(
      '/work/m.json',
    );
  });
});

describe('the same source (troubleshooting.md, "already added from a different source")', () => {
  const github: MarketplaceSource = {
    kind: 'github',
    repo: 'acme-corp/claude-plugins',
    path: '.claude-plugin/marketplace.json',
  };

  test('the same type and the same value in every field match, whatever the key order', () => {
    expect(sameMarketplaceSource(github, { ...github })).toBe(true);
    expect(
      sameMarketplaceSource(
        { kind: 'git', url: 'u', ref: 'r', path: 'p' },
        { path: 'p', ref: 'r', url: 'u', kind: 'git' },
      ),
    ).toBe(true);
  });

  test('an entry that sets a ref you did not pass counts as different', () => {
    expect(sameMarketplaceSource(github, { ...github, ref: 'v1.2.0' })).toBe(false);
  });

  test('a github entry differs from the same repository as an https URL, recorded as a git source', () => {
    const asUrl: MarketplaceSource = {
      kind: 'git',
      url: 'https://github.com/acme-corp/claude-plugins.git',
      path: '.claude-plugin/marketplace.json',
    };
    expect(sameMarketplaceSource(github, asUrl)).toBe(false);
  });

  test('a list is compared in order', () => {
    const base = { ...github, sparsePaths: ['a', 'b'] };
    expect(sameMarketplaceSource(base, { ...github, sparsePaths: ['b', 'a'] })).toBe(false);
    expect(sameMarketplaceSource(base, { ...github, sparsePaths: ['a', 'b'] })).toBe(true);
  });
});
