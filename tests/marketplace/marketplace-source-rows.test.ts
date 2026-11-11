/**
 * marketplace-reference.md § Marketplace sources: the `settings` and `skills-dir` rows of the table
 * (what `marketplace add` produces, and what each does in `extraKnownMarketplaces`,
 * `strictKnownMarketplaces` and `blockedMarketplaces`), § Source values valid only in policy lists
 * (`skills-dir` is "not a source"), § Fields by type (`name` and `plugins` of `settings`).
 */
import { describe, expect, test } from 'bun:test';
import { parseMarketplaceSource } from '../../src/format/marketplace/marketplace-source.ts';
import { parseMarketplaceInput } from '../../src/marketplace/marketplace-input.ts';
import { planMarketplaceFetch } from '../../src/marketplace/marketplace-fetch-plan.ts';
import type { SdkMarketplaceSource } from '../../src/protocol/official.ts';
import { admits, blocks, github, managed, skillsDir } from '../support/marketplace-sources.ts';
import { spec } from '../support/spec.ts';

const READ = { policy: false, key: 'team-tools' } as const;
const PLUGINS = [
  { name: 'formatter', source: { source: 'github', repo: 'acme/formatter' } },
  { name: 'linter', source: { source: 'github', repo: 'acme/linter' }, version: '1.2.0' },
] as const;
const inline = (name: string, plugins: readonly unknown[] = PLUGINS): SdkMarketplaceSource =>
  ({ source: 'settings', name, plugins: [...plugins] }) as SdkMarketplaceSource;

spec('marketplace.rule.Marketplace sources.skills-dir', () => {
  test('no `marketplace add` input produces it', () => {
    for (const text of ['skills-dir', '{"source":"skills-dir"}', '.claude/skills']) {
      expect(parseMarketplaceInput(text)).toMatchObject({ severity: 'error', path: 'source' });
    }
  });

  test('in extraKnownMarketplaces it fails to load: Unsupported marketplace source type', () => {
    const read = parseMarketplaceSource({ source: 'skills-dir' }, READ);
    expect(read.loadStatus).toBe('fails: Unsupported marketplace source type');
    expect(planMarketplaceFetch({ kind: 'skills-dir' })).toEqual({
      severity: 'error',
      path: 'source',
      message: 'Unsupported marketplace source type',
    });
  });

  test('in strictKnownMarketplaces it allows skills-directory plugins, and any allowlist without it stops them', () => {
    const withEntry = managed({ strictKnownMarketplaces: [github('acme/tools'), skillsDir] });
    expect(withEntry.skillsDirectoryPlugins()).toEqual({ admitted: true });
    const without = managed({ strictKnownMarketplaces: [github('acme/tools')] });
    expect(without.skillsDirectoryPlugins()).toEqual({
      admitted: false,
      by: 'strictKnownMarketplaces',
    });
    expect(managed({}).skillsDirectoryPlugins()).toEqual({ admitted: true });
  });

  test('in blockedMarketplaces it stops skills-directory plugins from loading', () => {
    const blocked = managed({ blockedMarketplaces: [skillsDir] });
    expect(blocked.skillsDirectoryPlugins()).toEqual({
      admitted: false,
      by: 'blockedMarketplaces',
    });
  });

  test('it is not a source: it matches no marketplace in either list', () => {
    expect(admits(skillsDir, github('acme/tools'))).toBe(false);
    expect(blocks(skillsDir, github('acme/tools'))).toBe(false);
  });
});

spec('marketplace.rule.Marketplace sources.settings', () => {
  test('no `marketplace add` input produces it', () => {
    expect(parseMarketplaceInput('settings')).toMatchObject({ severity: 'error', path: 'source' });
  });

  test('in extraKnownMarketplaces it loads: an inline catalog, no file fetched', () => {
    const source = { source: 'settings', name: 'team-tools', plugins: [...PLUGINS] };
    expect(parseMarketplaceSource(source, READ).loadStatus).toBe('loads');
    const read = parseMarketplaceSource(source, READ).source;
    if (read === undefined) throw new Error('did not parse');
    expect(planMarketplaceFetch(read)).toMatchObject({ kind: 'inline' });
  });

  test('in strictKnownMarketplaces it allows an entry with the same name and identical plugins', () => {
    expect(admits(inline('team-tools'), inline('team-tools'))).toBe(true);
    expect(
      admits(
        inline('team-tools'),
        inline(
          'team-tools',
          [...PLUGINS].map((entry) => ({ ...entry })),
        ),
      ),
    ).toBe(true);
  });

  test('a different name, or a different catalog under the same name, is not allowed', () => {
    expect(admits(inline('team-tools'), inline('other-tools'))).toBe(false);
    expect(admits(inline('team-tools'), inline('team-tools', PLUGINS.slice(0, 1)))).toBe(false);
    expect(admits(inline('team-tools'), inline('team-tools', [...PLUGINS].reverse()))).toBe(false);
    const changed = [{ ...PLUGINS[0], version: '2.0.0' }, PLUGINS[1]];
    expect(admits(inline('team-tools'), inline('team-tools', changed))).toBe(false);
  });

  test('in blockedMarketplaces it blocks the same name, whatever the catalog', () => {
    expect(blocks(inline('team-tools'), inline('team-tools', PLUGINS.slice(0, 1)))).toBe(true);
    expect(blocks(inline('team-tools'), inline('other-tools'))).toBe(false);
  });

  test('`name` must equal the extraKnownMarketplaces key', () => {
    const read = parseMarketplaceSource({ source: 'settings', name: 'other', plugins: [] }, READ);
    expect(read.source).toBeUndefined();
    expect(read.issues[0]).toMatchObject({
      severity: 'error',
      path: 'name',
      message: 'Marketplace name "other" must equal the extraKnownMarketplaces key "team-tools"',
    });
  });
});

describe('settings sources in the gate (judgment: key order is not a difference)', () => {
  test('two catalogs that differ only in the order of keys are identical', () => {
    const a = inline('team-tools', [{ name: 'f', source: { source: 'github', repo: 'a/b' } }]);
    const b = inline('team-tools', [{ source: { repo: 'a/b', source: 'github' }, name: 'f' }]);
    expect(admits(a, b)).toBe(true);
  });
});
