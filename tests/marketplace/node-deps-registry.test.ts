/**
 * plugins/loading.md § Limits on the dependency install ("Registry packages only", "`https`
 * downloads"): which dependencies and download links the plan refuses, read from `package.json` and
 * from an npm lockfile and a `bun.lock`.
 */
import { describe, expect, test } from 'bun:test';
import { readPackageJson } from '../../src/marketplace/node-deps-spec.ts';
import { bunLock, npmLock, REGISTRY_TARBALL } from '../support/node-deps-fixtures.ts';
import { installed, skipped } from '../support/node-deps-plan.ts';
import { spec } from '../support/spec.ts';

const changed = (dependencies: Record<string, string>) =>
  skipped({ packageJson: readPackageJson({ dependencies }) });

const LIMITS = 'install.loading.Limits on the dependency install';

const pinned = (version?: string) => ({
  'package-lock.json': npmLock({
    packages: { 'node_modules/left-pad': { version, resolved: REGISTRY_TARBALL } },
  }),
});

spec(`${LIMITS}.Registry packages only`, () => {
  test('a git, GitHub, folder, workspace or linked dependency gets no install, and each is named', () => {
    const plan = skipped({
      packageJson: readPackageJson({
        dependencies: { a: 'github:acme/a', 'left-pad': '^1.3.0' },
        devDependencies: { b: 'file:../b' },
      }),
    });
    expect(plan).toMatchObject({
      reason: 'non-registry-dependency',
      dependencies: ['a: it is a git or GitHub dependency', 'b: it is a folder dependency'],
    });
  });

  test('a workspace, linked or git+https dependency of package.json gets no install, each named with its reason', () => {
    for (const [specifier, reason] of [
      ['workspace:*', 'it is a workspace dependency'],
      ['link:../w', 'it is a linked dependency'],
      ['git+https://example.com/w.git', 'it is a git or GitHub dependency'],
    ] as const) {
      expect(changed({ w: specifier, 'left-pad': '^1.3.0' })).toMatchObject({
        reason: 'non-registry-dependency',
        dependencies: [`w: ${reason}`],
      });
    }
  });

  test('an npm lockfile entry that is a link or a workspace package gets no install', () => {
    const plan = skipped({
      lockfiles: {
        'package-lock.json': npmLock({
          packages: { 'node_modules/w': { resolved: 'packages/w', link: true } },
        }),
      },
    });
    expect(plan).toMatchObject({
      reason: 'non-registry-dependency',
      dependencies: ['w: it is a linked dependency'],
    });
  });

  test('every package must be pinned in the lockfile to an exact version: a range, a tag or none gets no install', () => {
    expect(skipped({ lockfiles: pinned('^1.3.0') })).toMatchObject({
      reason: 'unpinned-dependency',
      packages: ['left-pad@^1.3.0'],
    });
    expect(skipped({ lockfiles: pinned() })).toMatchObject({
      reason: 'unpinned-dependency',
      packages: ['left-pad'],
    });
    expect(installed({ lockfiles: pinned('1.3.0-rc.1') })).toMatchObject({ action: 'install' });
  });

  test('bun.lock is held to the same rule: an id whose specifier is not an exact version gets no install', () => {
    const plan = skipped({
      lockfiles: { 'bun.lock': bunLock({ packages: '\n    "r": ["r@^2.0.0", {}],' }) },
    });
    expect(plan).toMatchObject({ reason: 'unpinned-dependency', packages: ['r@^2.0.0'] });
  });

  test('a lockfile that pins a package to a link or a git origin gets no install either', () => {
    const plan = skipped({
      lockfiles: {
        'package-lock.json': npmLock({
          packages: {
            'node_modules/x': {
              version: '1.0.0',
              resolved: 'git+ssh://git@github.com/a/x.git#abc',
            },
          },
        }),
      },
    });
    expect(plan).toMatchObject({
      reason: 'non-registry-dependency',
      dependencies: [expect.stringMatching(/^x: /)],
    });
  });

  test('a workspace entry of bun.lock gets no install', () => {
    const plan = skipped({
      lockfiles: { 'bun.lock': bunLock({ packages: '\n    "w": ["w@workspace:packages/w"],' }) },
    });
    expect(plan.reason).toBe('non-registry-dependency');
  });
});

spec(`${LIMITS}.https downloads`, () => {
  const http = {
    'package-lock.json': npmLock({
      packages: {
        'node_modules/y': {
          version: '1.0.0',
          resolved: 'http://registry.example.com/y/-/y-1.0.0.tgz',
        },
      },
    }),
  };

  const LINK = 'http://registry.example.com/y/-/y-1.0.0.tgz';

  test('a download link in the lockfile that is not https gets no install', () => {
    expect(skipped({ lockfiles: http })).toMatchObject({
      reason: 'insecure-download',
      links: [LINK],
    });
  });

  test('a link with another scheme, or with none, is not https either', () => {
    for (const resolved of [
      'ftp://example.com/y/-/y-1.0.0.tgz',
      'registry.example.com:4873/y/-/y-1.0.0.tgz',
    ]) {
      const lockfiles = {
        'package-lock.json': npmLock({
          packages: { 'node_modules/y': { version: '1.0.0', resolved } },
        }),
      };
      expect(skipped({ lockfiles })).toMatchObject({
        reason: 'insecure-download',
        links: [resolved],
      });
    }
  });

  test("an http link at the installing user's own default npm registry is allowed", () => {
    expect(
      installed({ lockfiles: http, defaultRegistry: 'http://registry.example.com' }),
    ).toMatchObject({ action: 'install', lockfile: 'package-lock.json' });
    expect(skipped({ lockfiles: http, defaultRegistry: 'http://other.example.com' }).reason).toBe(
      'insecure-download',
    );
  });

  test('a bun.lock registry URL over http gets no install, unless it is the default registry', () => {
    const lockfiles = {
      'bun.lock': bunLock({
        packages: '\n    "r": ["r@2.0.0", "http://registry.example.com/", {}, "sha512-x"],',
      }),
    };
    expect(skipped({ lockfiles })).toMatchObject({
      reason: 'insecure-download',
      links: ['http://registry.example.com/'],
    });
    expect(installed({ lockfiles, defaultRegistry: 'http://registry.example.com' })).toMatchObject({
      action: 'install',
      lockfile: 'bun.lock',
    });
  });
});

describe('judgments: the registry-only rule', () => {
  test('a tarball link in package.json or as a bun.lock id is no registry package, whatever its scheme', () => {
    expect(changed({ a: 'https://example.com/a-1.0.0.tgz', 'left-pad': '^1.3.0' })).toMatchObject({
      dependencies: ['a: it is a tarball link, not a registry package'],
    });
    const plan = skipped({
      lockfiles: {
        'bun.lock': bunLock({ packages: '\n    "x": ["x@https://example.com/x.tgz", {}],' }),
      },
    });
    expect(plan).toMatchObject({
      reason: 'non-registry-dependency',
      dependencies: ['x: it is a tarball link, not a registry package'],
    });
  });
});
