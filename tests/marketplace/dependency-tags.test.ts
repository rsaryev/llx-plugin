/**
 * plugins/dependencies.md § Declare a dependency with a version constraint (the dependency installs
 * at the highest git tag that satisfies the range; a range does not match a pre-release unless it
 * opts in with `^2.0.0-0`), § Create a release tag (`<plugin-name>--v<version>`), § Constrain a
 * dependency that has a non-git source (npm, archive and command: the `plugin.json` version is what
 * is checked, and none satisfies no constraint), § How a constraint resolves against tags (an own
 * repository fails with `has no git tag satisfying`, a relative path uses the marketplace's current
 * copy), § Confirm the resolved version (the tag's version beats `plugin.json`), § Combine
 * constraints from several plugins (the three-row table); plugins/troubleshooting.md § Dependency
 * errors. What the docs leave open (the wording after a quoted prefix, the limit of "too complex")
 * is outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginIssue } from '../../src/format/issues.ts';
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import { checkInstalledDependency } from '../../src/marketplace/dependencies.ts';
import {
  combineRanges,
  parseReleaseTag,
  releaseTag,
  resolveDependencyVersion,
  selectTag,
  type ReleaseTag,
} from '../../src/marketplace/dependency-tags.ts';
import { spec } from '../support/spec.ts';

const NAME = 'secrets-vault';
const dep = (range?: string) => ({
  name: NAME,
  marketplace: 'your-marketplace',
  ...(range === undefined ? {} : { range }),
});
const tags = (...versions: string[]) => versions.map((version) => releaseTag(NAME, version));

const github: PluginSource = { kind: 'github', repo: 'acme/secrets-vault' };
const relative: PluginSource = { kind: 'relative', path: 'plugins/secrets-vault', bare: false };
const npm: PluginSource = { kind: 'npm', package: '@acme/secrets-vault' };
const archive: PluginSource = { kind: 'archive', url: 'https://example.com/v.zip' };
const command: PluginSource = {
  kind: 'command',
  command: 'make',
  timeoutSeconds: 60,
  mode: 'copy',
};

const isIssue = (value: object | undefined): value is PluginIssue =>
  value !== undefined && 'severity' in value;
const versionOf = (value: ReleaseTag | PluginIssue | undefined): string | undefined =>
  value === undefined || isIssue(value) ? undefined : value.version;
/** `^0.<minor>.0 || ^1.<minor>.0 || ...`: nine alternatives. */
const alternatives = (minor: number): string =>
  Array.from({ length: 9 }, (_, index) => `^${index}.${minor}.0`).join(' || ');

spec('dependencies.field.version', () => {
  describe('release tags are <plugin-name>--v<version>', () => {
    test('a tag is built from the plugin name and version', () => {
      expect(releaseTag('secrets-vault', '2.1.0')).toBe('secrets-vault--v2.1.0');
    });

    test('a tag of the plugin parses to its version, another plugin tag or a non-semver one does not', () => {
      expect(parseReleaseTag('secrets-vault--v2.1.0', NAME)).toBe('2.1.0');
      expect(parseReleaseTag('secrets-vault--v2.0.0-beta.1', NAME)).toBe('2.0.0-beta.1');
      expect(parseReleaseTag('deploy-kit--v2.1.0', NAME)).toBeUndefined();
      expect(parseReleaseTag('v2.1.0', NAME)).toBeUndefined();
      expect(parseReleaseTag('secrets-vault--v2.1', NAME)).toBeUndefined();
      expect(parseReleaseTag('secrets-vault--latest', NAME)).toBeUndefined();
    });
  });

  describe('the dependency installs at the highest tag that satisfies the range', () => {
    test('~2.1.0 takes the highest 2.1.x tag, not 2.2 or 3.0', () => {
      const found = selectTag(tags('2.0.5', '2.1.0', '2.1.7', '2.2.0', '3.0.0'), NAME, '~2.1.0');
      expect(found).toEqual({ tag: 'secrets-vault--v2.1.7', version: '2.1.7' });
    });

    test('versions are ordered as semver, not as text (2.10.0 is above 2.9.0)', () => {
      expect(selectTag(tags('2.9.0', '2.10.0'), NAME, '^2.0')?.version).toBe('2.10.0');
    });

    test('=2.1.0 takes exactly that tag; ranges ^2.0 and >=1.4 take the highest match', () => {
      const all = tags('1.4.0', '2.1.0', '2.5.0');
      expect(selectTag(all, NAME, '=2.1.0')?.version).toBe('2.1.0');
      expect(selectTag(all, NAME, '^2.0')?.version).toBe('2.5.0');
      expect(selectTag(all, NAME, '>=1.4')?.version).toBe('2.5.0');
    });

    test('tags of other plugins in the same repository never count', () => {
      const all = ['deploy-kit--v2.9.0', ...tags('2.1.0')];
      expect(selectTag(all, NAME, '^2.0')?.version).toBe('2.1.0');
    });

    test('a range that no tag satisfies selects nothing', () => {
      expect(selectTag(tags('1.0.0', '3.0.0'), NAME, '~2.1.0')).toBeUndefined();
      expect(selectTag([], NAME, '^1.0')).toBeUndefined();
    });

    test('a range does not match a pre-release tag unless it opts in with ^2.0.0-0', () => {
      const all = tags('2.0.0-beta.1');
      expect(selectTag(all, NAME, '^2.0.0')).toBeUndefined();
      expect(selectTag(all, NAME, '^2.0.0-0')?.version).toBe('2.0.0-beta.1');
      expect(selectTag(tags('2.0.0-beta.1', '2.0.0'), NAME, '^2.0.0-0')?.version).toBe('2.0.0');
    });
  });

  describe('constraints of several plugins combine into the highest version that satisfies all', () => {
    test('row 1: ^2.0 and >=2.1 install the highest 2.x tag at or above 2.1.0', () => {
      const found = combineRanges(
        ['^2.0', '>=2.1'],
        tags('2.0.0', '2.1.0', '2.4.2', '3.0.0'),
        NAME,
      );
      expect(found).toEqual({ tag: 'secrets-vault--v2.4.2', version: '2.4.2' });
    });

    test('row 2: ~2.1 and ~3.0 conflict, and the message says "has conflicting version requirements" and lists the ranges', () => {
      const found = combineRanges(['~2.1', '~3.0'], tags('2.1.0', '3.0.0'), NAME);
      expect(found).toMatchObject({ severity: 'error' });
      const message = isIssue(found) ? found.message : '';
      expect(message).toContain('"secrets-vault" has conflicting version requirements');
      expect(message).toContain('~2.1');
      expect(message).toContain('~3.0');
    });

    test('row 3: =2.1.0 alone stays at 2.1.0 although newer tags exist', () => {
      expect(combineRanges(['=2.1.0'], tags('2.1.0', '2.2.0', '3.0.0'), NAME)).toEqual({
        tag: 'secrets-vault--v2.1.0',
        version: '2.1.0',
      });
    });

    test('ranges that overlap but have no tag in common select nothing: the current copy is fetched', () => {
      expect(combineRanges(['^2.0', '>=2.1'], tags('2.0.0', '3.0.0'), NAME)).toBeUndefined();
    });

    test('a range that is not valid semver is "has an invalid version requirement"', () => {
      const found = combineRanges(['^2.0', 'banana'], tags('2.0.0'), NAME);
      expect(found).toMatchObject({ severity: 'error' });
      expect(isIssue(found) ? found.message : '').toContain('has an invalid version requirement');
    });
  });

  describe('which version a constraint checks, by the source the dependency comes from', () => {
    test('github, url and git-subdir: the highest satisfying tag of its own repository', () => {
      for (const source of [
        github,
        { kind: 'url', url: 'https://example.com/a.git' } as const,
        { kind: 'git-subdir', url: 'https://example.com/a.git', path: 'p' } as const,
      ]) {
        expect(
          resolveDependencyVersion({ dep: dep('~2.1.0'), source, tags: tags('2.1.3', '2.2.0') }),
        ).toEqual({ via: 'tag', tag: 'secrets-vault--v2.1.3', version: '2.1.3' });
      }
    });

    test('a plugin with its own repository and no tag in range fails with "has no git tag satisfying"', () => {
      const found = resolveDependencyVersion({
        dep: dep('~2.1.0'),
        source: github,
        tags: tags('3.0.0'),
        currentCopyVersion: '2.1.0',
      });
      expect(found).toMatchObject({ severity: 'error' });
      expect(isIssue(found) ? found.message : '').toBe(
        'Dependency "secrets-vault@your-marketplace" has no git tag satisfying ~2.1.0',
      );
    });

    test('a relative-path plugin with no tag in range uses the marketplace current copy, checked when it loads', () => {
      const found = resolveDependencyVersion({
        dep: dep('~2.1.0'),
        source: relative,
        tags: tags('2.0.0'),
        currentCopyVersion: '3.0.0',
      });
      expect(found).toEqual({ via: 'current-copy', version: '3.0.0' });
      expect(
        checkInstalledDependency(dep('~2.1.0'), { version: '3.0.0', enabled: true })?.message,
      ).toBe('Requires "secrets-vault@your-marketplace" ~2.1.0, installed 3.0.0');
    });

    test('a relative-path plugin takes the tag when one satisfies the range', () => {
      expect(
        resolveDependencyVersion({
          dep: dep('~2.1.0'),
          source: relative,
          tags: tags('2.1.4', '3.0.0'),
          currentCopyVersion: '3.0.0',
        }),
      ).toEqual({ via: 'tag', tag: 'secrets-vault--v2.1.4', version: '2.1.4' });
    });

    test('a local folder that is not a git repository has no tags: the current contents are installed', () => {
      expect(
        resolveDependencyVersion({
          dep: dep('^2.0'),
          source: relative,
          tags: [],
          currentCopyVersion: '2.2.0',
        }),
      ).toEqual({ via: 'current-copy', version: '2.2.0' });
    });

    test('npm, archive and command: the range does not choose what is fetched, the plugin.json version is what is checked', () => {
      for (const source of [npm, archive, command]) {
        expect(
          resolveDependencyVersion({
            dep: dep('^2.0'),
            source,
            tags: tags('2.5.0'),
            currentCopyVersion: '2.1.0',
          }),
        ).toEqual({ via: 'current-copy', version: '2.1.0' });
      }
    });

    test('a non-git plugin whose plugin.json sets no version satisfies no constraint', () => {
      const found = resolveDependencyVersion({ dep: dep('>=0.0.0'), source: npm, tags: [] });
      expect(found).toEqual({ via: 'current-copy' });
      expect(checkInstalledDependency(dep('>=0.0.0'), { enabled: true })).toMatchObject({
        severity: 'error',
      });
    });

    test('the tag version is what the constraint checks, even when plugin.json at that commit lags behind', () => {
      const found = resolveDependencyVersion({
        dep: dep('~2.1.0'),
        source: github,
        tags: tags('2.1.0'),
        currentCopyVersion: '2.0.0',
      });
      expect(found).toEqual({ via: 'tag', tag: 'secrets-vault--v2.1.0', version: '2.1.0' });
      const installed =
        isIssue(found) || found.version === undefined ? {} : { version: found.version };
      expect(
        checkInstalledDependency(dep('~2.1.0'), { ...installed, enabled: true }),
      ).toBeUndefined();
    });

    test('a dependency without a range tracks the marketplace current copy, whatever tags exist', () => {
      expect(
        resolveDependencyVersion({
          dep: dep(),
          source: github,
          tags: tags('9.0.0'),
          currentCopyVersion: '2.0.0',
        }),
      ).toEqual({ via: 'current-copy', version: '2.0.0' });
    });
  });
});

describe('judgments (outside spec)', () => {
  test('a tag with a v, = or blank before the version, is not a release tag', () => {
    for (const text of ['v2.1.0', '=2.1.0', ' 2.1.0']) {
      expect(parseReleaseTag(`secrets-vault--v${text}`, NAME)).toBeUndefined();
    }
  });

  test('a plugin whose name contains --v does not read another plugin tag as its own', () => {
    expect(parseReleaseTag('a--v2.0.0', 'a--v2')).toBeUndefined();
  });

  test('more than 64 || combinations are "too complex to intersect"', () => {
    const found = combineRanges([alternatives(0), alternatives(1)], tags('1.0.0'), NAME);
    expect(found).toMatchObject({ severity: 'error' });
    expect(isIssue(found) ? found.message : '').toBe(
      'Dependency "secrets-vault" has version requirements too complex to intersect',
    );
  });

  test('ranges with || combine by distribution: (^1 || ^3) and ^3.1 select the 3.x tag', () => {
    expect(
      versionOf(combineRanges(['^1.0.0 || ^3.0.0', '^3.1.0'], tags('1.5.0', '3.2.0'), NAME)),
    ).toBe('3.2.0');
    expect(
      combineRanges(['^1.0.0 || ^3.0.0', '^2.0.0'], tags('1.5.0', '3.2.0'), NAME),
    ).toMatchObject({
      severity: 'error',
    });
  });

  test('duplicate ranges are one range', () => {
    expect(versionOf(combineRanges(['^2.0', '^2.0'], tags('2.1.0'), NAME))).toBe('2.1.0');
  });

  test('a range no version can satisfy conflicts even alone', () => {
    expect(combineRanges(['>2.0.0 <1.0.0'], tags('1.5.0'), NAME)).toMatchObject({
      severity: 'error',
    });
  });

  test('no ranges select nothing', () => {
    expect(combineRanges([], tags('1.0.0'), NAME)).toBeUndefined();
  });
});
