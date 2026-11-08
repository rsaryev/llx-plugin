/**
 * plugins/loading.md § When the dependency install runs, § In-place and copied plugins;
 * plugins/marketplace-reference.md § Copy mode and link mode ("Include node_modules"), § npm plugin
 * source. The plan is pure: it decides whether the install runs and what the host runs through
 * `CommandRunner`; nothing is read or written here.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { decideInstallMode, type InstallOrigin } from '../../src/marketplace/install-mode.ts';
import { nodeDepsNote } from '../../src/marketplace/node-deps-failure.ts';
import { LOCKFILE_NAMES } from '../../src/marketplace/node-deps-lockfile.ts';
import { readPackageJson } from '../../src/marketplace/node-deps-spec.ts';
import {
  DEPS_ORIGIN_OF_MODE,
  UNSUPPORTED_LOCKFILES,
} from '../../src/marketplace/node-deps-types.ts';
import { bunLock, npmLock } from '../support/node-deps-fixtures.ts';
import { PACKAGE, planned, installed, ROOT, skipped } from '../support/node-deps-plan.ts';
import { spec } from '../support/spec.ts';

const RUNS = 'install.loading.When the dependency install runs';

spec(RUNS, () => {
  test('a copied plugin with a package.json and a supported lockfile gets the install', () => {
    expect(installed()).toMatchObject({ action: 'install', packageManager: 'npm' });
  });

  test('it runs only when the plugin root has both a package.json and a supported lockfile', () => {
    expect(skipped({ packageJson: undefined }).reason).toBe('no-package-json');
    expect(skipped({ lockfiles: {} }).reason).toBe('no-lockfile');
  });

  test('bun.lock runs Bun; npm-shrinkwrap.json and package-lock.json run npm', () => {
    expect(installed({ lockfiles: { 'bun.lock': bunLock() } })).toMatchObject({
      packageManager: 'bun',
      lockfile: 'bun.lock',
    });
    expect(installed({ lockfiles: { 'npm-shrinkwrap.json': npmLock() } })).toMatchObject({
      packageManager: 'npm',
      lockfile: 'npm-shrinkwrap.json',
    });
  });

  test('with more than one lockfile the first match wins: bun.lock, npm-shrinkwrap.json, package-lock.json', () => {
    const all = {
      'package-lock.json': npmLock(),
      'npm-shrinkwrap.json': npmLock(),
      'bun.lock': bunLock(),
    };
    expect(installed({ lockfiles: all }).lockfile).toBe('bun.lock');
    const { 'bun.lock': _bun, ...npmOnly } = all;
    expect(installed({ lockfiles: npmOnly }).lockfile).toBe('npm-shrinkwrap.json');
  });

  test('bun.lockb, yarn.lock and pnpm-lock.yaml are skipped, each named', () => {
    for (const name of ['bun.lockb', 'yarn.lock', 'pnpm-lock.yaml'] as const) {
      expect(skipped({ lockfiles: {}, otherLockfiles: [name] })).toMatchObject({
        reason: 'unsupported-lockfile',
        lockfiles: [name],
      });
    }
  });

  test('a lockfile format Claude Code does not read is skipped: npm needs lockfileVersion 2 or 3, bun.lock no higher than 2', () => {
    for (const version of [1, 4]) {
      expect(skipped({ lockfiles: { 'package-lock.json': npmLock({ version }) } })).toMatchObject({
        reason: 'lockfile-format',
        lockfile: 'package-lock.json',
        version,
      });
    }
    expect(
      installed({ lockfiles: { 'package-lock.json': npmLock({ version: 2 }) } }),
    ).toMatchObject({
      lockfile: 'package-lock.json',
      packageManager: 'npm',
    });
    expect(installed({ lockfiles: { 'bun.lock': bunLock({ version: 2 }) } })).toMatchObject({
      lockfile: 'bun.lock',
      packageManager: 'bun',
    });
    expect(skipped({ lockfiles: { 'bun.lock': bunLock({ version: 3 }) } }).reason).toBe(
      'lockfile-format',
    );
    expect(skipped({ lockfiles: { 'package-lock.json': 'not json' } })).toMatchObject({
      reason: 'lockfile-format',
      lockfile: 'package-lock.json',
      version: undefined,
    });
  });

  test("the matched lockfile's package manager is run from the PATH; if it is missing the other is not tried", () => {
    expect(
      skipped({
        lockfiles: { 'bun.lock': bunLock(), 'package-lock.json': npmLock() },
        available: ['npm'],
      }),
    ).toMatchObject({ reason: 'package-manager-missing', manager: 'bun' });
    expect(skipped({ available: [] })).toMatchObject({
      reason: 'package-manager-missing',
      manager: 'npm',
    });
  });

  test('a plugin loaded in place gets no install into its source directory; its dependencies resolve against that directory', () => {
    for (const origin of ['in-place', 'inline'] as const) {
      expect(skipped({ origin })).toMatchObject({
        reason: 'loaded-in-place',
        resolvesFrom: ROOT,
      });
    }
  });

  test('the origins agree with the install mode: only a copy installs', () => {
    const relative: PluginSource = { kind: 'relative', path: './formatter', bare: false };
    const origins: InstallOrigin[] = [
      { kind: 'marketplace', marketplace: 'directory', source: relative },
      { kind: 'marketplace', marketplace: 'github', source: relative },
      { kind: 'session-directory' },
      {
        kind: 'marketplace',
        marketplace: 'github',
        source: { kind: 'command', command: 'tool', timeoutSeconds: 60, mode: 'link' },
      },
    ];
    for (const origin of origins) {
      const decided = decideInstallMode({ origin, platform: 'posix' });
      if ('severity' in decided) throw new Error(decided.message);
      expect(planned({ origin: DEPS_ORIGIN_OF_MODE[decided.mode] }).action === 'install').toBe(
        decided.dependencyInstall,
      );
    }
  });

  test('judgment: a supported lockfile beside an unsupported one is the one that counts', () => {
    expect(installed({ otherLockfiles: ['yarn.lock'] }).lockfile).toBe('package-lock.json');
  });
});

// marketplace-reference.md: "Claude Code skips the Node.js package dependency install for a link-mode
// plugin, so print a directory that already contains the packages the plugin needs."
spec('marketplace.rule.Copy mode and link mode.Include node_modules', () => {
  test('Claude Code skips the Node.js package dependency install for a link-mode plugin, so the directory it links to has to contain the packages already', () => {
    expect(skipped({ origin: 'linked' })).toEqual({ action: 'skip', reason: 'link-mode' });
    const note = nodeDepsNote(
      { enabled: true, hasLockfile: true, packageJson: PACKAGE, hasNodeModules: false },
      planned({ origin: 'linked' }),
      'formatter@my-marketplace',
    );
    expect(note?.text).toBe(
      'The packages it lists were not installed, because a link-mode plugin gets no install; the directory it links to has to contain the packages in node_modules already.',
    );
  });

  test('a link-mode plugin gets no install whatever its lockfile holds', () => {
    expect(skipped({ origin: 'linked', lockfiles: { 'bun.lock': bunLock() } }).reason).toBe(
      'link-mode',
    );
  });
});

// marketplace-reference.md: "Claude Code fetches the package with your npm client. The package's install
// scripts ... never run, and its dependencies aren't installed during the fetch. If the package has a
// supported lockfile beside its package.json, Claude Code installs those Node.js package dependencies in
// a separate step, also with scripts disabled."
spec('marketplace.rule.npm plugin source', () => {
  test('an npm-source fetch installs no dependencies; its npm-shrinkwrap.json then gets a separate install step with scripts disabled', () => {
    const fetched = planPluginFetch(
      { kind: 'npm', package: '@your-org/formatter' },
      { platform: 'posix' },
    ).plan;
    expect(fetched).toMatchObject({ installDependencies: false, runInstallScripts: false });

    const plan = installed({ lockfiles: { 'npm-shrinkwrap.json': npmLock() } });
    expect(plan).toMatchObject({
      lockfile: 'npm-shrinkwrap.json',
      packageManager: 'npm',
      ignoreScripts: true,
    });
    expect(plan.run.spec).toEqual({
      form: 'exec',
      command: 'npm',
      args: ['ci', '--ignore-scripts'],
    });
    expect(plan.run.cwd).not.toBe(ROOT);
  });
});

describe('judgments: the dependency install plan', () => {
  // loading.md lists three triggers (an install, an update to a new version, a session start for an
  // uncached enabled plugin); they are the host's moments, not data of the plan.
  test('the host decides when to plan: the plan depends on the facts alone, never on what triggered it', () => {
    expect(planned()).toEqual(planned());
    expect(planned({ origin: 'in-place' })).toEqual(planned({ origin: 'in-place' }));
  });

  test('a package.json that is there but not a JSON object is its own reason, not a missing file', () => {
    expect(skipped({ packageJson: readPackageJson([]) })).toEqual({
      action: 'skip',
      reason: 'package-json-unreadable',
    });
    expect(skipped({ packageJson: undefined }).reason).toBe('no-package-json');
  });

  test('the lockfile names are exported in the order Claude Code checks them, with the unsupported ones', () => {
    expect(LOCKFILE_NAMES).toEqual(['bun.lock', 'npm-shrinkwrap.json', 'package-lock.json']);
    expect(UNSUPPORTED_LOCKFILES).toEqual(['bun.lockb', 'yarn.lock', 'pnpm-lock.yaml']);
  });
});
