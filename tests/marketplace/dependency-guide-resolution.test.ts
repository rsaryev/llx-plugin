/**
 * plugins/dependencies.md § How a constraint resolves against tags (the highest tag in range; an own
 * repository with none fails with `has no git tag satisfying`; a relative path installs the current
 * copy and the constraint is checked at load, `Requires "..." ~2.1.0, installed 3.0.0`; a local
 * marketplace folder resolves against its git tags, or installs its current contents when it is no
 * git repository), § Confirm the resolved version (`2.1.0-8713c5b11005`, the tag's version beats
 * `plugin.json`, a force-moved tag fetches the new commit), § Combine constraints from several
 * plugins (the three-row table). plugins/troubleshooting.md § Dependency errors for the messages.
 */
import { describe, expect, test } from 'bun:test';
import { checkInstalledDependency } from '../../src/marketplace/dependencies.ts';
import { installClosure, type InstallPlan } from '../../src/marketplace/dependency-install-plan.ts';
import { autoUpdateDecision, releaseTag } from '../../src/marketplace/dependency-tags.ts';
import { constraintsOn, type GraphFacts } from '../../src/marketplace/dependency-graph.ts';
import { isVersionSegment } from '../../src/marketplace/version-resolution.ts';
import { isUpdate } from '../../src/marketplace/update-detection.ts';
import { dep, facts, installed, plugin, relativeSource } from '../support/dependency-facts.ts';
import { spec } from '../support/spec.ts';

const tagsOf = (name: string, ...versions: string[]) =>
  versions.map((version) => releaseTag(name, version));
const planFor = (root: string, have: GraphFacts): InstallPlan =>
  installClosure({ root, scope: 'user', operation: 'install' }, have);
const stepOf = (plan: InstallPlan, id: string) => plan.steps.find((one) => one.id === id);

const VAULT = 'secrets-vault@your-marketplace';
const vault = (options: Parameters<typeof plugin>[1] = {}) =>
  plugin('secrets-vault', { marketplace: 'your-marketplace', ...options });
const deployKit = (range: string) =>
  plugin('deploy-kit', {
    marketplace: 'your-marketplace',
    manifest: [{ name: 'secrets-vault', version: range }],
  });

spec(
  [
    'dependencies.guide.How a constraint resolves against tags',
    'install.troubleshooting.Dependency errors.... has no git tag satisfying <range>',
  ],
  () => {
    const tags = tagsOf('secrets-vault', '2.0.5', '2.1.0', '2.1.3', '2.2.0', '3.0.0');

    test('~2.1.0 installs the dependency from the highest secrets-vault--v tag that satisfies it', () => {
      const plan = planFor(
        'deploy-kit@your-marketplace',
        facts([deployKit('~2.1.0'), vault({ tags })]),
      );
      expect(stepOf(plan, VAULT)?.resolution).toEqual({
        via: 'tag',
        tag: 'secrets-vault--v2.1.3',
        version: '2.1.3',
      });
    });

    test('a plugin with its own repository and no tag in range fails the install with `has no git tag satisfying`', () => {
      const plan = planFor(
        'deploy-kit@your-marketplace',
        facts([deployKit('~4.0.0'), vault({ tags })]),
      );
      expect(plan.ok).toBe(false);
      expect(plan.steps).toEqual([]);
      expect(plan.issues[0]?.message).toContain(
        'Dependency "secrets-vault@your-marketplace" has no git tag satisfying',
      );
    });

    test('a relative path with no tag in range installs the marketplace current copy, outside the range it stays disabled with the Requires message', () => {
      const plan = planFor(
        'deploy-kit@your-marketplace',
        facts([
          deployKit('~2.1.0'),
          vault({
            source: relativeSource('plugins/secrets-vault'),
            tags: [],
            currentCopyVersion: '3.0.0',
          }),
        ]),
      );
      const step = stepOf(plan, VAULT);
      expect(plan.ok).toBe(true);
      expect(step?.resolution).toEqual({ via: 'current-copy', version: '3.0.0' });
      expect(step?.loadIssues.map((one) => one.message)).toEqual([
        'Requires "secrets-vault@your-marketplace" ~2.1.0, installed 3.0.0',
      ]);
      expect(step?.loadIssues[0]?.errorType).toBe('dependency-version-unsatisfied');
    });

    test('a relative path whose marketplace repository has a tag in range installs that tag', () => {
      const plan = planFor(
        'deploy-kit@your-marketplace',
        facts([
          deployKit('~2.1.0'),
          vault({
            source: relativeSource('plugins/secrets-vault'),
            tags,
            currentCopyVersion: '3.0.0',
          }),
        ]),
      );
      expect(stepOf(plan, VAULT)?.resolution?.tag).toBe('secrets-vault--v2.1.3');
      expect(stepOf(plan, VAULT)?.loadIssues).toEqual([]);
    });

    test('a marketplace folder that is a git repository resolves against its tags; one that is not installs its current contents', () => {
      const entry = (folderTags: readonly string[]) =>
        facts([
          deployKit('~2.1.0'),
          vault({
            source: relativeSource('plugins/secrets-vault'),
            tags: folderTags,
            currentCopyVersion: '2.2.0',
          }),
        ]);
      expect(
        stepOf(planFor('deploy-kit@your-marketplace', entry(tags)), VAULT)?.resolution?.via,
      ).toBe('tag');
      const plain = stepOf(planFor('deploy-kit@your-marketplace', entry([])), VAULT);
      expect(plain?.resolution).toEqual({ via: 'current-copy', version: '2.2.0' });
    });

    test('a range does not match a pre-release tag unless it opts in', () => {
      const beta = tagsOf('secrets-vault', '2.0.0-beta.1');
      const plain = planFor(
        'deploy-kit@your-marketplace',
        facts([deployKit('^2.0.0'), vault({ tags: beta })]),
      );
      expect(plain.ok).toBe(false);
      const optIn = planFor(
        'deploy-kit@your-marketplace',
        facts([deployKit('^2.0.0-0'), vault({ tags: beta })]),
      );
      expect(stepOf(optIn, VAULT)?.resolution?.version).toBe('2.0.0-beta.1');
    });
  },
);

spec('dependencies.guide.Confirm the resolved version', () => {
  const COMMIT = '8713c5b11005d1f1e2a3b4c5d6e7f8091a2b3c4d';
  const resolved = (commit: string, currentCopyVersion = '2.0.0') =>
    stepOf(
      planFor(
        'deploy-kit@your-marketplace',
        facts([
          deployKit('~2.1.0'),
          vault({
            tags: tagsOf('secrets-vault', '2.1.0'),
            tagCommits: { 'secrets-vault--v2.1.0': commit },
            currentCopyVersion,
          }),
        ]),
      ),
      VAULT,
    );

  test('a tag-resolved dependency shows its version with a 12-character commit suffix', () => {
    expect(resolved(COMMIT)?.version).toBe('2.1.0-8713c5b11005');
  });

  test('the constraint is checked against the tag version, even when plugin.json at that commit lags behind', () => {
    const step = resolved(COMMIT, '2.0.0');
    expect(step?.resolution?.version).toBe('2.1.0');
    expect(step?.loadIssues).toEqual([]);
    expect(
      checkInstalledDependency(
        dep({ name: 'secrets-vault', version: '~2.1.0' }, 'your-marketplace'),
        {
          enabled: true,
          version: step?.resolution?.version ?? 'missing',
        },
      ),
    ).toBeUndefined();
  });

  test('a tag force-moved to another commit gives another version, so the next install does not reuse the stale cached copy', () => {
    const before = resolved(COMMIT)?.version;
    const after = resolved('f00dfeedcafe0123456789abcdef0123456789ab')?.version;
    expect(after).toBe('2.1.0-f00dfeedcafe');
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(isUpdate(before, after ?? '')).toBe('new copy');
    expect(isUpdate(after, after ?? '')).toBe('unchanged');
    expect(isVersionSegment(after ?? '')).toBe(true);
  });
});

describe('Combine constraints from several plugins', () => {
  const lib = (...versions: string[]) =>
    plugin('lib', { marketplace: 'm', tags: tagsOf('lib', ...versions), tagCommits: {} });
  const dependent = (name: string, range?: string) =>
    plugin(name, { manifest: [range === undefined ? 'lib' : { name: 'lib', version: range }] });
  const have = (range: string | undefined, libVersion: string) => [
    installed('a@m', { deps: [{ name: 'lib', version: range }] }),
    installed('lib@m', { auto: true, version: libVersion }),
  ];

  spec('dependencies.guide.Combine constraints from several plugins.^2.0', () => {
    test('^2.0 and >=2.1 give one install at the highest 2.x tag at or above 2.1.0, and both plugins load', () => {
      const catalog = [
        lib('2.0.0', '2.1.0', '2.5.3', '3.0.0'),
        dependent('a', '^2.0'),
        dependent('b', '>=2.1'),
      ];
      const plan = planFor('b@m', facts(catalog, have('^2.0', '2.0.0')));
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]).toMatchObject({
        id: 'lib@m',
        action: 'update',
        resolution: { via: 'tag', tag: 'lib--v2.5.3', version: '2.5.3' },
      });
      expect(plan.steps[0]?.ranges).toEqual(['>=2.1', '^2.0']);
      for (const range of ['^2.0', '>=2.1']) {
        expect(
          checkInstalledDependency(dep({ name: 'lib', version: range }), {
            enabled: true,
            version: '2.5.3',
          }),
        ).toBeUndefined();
      }
    });

    test('the dependency is not touched when its installed version already satisfies both', () => {
      const catalog = [
        lib('2.0.0', '2.1.0', '2.5.3'),
        dependent('a', '^2.0'),
        dependent('b', '>=2.1'),
      ];
      expect(planFor('b@m', facts(catalog, have('^2.0', '2.1.0'))).steps).toEqual([]);
    });
  });

  spec('dependencies.guide.Combine constraints from several plugins.~2.1', () => {
    test('~2.1 and ~3.0: installing plugin B fails with `has conflicting version requirements` and changes nothing', () => {
      const catalog = [
        lib('2.1.0', '2.1.4', '3.0.0'),
        dependent('a', '~2.1'),
        dependent('b', '~3.0'),
      ];
      const before = facts(catalog, have('~2.1', '2.1.4'));
      const snapshot = structuredClone(before);
      const plan = planFor('b@m', before);
      expect(plan.ok).toBe(false);
      expect(plan.steps).toEqual([]);
      expect(plan.issues).toHaveLength(1);
      expect(plan.issues[0]?.message).toContain('has conflicting version requirements');
      expect(plan.issues[0]?.message).toContain('~2.1');
      expect(plan.issues[0]?.message).toContain('~3.0');
      expect(before).toEqual(snapshot);
    });
  });

  spec('dependencies.guide.Combine constraints from several plugins.=2.1.0', () => {
    test('=2.1.0 and no other range: the dependency stays at 2.1.0 and auto-update skips newer versions', () => {
      const installedFacts = facts([], have('=2.1.0', '2.1.0'));
      const ranges = constraintsOn('lib@m', installedFacts).map((one) => one.range);
      expect(ranges).toEqual(['=2.1.0']);
      const decision = autoUpdateDecision({
        dep: dep({ name: 'lib', version: '=2.1.0' }),
        ranges,
        tags: tagsOf('lib', '2.1.0', '2.2.0', '3.0.0'),
      });
      expect(decision).toEqual({
        outcome: 'update',
        via: 'tag',
        tag: 'lib--v2.1.0',
        version: '2.1.0',
      });
    });

    test('a plugin that puts no range on it installs without moving the dependency, while plugin A pins it', () => {
      const catalog = [lib('2.1.0', '2.2.0', '3.0.0'), dependent('a', '=2.1.0'), dependent('b')];
      expect(planFor('b@m', facts(catalog, have('=2.1.0', '2.1.0'))).steps).toEqual([]);
    });

    test('a fresh install of plugin A pins the dependency at 2.1.0 although newer tags exist', () => {
      const catalog = [lib('2.1.0', '2.2.0', '3.0.0'), dependent('a', '=2.1.0')];
      expect(stepOf(planFor('a@m', facts(catalog)), 'lib@m')?.resolution?.version).toBe('2.1.0');
    });
  });
});
