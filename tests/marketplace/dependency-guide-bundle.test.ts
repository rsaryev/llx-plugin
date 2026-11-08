/**
 * plugins/dependencies.md § Bundle plugins for a team (a plugin whose manifest holds a `name` and a
 * `dependencies` array is valid, and installing it installs every dependency; a new bundle version
 * with an extra dependency installs just that one), § Create a release tag (`<plugin-name>--v<version>`,
 * so one marketplace repository can host several plugins with independent histories). The checks
 * `claude plugin tag` runs before creating the tag belong to the cli stream; only the tag name and
 * how it is read are tested here, outside `spec(...)`, so that section is not claimed as proven.
 */
import { describe, expect, test } from 'bun:test';
import { readManifest } from '../../src/format/manifest.ts';
import {
  installClosure,
  type DependencyInstallOperation,
} from '../../src/marketplace/dependency-install-plan.ts';
import { parseReleaseTag, releaseTag, selectTag } from '../../src/marketplace/dependency-tags.ts';
import { dep, facts, installed, plugin } from '../support/dependency-facts.ts';
import { spec } from '../support/spec.ts';

const MARKETPLACE = 'internal';
const BUNDLE_ID = `backend-standard@${MARKETPLACE}`;
const BUNDLE_MANIFEST = {
  name: 'backend-standard',
  version: '1.0.0',
  description: 'Standard plugin set for backend engineers',
  dependencies: [
    'secrets-vault',
    'deploy-kit',
    { name: 'db-migrate', version: '^3.0' },
    'oncall-runbook',
  ],
};
const MEMBERS = ['secrets-vault', 'deploy-kit', 'db-migrate', 'oncall-runbook'];
const IDS = MEMBERS.map((name) => `${name}@${MARKETPLACE}`);

const catalog = (dependencies: readonly unknown[] = BUNDLE_MANIFEST.dependencies) => [
  plugin('backend-standard', {
    marketplace: MARKETPLACE,
    manifest: dependencies,
  }),
  ...MEMBERS.map((name) =>
    plugin(name, {
      marketplace: MARKETPLACE,
      tags:
        name === 'db-migrate'
          ? ['db-migrate--v3.0.0', 'db-migrate--v3.4.1', 'db-migrate--v4.0.0']
          : [],
      currentCopyVersion: '1.0.0',
    }),
  ),
];

const install = (have = facts(catalog()), operation: DependencyInstallOperation = 'install') =>
  installClosure({ root: BUNDLE_ID, scope: 'user', operation }, have);

spec('dependencies.guide.Bundle plugins for a team', () => {
  test('a manifest with only a name and dependencies is a valid plugin', () => {
    const found = readManifest({
      name: 'backend-standard',
      dependencies: BUNDLE_MANIFEST.dependencies,
    });
    expect(found.issues).toEqual([]);
    expect(found.manifest?.dependencies).toHaveLength(4);
  });

  test('the docs example reads as four dependencies in the bundle marketplace, one with a ^3.0 range', () => {
    expect(BUNDLE_MANIFEST.dependencies.map((one) => dep(one, MARKETPLACE))).toEqual([
      { name: 'secrets-vault', marketplace: MARKETPLACE },
      { name: 'deploy-kit', marketplace: MARKETPLACE },
      { name: 'db-migrate', marketplace: MARKETPLACE, range: '^3.0' },
      { name: 'oncall-runbook', marketplace: MARKETPLACE },
    ]);
  });

  test('installing the bundle installs every dependency, the constrained one at the highest 3.x tag', () => {
    const plan = install();
    expect(plan.ok).toBe(true);
    expect(plan.steps.map((one) => [one.id, one.action])).toEqual(IDS.map((id) => [id, 'install']));
    const migrate = plan.steps.find((one) => one.id === `db-migrate@${MARKETPLACE}`);
    expect(migrate?.resolution).toEqual({
      via: 'tag',
      tag: 'db-migrate--v3.4.1',
      version: '3.4.1',
    });
    expect(plan.steps.every((one) => one.requiredBy.includes(BUNDLE_ID))).toBe(true);
  });

  // The docs' two paths: the next auto-update, or `claude plugin update` then `/reload-plugins`.
  test.each(['auto-update', 'reload-plugins'] as const)(
    'a new bundle version with an extra dependency installs only the dependency it adds (%s)',
    (operation) => {
      const have = facts(
        [
          ...catalog([...BUNDLE_MANIFEST.dependencies, 'lint-rules']),
          plugin('lint-rules', { marketplace: MARKETPLACE, currentCopyVersion: '2.0.0' }),
        ],
        [
          installed(BUNDLE_ID, { deps: BUNDLE_MANIFEST.dependencies }),
          ...IDS.map((id) =>
            installed(id, { auto: true, version: id.startsWith('db-') ? '3.4.1' : '1.0.0' }),
          ),
        ],
      );
      const plan = install(have, operation);
      expect(plan.ok).toBe(true);
      expect(plan.steps.map((one) => [one.id, one.action, one.requiredBy])).toEqual([
        [`lint-rules@${MARKETPLACE}`, 'install', [BUNDLE_ID]],
      ]);
      expect(plan.leftOut).toEqual([]);
    },
  );

  test('a bundle member its marketplace does not list refuses the whole install and installs nothing', () => {
    const plan = install(facts(catalog().filter(([id]) => !id.startsWith('oncall-runbook'))));
    expect(plan.ok).toBe(false);
    expect(plan.steps).toEqual([]);
    expect(plan.issues[0]?.message).toContain('oncall-runbook@internal');
  });
});

// Not a `spec(...)`: the section also documents what `claude plugin tag` checks, prints and pushes
// (four pre-checks, `Created tag ...`, `Pushed to origin`, the `git push` hint, `--dry-run`), which
// the cli stream implements; until it does, only the tag name and its reading are tested, and the
// requirement `dependencies.guide.Create a release tag` is not claimed.
describe('release tag name', () => {
  test('a release is tagged <plugin-name>--v<version>', () => {
    expect(releaseTag('secrets-vault', '2.1.0')).toBe('secrets-vault--v2.1.0');
    expect(parseReleaseTag('secrets-vault--v2.1.0', 'secrets-vault')).toBe('2.1.0');
  });

  test('the plugin-name prefix lets one repository host several plugins with independent histories', () => {
    const tags = [
      'secrets-vault--v2.1.0',
      'deploy-kit--v3.0.0',
      'secrets-vault--v1.9.0',
      'deploy-kit--v3.1.0',
    ];
    expect(selectTag(tags, 'secrets-vault', '*')?.version).toBe('2.1.0');
    expect(selectTag(tags, 'deploy-kit', '*')?.version).toBe('3.1.0');
    expect(parseReleaseTag('deploy-kit--v3.0.0', 'secrets-vault')).toBeUndefined();
  });

  test('a tag that is not <name>--v<version> names no release of the plugin', () => {
    expect(parseReleaseTag('v2.1.0', 'secrets-vault')).toBeUndefined();
    expect(parseReleaseTag('secrets-vault-v2.1.0', 'secrets-vault')).toBeUndefined();
    expect(parseReleaseTag('secrets-vault--v2.1', 'secrets-vault')).toBeUndefined();
    expect(parseReleaseTag('secrets-vault-extra--v2.1.0', 'secrets-vault')).toBeUndefined();
  });
});
