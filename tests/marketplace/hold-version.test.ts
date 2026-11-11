/**
 * plugins/host-marketplace.md § Keep users up to date → Hold users on one version (`ref` and `sha`
 * on the plugin entry for a `github`, `url` or `git-subdir` source, `#<ref>` on the add command,
 * `<plugin>--v<version>` tags; "[Release a new version] says when a changed entry reaches users")
 * and plugins/publish.md § Ship updates, renames, and removals → Tag a release.
 */
import { describe, expect, test } from 'bun:test';
import { readMarketplace } from '../../src/format/marketplace/marketplace.ts';
import {
  releaseTag,
  resolveDependencyVersion,
  selectTag,
} from '../../src/marketplace/dependency-tags.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { planMarketplaceFetch } from '../../src/marketplace/marketplace-fetch-plan.ts';
import { parseMarketplaceInput } from '../../src/marketplace/marketplace-input.ts';
import { isUpdate } from '../../src/marketplace/update-detection.ts';
import { githubVersionAt } from '../support/plugin-version.ts';
import { spec } from '../support/spec.ts';

const FIRST = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SECOND = '0123456789abcdef0123456789abcdef01234567';

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

    test('a sha names a commit and wins when both are set, for github, url and git-subdir', () => {
      const sources = [
        { source: 'github', repo: 'your-org/p' },
        { source: 'url', url: 'https://example.com/p.git' },
        { source: 'git-subdir', url: 'https://example.com/p.git', path: 'plugin' },
      ];
      for (const source of sources) {
        expect(planned({ ...source, sha: FIRST })).toMatchObject({
          kind: 'git',
          sha: FIRST,
          checkout: 'sha',
        });
        expect(planned({ ...source, ref: 'main', sha: FIRST })).toMatchObject({
          sha: FIRST,
          checkout: 'sha',
        });
      }
    });

    describe('a changed entry reaches users only as Release a new version says', () => {
      /** The version of the copy the pinned `sha` checks out (`planned` above: `checkout: 'sha'`). */
      const versionOf = (sha: string, entryVersion?: string) =>
        githubVersionAt(sha, undefined, entryVersion);

      test('with a pinned version, moving the sha leaves users on the cached copy', async () => {
        expect(isUpdate(await versionOf(FIRST, '1.0.0'), await versionOf(SECOND, '1.0.0'))).toBe(
          'unchanged',
        );
      });

      test('with version omitted, moving the sha gives users a new copy', async () => {
        expect(isUpdate(await versionOf(FIRST), await versionOf(SECOND))).toBe('new copy');
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
