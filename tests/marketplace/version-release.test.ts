/**
 * plugins/host-marketplace.md § Keep users up to date → Release a new version, Hold users on one
 * version, Run release channels; plugins/publish.md § Ship updates, renames, and removals → Release
 * a new version, Tag a release, § Publish through your own marketplace → Ship updates to users;
 * plugins/org.md § Set update policy → Assign release channels to user groups. The version rule is
 * `computePluginVersion`, the update test `isUpdate`; here is what each page says a host does with
 * them: bump or omit `version`, a `ref`/`sha`/`#ref`/tag chooses what users hold, two marketplaces
 * with different names are two channels, and `claude plugin update` and auto-update are the same
 * comparison. What the docs leave open (a channel pair that shares a version or a ref) is outside
 * `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginIssue } from '../../src/format/issues.ts';
import { readMarketplace, validateMarketplace } from '../../src/format/marketplace/marketplace.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { parseMarketplaceInput } from '../../src/marketplace/marketplace-input.ts';
import { planMarketplaceFetch } from '../../src/marketplace/marketplace-fetch-plan.ts';
import {
  releaseTag,
  selectTag,
  resolveDependencyVersion,
} from '../../src/marketplace/dependency-tags.ts';
import { computePluginVersion } from '../../src/marketplace/plugin-version.ts';
import { isUpdate, loadsInPlace } from '../../src/marketplace/update-detection.ts';
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

const messages = (issues: readonly PluginIssue[]): string[] => issues.map((i) => i.message);

spec('updates.hosting.Release a new version', () => {
  describe('users get a new copy only when the computed version differs', () => {
    test('changing the plugin version releases it', () => {
      const installed = versionAt(FIRST, '1.0.0');
      expect(isUpdate(installed, versionAt(SECOND, '1.1.0'))).toBe('new copy');
    });

    test('bumping version on each release: pushing commits without changing "1.0.0" reaches nobody', () => {
      const installed = versionAt(FIRST, '1.0.0');
      expect(isUpdate(installed, versionAt(SECOND, '1.0.0'))).toBe('unchanged');
    });

    test('omitting version from plugin.json and the entry: users track the commits', () => {
      const installed = versionAt(FIRST);
      expect(isUpdate(installed, versionAt(SECOND))).toBe('new copy');
      expect(isUpdate(installed, versionAt(FIRST))).toBe('unchanged');
    });

    test('the version comes from plugin.json first, then from the marketplace entry', () => {
      expect(versionAt(FIRST, '1.0.0', '2.0.0')).toBe('1.0.0');
      expect(versionAt(FIRST, undefined, '2.0.0')).toBe('2.0.0');
    });
  });

  describe('a plugin loaded in place from a marketplace added from a local path', () => {
    test('is not controlled by version: it loads the current files at every session start', () => {
      const local = { kind: 'directory', path: '/work/market' } as const;
      expect(loadsInPlace({ kind: 'relative', path: 'p', bare: false }, local)).toBe(true);
    });
  });

  describe('a version in both plugin.json and the entry', () => {
    test('plugin.json is used without warning at install time', () => {
      expect(versionAt(FIRST, '1.0.0', '2.0.0')).toBe('1.0.0');
    });

    test('claude plugin validate reports the mismatch as Entry declares version "<a>" but <path>/plugin.json says "<b>"', () => {
      const raw = {
        name: 'your-marketplace',
        owner: { name: 'Your Org' },
        plugins: [{ name: 'my-plugin', source: './plugins/my-plugin', version: '1.0.0' }],
      };
      const issues = validateMarketplace(raw, {
        pluginManifests: new Map([[0, { name: 'my-plugin', version: '2.0.0' }]]),
      });
      const [found] = issues.filter((i) => i.message.startsWith('Entry declares version'));
      expect(found?.message).toStartWith(
        'Entry declares version "1.0.0" but plugins/my-plugin/.claude-plugin/plugin.json says "2.0.0"',
      );
    });

    test('the same version in both says nothing', () => {
      const raw = {
        name: 'your-marketplace',
        owner: { name: 'Your Org' },
        plugins: [{ name: 'my-plugin', source: './plugins/my-plugin', version: '2.0.0' }],
      };
      const issues = validateMarketplace(raw, {
        pluginManifests: new Map([[0, { name: 'my-plugin', version: '2.0.0' }]]),
      });
      expect(messages(issues).filter((m) => m.startsWith('Entry declares version'))).toEqual([]);
    });
  });
});

spec('updates.publish.Release a new version', () => {
  test('incrementing plugin.json version and pushing: claude plugin update and auto-update receive it', () => {
    const installed = versionAt(FIRST, '1.4.0');
    expect(isUpdate(installed, versionAt(SECOND, '1.5.0'))).toBe('new copy');
  });

  test('pushing the same version string is not a release', () => {
    expect(isUpdate(versionAt(FIRST, '1.4.0'), versionAt(SECOND, '1.4.0'))).toBe('unchanged');
  });
});

spec('updates.publish.Ship updates to users', () => {
  test('on request: a changed version installs the new copy, an unchanged one says "already at the latest"', () => {
    expect(isUpdate(versionAt(FIRST, '1.0.0'), versionAt(SECOND, '1.1.0'))).toBe('new copy');
    expect(isUpdate(versionAt(FIRST, '1.0.0'), versionAt(SECOND, '1.0.0'))).toBe('unchanged');
  });

  test('auto-update is off by default for your marketplace', () => {
    const registered = plan([
      [
        'user',
        {
          extraKnownMarketplaces: {
            'your-marketplace': { source: { source: 'github', repo: 'your-org/your-marketplace' } },
          },
        },
      ],
    ]);
    expect(registered.map((r) => [r.name, r.entry.autoUpdate])).toEqual([
      ['your-marketplace', false],
    ]);
  });

  test('once on, it does the same as claude plugin update: the same comparison of versions', () => {
    const on = plan([
      [
        'managed',
        {
          extraKnownMarketplaces: {
            'your-marketplace': {
              source: { source: 'github', repo: 'your-org/your-marketplace' },
              autoUpdate: true,
            },
          },
        },
      ],
    ]);
    expect(on.map((r) => [r.name, r.entry.autoUpdate])).toEqual([['your-marketplace', true]]);
    // The pass and the command both end in `isUpdate`: one decision, two triggers.
    const installed = versionAt(FIRST, '2.0.0');
    expect(isUpdate(installed, versionAt(SECOND, '2.0.0'))).toBe('unchanged');
    expect(isUpdate(installed, versionAt(SECOND, '2.1.0'))).toBe('new copy');
  });
});

/** The fetch plan of the plugin source a catalog entry holds, read as a host reads it. */
const planned = (source: Record<string, unknown>) => {
  const { marketplace } = readMarketplace({
    name: 'm',
    owner: { name: 'o' },
    plugins: [{ name: 'p', source }],
  });
  const entry = marketplace?.plugins[0];
  if (entry === undefined) throw new Error('the entry does not load');
  return planPluginFetch(entry.source, { platform: 'posix' }).plan;
};

spec('updates.hosting.Hold users on one version', () => {
  describe('ref and sha on the plugin entry', () => {
    test('a ref names a branch or tag the clone ends on, for github, url and git-subdir', () => {
      for (const source of [
        { source: 'github', repo: 'your-org/p', ref: 'v1.2.0' },
        { source: 'url', url: 'https://example.com/p.git', ref: 'v1.2.0' },
        { source: 'git-subdir', url: 'https://example.com/p.git', path: 'plugin', ref: 'v1.2.0' },
      ]) {
        expect(planned(source)).toMatchObject({ kind: 'git', ref: 'v1.2.0', checkout: 'ref' });
      }
    });

    test('a sha names a commit and wins when both are set', () => {
      expect(
        planned({ source: 'github', repo: 'your-org/p', ref: 'main', sha: FIRST }),
      ).toMatchObject({ kind: 'git', sha: FIRST, checkout: 'sha' });
      expect(planned({ source: 'github', repo: 'your-org/p', sha: FIRST })).toMatchObject({
        checkout: 'sha',
      });
    });

    test('without either the clone follows the default branch, so it does not hold anyone', () => {
      expect(planned({ source: 'github', repo: 'your-org/p' })).toMatchObject({
        checkout: 'default-branch',
      });
    });
  });

  describe('#<ref> on the add command', () => {
    test('your-org/your-marketplace#stable is the stable branch or tag of the catalog', () => {
      const source = parseMarketplaceInput('your-org/your-marketplace#stable');
      expect(source).toMatchObject({
        kind: 'github',
        repo: 'your-org/your-marketplace',
        ref: 'stable',
      });
      if (!('kind' in source)) throw new Error('not a source');
      expect(planMarketplaceFetch(source)).toMatchObject({ kind: 'git', ref: 'stable' });
    });

    test('without #<ref> the catalog follows the default branch', () => {
      const source = parseMarketplaceInput('your-org/your-marketplace');
      expect('ref' in source).toBe(false);
    });
  });

  describe('<plugin>--v<version> tags', () => {
    const tags = [
      'code-formatter--v1.0.0',
      'code-formatter--v1.4.2',
      'code-formatter--v2.0.0',
      'other--v9.0.0',
    ];

    test("a dependency's version range resolves against these tags", () => {
      expect(selectTag(tags, 'code-formatter', '^1.0.0')).toEqual({
        tag: 'code-formatter--v1.4.2',
        version: '1.4.2',
      });
    });

    test('a tag is the plugin name, --v and the version', () => {
      expect(releaseTag('code-formatter', '1.4.2')).toBe('code-formatter--v1.4.2');
    });
  });

  test('one marketplace serves one version of each plugin: a second entry of the same name is refused', () => {
    const { marketplace, issues } = readMarketplace({
      name: 'm',
      owner: { name: 'o' },
      plugins: [
        { name: 'p', source: { source: 'github', repo: 'o/p', ref: 'v1' } },
        { name: 'p', source: { source: 'github', repo: 'o/p', ref: 'v2' } },
      ],
    });
    expect(marketplace?.plugins).toHaveLength(1);
    expect(issues.some((i) => i.severity === 'error' && i.path.startsWith('plugins'))).toBe(true);
  });
});

spec('updates.publish.Tag a release', () => {
  const tags = ['deploy-helper--v1.0.0', 'deploy-helper--v1.2.0', 'deploy-helper--v2.0.0'];

  test('claude plugin tag creates a {name}--v{version} tag', () => {
    expect(releaseTag('deploy-helper', '1.2.0')).toBe('deploy-helper--v1.2.0');
  });

  test('a version range declared on your plugin resolves against the tags: the highest tag in range', () => {
    const resolved = resolveDependencyVersion({
      dep: { name: 'deploy-helper', range: '^1.0.0' },
      source: { kind: 'github', repo: 'your-org/deploy-helper' },
      tags,
    });
    expect(resolved).toEqual({ via: 'tag', tag: 'deploy-helper--v1.2.0', version: '1.2.0' });
  });

  test('a release with no tag is invisible to a range: the install fails', () => {
    const resolved = resolveDependencyVersion({
      dep: { name: 'deploy-helper', range: '^3.0.0' },
      source: { kind: 'github', repo: 'your-org/deploy-helper' },
      tags,
    });
    expect(resolved).toMatchObject({
      severity: 'error',
      message: 'Dependency "deploy-helper" has no git tag satisfying ^3.0.0',
    });
  });

  test('otherwise you do not need a tag: with no range the dependency installs the current copy', () => {
    const resolved = resolveDependencyVersion({
      dep: { name: 'deploy-helper' },
      source: { kind: 'github', repo: 'your-org/deploy-helper' },
      tags: [],
    });
    expect(resolved).toEqual({ via: 'current-copy' });
  });

  test('a tag that is not {name}--v{version} does not count', () => {
    expect(selectTag(['v1.2.0', 'deploy-helper-1.2.0'], 'deploy-helper', '^1.0.0')).toBeUndefined();
  });
});
