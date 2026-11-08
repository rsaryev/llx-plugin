/**
 * plugins/loading.md § Find plugins on disk (`cache/<marketplace>/<plugin>/<version>/`), § In-place
 * and copied plugins, § Cleanup of previous versions; plugins/marketplace-reference.md § Copy mode
 * and link mode. An install is planned in two pure steps: what to fetch and how it is installed,
 * then where it goes and what `installed_plugins.json` becomes. The record's own fields beyond the
 * docs' (`installedAt`, `lastUpdated`) are judgments (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import { decideInstallMode } from '../../src/marketplace/install-mode.ts';
import {
  planInstallFinish,
  planInstallStart,
  type InstallFinish,
} from '../../src/marketplace/install-plan.ts';
import type { InstalledRecords, InstallRecord } from '../../src/marketplace/installed-plugins.ts';
import { computePluginVersion } from '../../src/marketplace/plugin-version.ts';
import { copyModeHash } from '../../src/marketplace/version-hash.ts';
import { createStoreLayout } from '../../src/marketplace/store-layout.ts';
import { realSha256 } from '../support/marketplace-ports.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const join = (base: string, rel: string): string => `${base}/${rel}`;
const layout = createStoreLayout('/p', join);
const AT = '2026-11-08T10:00:00.000Z';
const LATER = '2026-11-09T10:00:00.000Z';

const start = (source: PluginSource, marketplaceOrigin?: { kind: 'directory'; path: string }) =>
  planInstallStart({
    source,
    fetch: { platform: 'posix', ...(marketplaceOrigin === undefined ? {} : { marketplaceOrigin }) },
  });

const copy = (rest: Partial<InstallFinish> = {}): InstallFinish => {
  const decided = decideInstallMode({
    origin: { kind: 'marketplace', source: { kind: 'github', repo: 'acme/f' } },
    platform: 'posix',
  });
  if ('severity' in decided) throw new Error('expected a decision');
  return {
    name: 'formatter',
    marketplace: 'acme',
    decision: decided,
    version: { version: '1.0.0', origin: 'manifest' },
    layout,
    join,
    scope: 'user',
    existing: {},
    at: AT,
    ...rest,
  };
};

const record = (installPath: string, rest: Partial<InstallRecord> = {}): InstallRecord => ({
  scope: 'user',
  installPath,
  version: 'v',
  installedAt: AT,
  ...rest,
});

describe('planInstallStart', () => {
  test('a github source is cloned and then copied into the cache', () => {
    const planned = start({ kind: 'github', repo: 'acme/formatter' });
    expect(planned.fetch).toMatchObject({ kind: 'git' });
    expect(planned.decision).toMatchObject({ mode: 'copy', cached: true });
    expect(planned.issues).toEqual([]);
  });

  test('a relative path in a marketplace added from a directory is read where it is', () => {
    const planned = start(
      { kind: 'relative', path: 'plugins/f', bare: false },
      { kind: 'directory', path: '/m' },
    );
    expect(planned.fetch).toMatchObject({ kind: 'local', fromMarketplaceRoot: 'plugins/f' });
    expect(planned.decision).toMatchObject({ mode: 'in-place' });
  });

  test('a source that cannot be fetched plans nothing and says why, once', () => {
    const planned = start({ kind: 'npm', package: 'github:acme/formatter' });
    expect(planned.fetch).toBeUndefined();
    expect(planned.decision).toBeUndefined();
    expect(planned.issues).toHaveLength(1);
  });

  test('link mode on Windows is refused once, not by the fetch plan and again by the mode', () => {
    const planned = planInstallStart({
      source: { kind: 'command', command: 'tool path', timeoutSeconds: 60, mode: 'link' },
      fetch: { platform: 'windows' },
    });
    expect(planned.fetch).toBeUndefined();
    expect(planned.issues).toHaveLength(1);
  });
});

spec('install.loading.In-place and copied plugins', () => {
  test('a copied plugin goes to cache/<marketplace>/<plugin>/<version>/ and is recorded there', () => {
    const done = planInstallFinish(copy());
    expect(done.destination).toBe('/p/cache/acme/formatter/1.0.0');
    expect(done.record).toMatchObject({
      scope: 'user',
      installPath: '/p/cache/acme/formatter/1.0.0',
      version: '1.0.0',
    });
    expect(done.records['formatter@acme']).toHaveLength(1);
    expect(done.records['formatter@acme']?.[0]).toBe(done.record);
  });

  test('a plugin loaded in place has no cache folder: it is recorded where it lies', () => {
    const decided = decideInstallMode({
      origin: {
        kind: 'marketplace',
        marketplace: 'directory',
        source: { kind: 'relative', path: 'plugins/f', bare: false },
      },
      platform: 'posix',
    });
    if ('severity' in decided) throw new Error('expected a decision');
    const done = planInstallFinish(copy({ decision: decided, sourceDirectory: '/m/plugins/f' }));
    expect(done.destination).toBeUndefined();
    expect(done.record?.installPath).toBe('/m/plugins/f');
  });

  test('a plugin loaded in place with no directory to name is not planned', () => {
    const decided = decideInstallMode({ origin: { kind: 'skills-directory' }, platform: 'posix' });
    if ('severity' in decided) throw new Error('expected a decision');
    const done = planInstallFinish(copy({ decision: decided }));
    expect(done.record).toBeUndefined();
    expect(done.issues).toHaveLength(1);
  });
});

const COPY_LINK = 'marketplace.rule.Copy mode and link mode';

spec(`${COPY_LINK}.copy`, () => {
  test('the version of a copied command source is a hash of the copied files, and names the cache folder', async () => {
    const files = memoryFiles({ '.claude-plugin/plugin.json': '{}', 'skills/a/SKILL.md': 'x' });
    const commandHash = await copyModeHash(files, realSha256);
    const version = await computePluginVersion(
      { sourceKind: 'command', commandHash, inGitRepository: false, enclosingRepoIgnored: false },
      realSha256,
    );
    const done = planInstallFinish(copy({ version }));
    expect(version.version).toBe(commandHash);
    expect(done.destination).toBe(`/p/cache/acme/formatter/${commandHash}`);
  });
});

spec(`${COPY_LINK}.link`, () => {
  test('the cache entry is filled with a link to each top-level entry of the printed directory', () => {
    const decided = decideInstallMode({
      origin: {
        kind: 'marketplace',
        source: { kind: 'command', command: 'tool path', timeoutSeconds: 60, mode: 'link' },
      },
      platform: 'posix',
    });
    if ('severity' in decided) throw new Error('expected a decision');
    const done = planInstallFinish(
      copy({
        decision: decided,
        sourceDirectory: '/opt/tool/out',
        topLevel: ['.claude-plugin', 'skills', 'node_modules'],
      }),
    );
    expect(done.destination).toBe('/p/cache/acme/formatter/1.0.0');
    expect(done.links).toEqual([
      { name: '.claude-plugin', target: '/opt/tool/out/.claude-plugin' },
      { name: 'skills', target: '/opt/tool/out/skills' },
      { name: 'node_modules', target: '/opt/tool/out/node_modules' },
    ]);
  });

  test('a copy has no links', () => {
    expect(planInstallFinish(copy({ topLevel: ['skills'] })).links).toEqual([]);
  });
});

spec(`${COPY_LINK}.Keep the directory in place`, () => {
  test('every link points into the printed directory, which is the one place the plugin loads from', () => {
    const decided = decideInstallMode({
      origin: {
        kind: 'marketplace',
        source: { kind: 'command', command: 'tool path', timeoutSeconds: 60, mode: 'link' },
      },
      platform: 'posix',
    });
    if ('severity' in decided) throw new Error('expected a decision');
    const done = planInstallFinish(
      copy({ decision: decided, sourceDirectory: '/opt/tool/out', topLevel: ['skills', 'hooks'] }),
    );
    expect(done.links.every((one) => one.target.startsWith('/opt/tool/out/'))).toBe(true);
    // nothing of the printed directory is copied, so nothing else holds its files
    expect(done.links).toHaveLength(2);
    expect(decided.linked).toBe(true);
  });
});

spec('install.loading.Cleanup of previous versions', () => {
  test("an update puts the new record in the old one's place and orphans the old version folder", () => {
    const old = record('/p/cache/acme/formatter/1.0.0');
    const done = planInstallFinish(
      copy({
        existing: { 'formatter@acme': [old] },
        version: { version: '1.1.0', origin: 'manifest' },
        at: LATER,
      }),
    );
    expect(done.orphaned).toEqual(['/p/cache/acme/formatter/1.0.0']);
    expect(done.records['formatter@acme']).toHaveLength(1);
    expect(done.record).toMatchObject({
      installPath: '/p/cache/acme/formatter/1.1.0',
      installedAt: AT,
      lastUpdated: LATER,
    });
  });

  test('a reinstall of the same version orphans nothing', () => {
    const existing: InstalledRecords = {
      'formatter@acme': [record('/p/cache/acme/formatter/1.0.0')],
    };
    expect(planInstallFinish(copy({ existing })).orphaned).toEqual([]);
  });

  test('a version folder another scope still uses is not orphaned', () => {
    const shared = '/p/cache/acme/formatter/1.0.0';
    const existing: InstalledRecords = {
      'formatter@acme': [
        record(shared),
        record(shared, { scope: 'project', projectPath: '/work/app' }),
      ],
    };
    const done = planInstallFinish(
      copy({ existing, version: { version: '1.1.0', origin: 'manifest' } }),
    );
    expect(done.orphaned).toEqual([]);
    expect(done.records['formatter@acme']).toHaveLength(2);
  });

  test('a folder outside the cache, such as the directory a plugin loaded in place from, is never marked', () => {
    const existing: InstalledRecords = { 'formatter@acme': [record('/m/plugins/f')] };
    const done = planInstallFinish(copy({ existing }));
    expect(done.orphaned).toEqual([]);
  });
});

describe('records', () => {
  test('another scope, another project and another plugin keep their records', () => {
    const user = record('/p/cache/acme/formatter/0.9.0');
    const project = record('/p/cache/acme/formatter/0.9.0', {
      scope: 'project',
      projectPath: '/work/a',
    });
    const other = record('/p/cache/acme/lint/1.0.0');
    const done = planInstallFinish(
      copy({
        scope: 'project',
        projectPath: '/work/b',
        existing: { 'formatter@acme': [user, project], 'lint@acme': [other] },
      }),
    );
    expect(done.records['formatter@acme']).toHaveLength(3);
    expect(done.records['lint@acme']).toEqual([other]);
    expect(done.orphaned).toEqual([]);
  });

  test('a git-sourced plugin records its commit and a project install its folder', () => {
    const done = planInstallFinish(
      copy({ scope: 'local', projectPath: '/work/a', gitCommitSha: 'a'.repeat(40) }),
    );
    expect(done.record).toMatchObject({
      scope: 'local',
      projectPath: '/work/a',
      gitCommitSha: 'a'.repeat(40),
    });
  });

  test('a version that cannot name a folder plans nothing and leaves the records as they were', () => {
    const existing: InstalledRecords = { 'formatter@acme': [record('/p/x')] };
    const done = planInstallFinish(
      copy({ existing, version: { version: '../x', origin: 'manifest' } }),
    );
    expect(done.records).toBe(existing);
    expect(done.issues).toHaveLength(1);
    expect(done.destination).toBeUndefined();
  });
});
