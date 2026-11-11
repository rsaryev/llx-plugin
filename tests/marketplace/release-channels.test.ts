/**
 * plugins/host-marketplace.md § Keep users up to date → Run release channels ("host two marketplaces
 * whose entries point at different refs of the same plugin"; different `name` values; different
 * `plugin.json` versions, or `version` omitted so the commit SHA distinguishes them) and plugins/org.md
 * § Set update policy → Assign release channels to user groups (each group gets the matching
 * `extraKnownMarketplaces` entry). The pair is checked as pure data by `checkReleaseChannels`. What the
 * docs leave open (a pair that shares a ref, which findings are warnings) is outside `spec(...)` and
 * in spec/judgments.md. The two documented negatives are host-side and untested here: server-managed
 * settings apply to every user of an organization, so they cannot differ per group, and a gateway
 * policy's `extraKnownMarketplaces` does not merge with another policy's, so each group lists every
 * marketplace it needs. The kit models neither the admin console nor gateway policies, only the
 * settings a device ends up with (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { readMarketplace } from '../../src/format/marketplace/marketplace.ts';
import type { Marketplace } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { checkReleaseChannels } from '../../src/marketplace/release-channels.ts';
import { isUpdate } from '../../src/marketplace/update-detection.ts';
import { plan } from '../support/marketplace-registry.ts';
import { githubVersionAt as versionAt } from '../support/plugin-version.ts';
import { spec } from '../support/spec.ts';

const FIRST = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SECOND = '0123456789abcdef0123456789abcdef01234567';

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

    test('a pinned version on both refs does not update, however the refs move', async () => {
      const stable = await versionAt(FIRST, '1.0.0');
      const latest = await versionAt(SECOND, '1.0.0');
      expect(isUpdate(stable, latest)).toBe('unchanged');
    });

    test('omitted on both: the commit SHA distinguishes the refs', async () => {
      expect(isUpdate(await versionAt(FIRST), await versionAt(SECOND))).toBe('new copy');
    });
  });
});

/** The configuration one group receives, as org.md shows it, planned as the managed settings of that group's devices. */
const groupConfig = (name: string, repo: string) => ({
  extraKnownMarketplaces: { [name]: { source: { source: 'github', repo } } },
});
const receivedBy = (name: string, repo: string) =>
  plan([['managed', groupConfig(name, repo)]]).map((r) => [r.name, r.status, r.entry.source]);

spec('updates.org.Assign release channels to user groups', () => {
  test('the stable group receives exactly the stable-tools marketplace, and latest-tools is absent', () => {
    expect(receivedBy('stable-tools', 'your-org/stable-tools')).toEqual([
      ['stable-tools', 'register', { source: 'github', repo: 'your-org/stable-tools' }],
    ]);
  });

  test('the early-access group receives latest-tools instead, and stable-tools is absent', () => {
    expect(receivedBy('latest-tools', 'your-org/latest-tools')).toEqual([
      ['latest-tools', 'register', { source: 'github', repo: 'your-org/latest-tools' }],
    ]);
  });

  test('the two marketplaces the groups receive are a valid channel pair of the same plugins', () => {
    expect(
      checkReleaseChannels(loadedMarketplace(stableTools), loadedMarketplace(latestTools)),
    ).toEqual([]);
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
