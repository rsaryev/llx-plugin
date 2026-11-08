/**
 * plugins/host-marketplace.md § Keep users up to date → Run release channels ("host two marketplaces
 * whose entries point at different refs of the same plugin"; different `name` values; different
 * `plugin.json` versions, or `version` omitted so the commit SHA distinguishes them) and plugins/org.md
 * § Set update policy → Assign release channels to user groups (each group gets the matching
 * `extraKnownMarketplaces` entry). The pair is checked as pure data by `checkReleaseChannels`. What the
 * docs leave open (a pair that shares a ref, which findings are warnings) is outside `spec(...)` and
 * in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { readMarketplace } from '../../src/format/marketplace/marketplace.ts';
import type { Marketplace } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { computePluginVersion } from '../../src/marketplace/plugin-version.ts';
import { checkReleaseChannels } from '../../src/marketplace/release-channels.ts';
import { isUpdate } from '../../src/marketplace/update-detection.ts';
import { plan } from '../support/marketplace-registry.ts';
import { spec } from '../support/spec.ts';

const FIRST = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SECOND = '0123456789abcdef0123456789abcdef01234567';

/** The version a user's copy has after the author pushed `commit` with the given declared versions. */
const versionAt = (commit: string, manifestVersion?: string, entryVersion?: string): string =>
  computePluginVersion({
    ...(manifestVersion === undefined ? {} : { manifestVersion }),
    ...(entryVersion === undefined ? {} : { entryVersion }),
    source: { kind: 'github', commit },
  });

const loadedMarketplace = (raw: unknown): Marketplace => {
  const { marketplace } = readMarketplace(raw);
  if (marketplace === undefined) throw new Error('the marketplace does not load');
  return marketplace;
};

/** The two catalogs of "Run release channels", field for field. */
const stableTools = {
  name: 'stable-tools',
  owner: { name: 'Your Org' },
  plugins: [
    {
      name: 'code-formatter',
      source: { source: 'github', repo: 'your-org/code-formatter', ref: 'stable' },
    },
  ],
};
const latestTools = {
  name: 'latest-tools',
  owner: { name: 'Your Org' },
  plugins: [
    {
      name: 'code-formatter',
      source: { source: 'github', repo: 'your-org/code-formatter', ref: 'latest' },
    },
  ],
};

const withEntry = (raw: typeof stableTools, extra: Record<string, unknown>) => ({
  ...raw,
  plugins: raw.plugins.map((entry) => ({ ...entry, ...extra })),
});

spec('updates.hosting.Run release channels', () => {
  describe('two marketplaces whose entries point at different refs of the same plugin', () => {
    test('the documented pair has no finding: names differ, refs differ, versions omitted', () => {
      expect(
        checkReleaseChannels(loadedMarketplace(stableTools), loadedMarketplace(latestTools)),
      ).toEqual([]);
    });

    test('each channel installs from its own ref', () => {
      const refOf = (raw: typeof stableTools) => {
        const entry = loadedMarketplace(raw).plugins[0];
        if (entry === undefined) throw new Error('no entry');
        return planPluginFetch(entry.source, { platform: 'posix' }).plan;
      };
      expect(refOf(stableTools)).toMatchObject({ ref: 'stable', checkout: 'ref' });
      expect(refOf(latestTools)).toMatchObject({ ref: 'latest', checkout: 'ref' });
    });
  });

  describe('the two marketplace.json files need different name values', () => {
    test('the same name is an error: a user cannot have two marketplaces with one name registered', () => {
      const found = checkReleaseChannels(
        loadedMarketplace(stableTools),
        loadedMarketplace({ ...latestTools, name: 'stable-tools' }),
      );
      expect(found).toEqual([
        {
          severity: 'error',
          path: 'name',
          message:
            'Both marketplaces are named "stable-tools": give the two marketplace.json files different name values, because Claude Code identifies a marketplace by its name',
        },
      ]);
    });
  });

  describe('the refs need different versions, or none', () => {
    test('different versions are fine, and so is one omitted or both omitted', () => {
      const stable = loadedMarketplace(withEntry(stableTools, { version: '1.0.0' }));
      expect(
        checkReleaseChannels(
          stable,
          loadedMarketplace(withEntry(latestTools, { version: '1.1.0-beta' })),
        ),
      ).toEqual([]);
      expect(checkReleaseChannels(stable, loadedMarketplace(latestTools))).toEqual([]);
    });

    test('the same version on both is reported: a ref that moves without a version change leaves users on the cached copy', () => {
      const found = checkReleaseChannels(
        loadedMarketplace(withEntry(stableTools, { version: '1.0.0' })),
        loadedMarketplace(withEntry(latestTools, { version: '1.0.0' })),
      );
      expect(found.map((i) => [i.severity, i.path])).toEqual([
        ['warning', 'plugins.code-formatter.version'],
      ]);
      expect(found[0]?.message).toContain('"1.0.0"');
      expect(found[0]?.message).toContain('code-formatter');
    });

    test('plugin.json versions count first: the manifest of each ref is what the comparison uses', () => {
      const stable = loadedMarketplace(withEntry(stableTools, { version: '1.0.0' }));
      const latest = loadedMarketplace(withEntry(latestTools, { version: '2.0.0' }));
      const found = checkReleaseChannels(stable, latest, {
        first: new Map([['code-formatter', '3.0.0']]),
        second: new Map([['code-formatter', '3.0.0']]),
      });
      expect(found.map((i) => i.path)).toEqual(['plugins.code-formatter.version']);
      expect(found[0]?.message).toContain('"3.0.0"');
      expect(
        checkReleaseChannels(stable, latest, {
          first: new Map([['code-formatter', '3.0.0']]),
          second: new Map([['code-formatter', '3.1.0']]),
        }),
      ).toEqual([]);
    });

    test('a pinned version on both refs does not update, however the refs move', () => {
      const stable = versionAt(FIRST, '1.0.0');
      const latest = versionAt(SECOND, '1.0.0');
      expect(isUpdate(stable, latest)).toBe('unchanged');
    });

    test('omitted on both: the commit SHA distinguishes the refs', () => {
      expect(isUpdate(versionAt(FIRST), versionAt(SECOND))).toBe('new copy');
    });
  });
});

const registrationsOf = (marketplaceName: string, repo: string) =>
  plan([
    [
      'managed',
      { extraKnownMarketplaces: { [marketplaceName]: { source: { source: 'github', repo } } } },
    ],
  ]);

spec('updates.org.Assign release channels to user groups', () => {
  test('the stable group receives the stable-tools entry and nothing else', () => {
    const stable = registrationsOf('stable-tools', 'your-org/stable-tools');
    expect(stable.map((r) => [r.name, r.status])).toEqual([['stable-tools', 'register']]);
  });

  test('the early-access group receives latest-tools instead', () => {
    const latest = registrationsOf('latest-tools', 'your-org/latest-tools');
    expect(latest.map((r) => [r.name, r.status])).toEqual([['latest-tools', 'register']]);
  });

  test('each group registers the marketplace of its own channel, so the two groups install different refs', () => {
    const stable = registrationsOf('stable-tools', 'your-org/stable-tools');
    const latest = registrationsOf('latest-tools', 'your-org/latest-tools');
    expect(stable.map((r) => r.name)).not.toEqual(latest.map((r) => r.name));
    expect(
      checkReleaseChannels(loadedMarketplace(stableTools), loadedMarketplace(latestTools)),
    ).toEqual([]);
  });

  test('a managed entry that sets autoUpdate fixes it for the group; one that leaves it unset does not', () => {
    const fixed = plan([
      [
        'managed',
        {
          extraKnownMarketplaces: {
            'stable-tools': {
              source: { source: 'github', repo: 'your-org/stable-tools' },
              autoUpdate: true,
            },
          },
        },
      ],
    ]);
    const open = registrationsOf('latest-tools', 'your-org/latest-tools');
    expect(fixed.map((r) => r.autoUpdateFixed)).toEqual([true]);
    expect(open.map((r) => r.autoUpdateFixed)).toEqual([false]);
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('two channels that point at the same ref of the same plugin are reported: it is not a channel', () => {
    const found = checkReleaseChannels(
      loadedMarketplace(stableTools),
      loadedMarketplace({ ...stableTools, name: 'other-tools' }),
    );
    expect(found.map((i) => [i.severity, i.path])).toEqual([
      ['warning', 'plugins.code-formatter.source'],
    ]);
  });

  test('the same ref of a different repository is not the same channel', () => {
    const other = {
      ...stableTools,
      name: 'other-tools',
      plugins: [
        {
          name: 'code-formatter',
          source: { source: 'github', repo: 'another-org/code-formatter', ref: 'stable' },
        },
      ],
    };
    expect(checkReleaseChannels(loadedMarketplace(stableTools), loadedMarketplace(other))).toEqual(
      [],
    );
  });

  test('a plugin only one marketplace lists is not compared', () => {
    const second = {
      ...latestTools,
      plugins: [{ ...latestTools.plugins[0], name: 'other-plugin' }],
    };
    expect(checkReleaseChannels(loadedMarketplace(stableTools), loadedMarketplace(second))).toEqual(
      [],
    );
  });
});
