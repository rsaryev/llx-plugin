/**
 * plugins/loading.md § When the dependency install runs, § In-place and copied plugins;
 * plugins/marketplace-reference.md § Copy mode and link mode ("Include node_modules"), § npm plugin
 * source. The plan is pure: it decides whether the install runs and what the host runs through
 * `CommandRunner`; nothing is read or written here.
 */
import { expect, test } from 'bun:test';
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import { decideInstallMode, type InstallOrigin } from '../../src/marketplace/install-mode.ts';
import { DEPS_ORIGIN_OF_MODE } from '../../src/marketplace/node-deps-types.ts';
import { bunLock, npmLock } from '../support/node-deps-fixtures.ts';
import { installed, planned, ROOT, skipped } from '../support/node-deps-plan.ts';
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
        detail: [name],
      });
    }
  });

  test('a lockfile format Claude Code does not read is skipped: npm needs lockfileVersion 2 or 3, bun.lock no higher than 2', () => {
    for (const version of [1, 4]) {
      expect(skipped({ lockfiles: { 'package-lock.json': npmLock({ version }) } })).toMatchObject({
        reason: 'lockfile-format',
        detail: ['package-lock.json', String(version)],
      });
    }
    expect(
      installed({ lockfiles: { 'package-lock.json': npmLock({ version: 2 }) } }),
    ).toBeDefined();
    expect(installed({ lockfiles: { 'bun.lock': bunLock({ version: 2 }) } })).toBeDefined();
    expect(skipped({ lockfiles: { 'bun.lock': bunLock({ version: 3 }) } }).reason).toBe(
      'lockfile-format',
    );
    expect(skipped({ lockfiles: { 'package-lock.json': 'not json' } }).reason).toBe(
      'lockfile-format',
    );
  });

  test("the matched lockfile's package manager is run from the PATH; if it is missing the other is not tried", () => {
    expect(
      skipped({
        lockfiles: { 'bun.lock': bunLock(), 'package-lock.json': npmLock() },
        available: ['npm'],
      }),
    ).toMatchObject({ reason: 'package-manager-missing', detail: ['bun'] });
    expect(skipped({ available: [] })).toMatchObject({
      reason: 'package-manager-missing',
      detail: ['npm'],
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

spec('marketplace.rule.Copy mode and link mode.Include node_modules', () => {
  test('Claude Code skips the Node.js package dependency install for a link-mode plugin', () => {
    expect(skipped({ origin: 'linked' })).toMatchObject({ reason: 'link-mode' });
  });
});

// marketplace-reference.md: "If the package has a supported lockfile beside its package.json, Claude
// Code installs those Node.js package dependencies in a separate step, also with scripts disabled."
spec('marketplace.rule.npm plugin source', () => {
  test('an npm-source plugin with npm-shrinkwrap.json gets the dependency install as a separate step with scripts disabled', () => {
    const plan = installed({ lockfiles: { 'npm-shrinkwrap.json': npmLock() } });
    expect(plan.run.spec).toMatchObject({ args: ['ci', '--ignore-scripts'] });
    expect(plan.stage.moveBack.to).toBe(`${ROOT}/node_modules`);
  });
});
