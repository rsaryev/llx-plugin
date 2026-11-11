/**
 * plugins/loading.md § Check which stage a plugin reached (declared in settings; fetched to disk:
 * `known_marketplaces.json`, `installed_plugins.json`, `cache/`; loaded in the running session, which
 * settings or disk changes reach only at `/reload-plugins` or the next session), § Plugins and
 * marketplaces that aren't on disk at session start (plugins load from `installed_plugins.json` and
 * the cache without the network; after the start a declared marketplace `known_marketplaces.json`
 * lacks is cloned, one whose source changed is re-fetched with `Plugins changed. Run /reload-plugins
 * to activate.`; an enabled plugin neither path fetched with no usable cache shows `not cached`);
 * plugins/overview.md § Make an installed plugin available in your session (settings, disk and
 * session layers). An id here is a layer, so each block builds a plugin missing exactly that layer.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource } from '../../src/format/marketplace/types.ts';
import type { InstallRecord } from '../../src/marketplace/installed-plugins.ts';
import { notCached } from '../../src/marketplace/install-errors.ts';
import type { KnownMarketplaces } from '../../src/marketplace/known-marketplaces.ts';
import {
  planMarketplaceStartup,
  stageReport,
  unresolvedAfterStart,
  type StageFacts,
} from '../../src/marketplace/stage-report.ts';
import { spec } from '../support/spec.ts';

const PATH = '/p/cache/acme/formatter/1.0.0';
const record: InstallRecord = { scope: 'user', installPath: PATH, version: '1.0.0' };

const facts = (overrides: Partial<StageFacts> = {}): StageFacts => ({
  id: 'formatter@acme',
  enabled: true,
  records: [record],
  existing: new Set([PATH]),
  loaded: true,
  ...overrides,
});

spec('install.loading.Check which stage a plugin reached', () => {
  test('declared, fetched and loaded: the plugin is in the running session', () => {
    expect(stageReport(facts())).toMatchObject({
      declared: true,
      recorded: true,
      cached: true,
      loaded: true,
      stage: 'loaded',
      reload: false,
    });
  });

  test('declared only: an enabledPlugins entry with nothing fetched', () => {
    expect(stageReport(facts({ records: [], existing: new Set(), loaded: false }))).toMatchObject({
      declared: true,
      recorded: false,
      cached: false,
      loaded: false,
      stage: 'declared',
    });
  });

  test('fetched but not loaded: a change on disk does not reach the session until /reload-plugins', () => {
    expect(stageReport(facts({ loaded: false }))).toMatchObject({
      stage: 'fetched',
      reload: true,
    });
  });

  test('a record whose directory is gone is recorded but not cached, and the Errors tab says so', () => {
    const report = stageReport(facts({ existing: new Set(), loaded: false }));
    expect(report).toMatchObject({ recorded: true, cached: false, stage: 'declared' });
    expect(report.problem).toEqual(notCached('formatter', PATH));
  });

  test('a plugin installed but not enabled is on disk and not declared; settings changes also wait for a reload', () => {
    expect(stageReport(facts({ enabled: false, loaded: false }))).toMatchObject({
      declared: false,
      cached: true,
      stage: 'fetched',
      reload: false,
    });
    expect(stageReport(facts({ enabled: false, loaded: true })).reload).toBe(true);
  });

  test('a plugin in no layer reached no stage', () => {
    expect(
      stageReport(facts({ enabled: false, records: [], existing: new Set(), loaded: false })).stage,
    ).toBe('none');
  });

  test('a relative-path plugin of a local marketplace needs no record: it loads from the marketplace itself', () => {
    const report = stageReport(
      facts({ records: [], existing: new Set(), inPlace: true, loaded: false }),
    );
    expect(report).toMatchObject({ cached: true, stage: 'fetched', reload: true });
    expect(report.problem).toBeUndefined();
  });

  test('one usable copy among several records is enough', () => {
    const other: InstallRecord = {
      ...record,
      scope: 'project',
      installPath: '/p/cache/acme/formatter/0.9.0',
    };
    expect(stageReport(facts({ records: [other, record] })).problem).toBeUndefined();
  });

  test('the problem names the first record when none of them exists', () => {
    const other: InstallRecord = { ...record, installPath: '/p/other' };
    expect(
      stageReport(facts({ records: [other, record], existing: new Set() })).problem?.message,
    ).toBe('Plugin "formatter" not cached at /p/other');
  });
});

describe('the three layers a plugin must be present at (overview.md)', () => {
  const MISSING = [
    'install.overview.Make an installed plugin available in your session.Settings',
    'install.overview.Make an installed plugin available in your session.Disk',
    'install.overview.Make an installed plugin available in your session.Session',
  ] as const;

  spec(MISSING[0], () => {
    test('a plugin on disk and loaded but not listed in settings is missing the settings layer', () => {
      const report = stageReport(facts({ enabled: false }));
      expect(report.missing).toEqual(['settings']);
      expect(report.available).toBe(false);
    });
  });

  spec(MISSING[1], () => {
    test('a plugin in settings and loaded whose files are gone is missing the disk layer', () => {
      const report = stageReport(facts({ records: [], existing: new Set() }));
      expect(report.missing).toEqual(['disk']);
      expect(report.available).toBe(false);
    });
  });

  spec(MISSING[2], () => {
    test('a plugin in settings and on disk but not yet loaded is missing the session layer: plugins load at startup or on reload', () => {
      const report = stageReport(facts({ loaded: false }));
      expect(report.missing).toEqual(['session']);
      expect(report.available).toBe(false);
    });

    test('present at each layer, it is available', () => {
      const report = stageReport(facts());
      expect(report.missing).toEqual([]);
      expect(report.available).toBe(true);
    });
  });
});

const github = (repo: string, ref?: string): MarketplaceSource => ({
  kind: 'github',
  repo,
  path: '.claude-plugin/marketplace.json',
  ...(ref === undefined ? {} : { ref }),
});

const known = (entries: Record<string, MarketplaceSource>): KnownMarketplaces =>
  Object.fromEntries(
    Object.entries(entries).map(([name, source]) => [
      name,
      { source, installLocation: `/p/marketplaces/${name}`, lastUpdated: '2026-01-01T00:00:00Z' },
    ]),
  );

spec(`install.loading.Plugins and marketplaces that aren't on disk at session start`, () => {
  test('a declared marketplace known_marketplaces.json lacks is cloned, then plugins reload and enabled uncached ones download', () => {
    expect(planMarketplaceStartup({ acme: github('acme/plugins') }, known({}))).toEqual([
      {
        marketplace: 'acme',
        action: 'clone',
        source: github('acme/plugins'),
        next: 'reload-and-download-enabled',
      },
    ]);
  });

  test('a declared marketplace whose source changed in settings is re-fetched, with a notice to reload', () => {
    expect(
      planMarketplaceStartup(
        { acme: github('acme/plugins', 'v2') },
        known({ acme: github('acme/plugins', 'v1') }),
      ),
    ).toEqual([
      {
        marketplace: 'acme',
        action: 'refetch',
        source: github('acme/plugins', 'v2'),
        next: 'notify',
        notice: 'Plugins changed. Run /reload-plugins to activate.',
      },
    ]);
  });

  test('a declared marketplace that is known from the same source needs nothing', () => {
    expect(
      planMarketplaceStartup(
        { acme: github('acme/plugins') },
        known({ acme: github('acme/plugins') }),
      ),
    ).toEqual([]);
  });

  test('a known marketplace that settings do not declare is left alone', () => {
    expect(planMarketplaceStartup({}, known({ acme: github('acme/plugins') }))).toEqual([]);
  });

  test('plans are in the order the marketplaces are declared', () => {
    const plan = planMarketplaceStartup({ b: github('x/b'), a: github('x/a') }, known({}));
    expect(plan.map((one) => one.marketplace)).toEqual(['b', 'a']);
  });

  test('an enabled plugin neither path fetched, with no usable cache, shows "not cached"', () => {
    const lost = facts({ existing: new Set(), loaded: false });
    expect(unresolvedAfterStart([lost], new Set())).toEqual([notCached('formatter', PATH)]);
  });

  test('a plugin the background pass fetched is not reported', () => {
    const lost = facts({ existing: new Set(), loaded: false });
    expect(unresolvedAfterStart([lost], new Set(['formatter@acme']))).toEqual([]);
  });

  test('a plugin with a usable cache or one that is not enabled is not reported', () => {
    expect(unresolvedAfterStart([facts({ loaded: false })], new Set())).toEqual([]);
    expect(
      unresolvedAfterStart([facts({ enabled: false, existing: new Set() })], new Set()),
    ).toEqual([]);
  });
});
