/**
 * plugins/loading.md § Limits on the dependency install: what the plan refuses and how it runs the
 * package manager (registry packages only, https downloads, no overrides or patches, frozen
 * resolution, no lifecycle scripts, a separate install folder, the 60-second timeout).
 */
import { expect, test } from 'bun:test';
import { nodeDepsRun, planNodeDepsInstall } from '../../src/marketplace/node-deps.ts';
import { readPackageJson } from '../../src/marketplace/node-deps-spec.ts';
import { bunLock, npmLock } from '../support/node-deps-fixtures.ts';
import { input, installed, ROOT, skipped } from '../support/node-deps-plan.ts';
import { spec } from '../support/spec.ts';

const changed = (dependencies: Record<string, string>) =>
  skipped({ packageJson: readPackageJson({ dependencies }) });

const LIMITS = 'install.loading.Limits on the dependency install';

spec(`${LIMITS}.Registry packages only`, () => {
  test('a git, GitHub, folder, workspace or linked dependency gets no install, and each is named', () => {
    const plan = skipped({
      packageJson: readPackageJson({
        dependencies: { a: 'github:acme/a', 'left-pad': '^1.3.0' },
        devDependencies: { b: 'file:../b' },
      }),
    });
    expect(plan.reason).toBe('non-registry-dependency');
    expect(plan.detail).toEqual([
      'a: it is a git or GitHub dependency',
      'b: it is a folder dependency',
    ]);
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
    expect(plan).toMatchObject({ reason: 'non-registry-dependency' });
    expect(plan.detail[0]).toStartWith('x: ');
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

  test('a download link in the lockfile that is not https gets no install', () => {
    expect(skipped({ lockfiles: http })).toMatchObject({
      reason: 'insecure-download',
      detail: ['the download link http://registry.example.com/y/-/y-1.0.0.tgz does not use https'],
    });
  });

  test("an http link at the installing user's own default npm registry is allowed", () => {
    expect(
      installed({ lockfiles: http, defaultRegistry: 'http://registry.example.com' }),
    ).toBeDefined();
    expect(skipped({ lockfiles: http, defaultRegistry: 'http://other.example.com' }).reason).toBe(
      'insecure-download',
    );
  });
});

spec(`${LIMITS}.No overrides or patches`, () => {
  test('npm overrides give no install from an npm lockfile', () => {
    const plan = skipped({
      packageJson: readPackageJson({
        dependencies: { 'left-pad': '^1.3.0' },
        overrides: { x: '1.0.0' },
      }),
    });
    expect(plan.reason).toBe('overrides');
  });

  test('Bun patchedDependencies give no install from bun.lock', () => {
    const plan = skipped({
      lockfiles: { 'bun.lock': bunLock() },
      packageJson: readPackageJson({
        dependencies: { 'left-pad': '^1.3.0' },
        patchedDependencies: { 'left-pad@1.3.0': 'patches/left-pad.patch' },
      }),
    });
    expect(plan.reason).toBe('patched-dependencies');
  });

  test('each applies to its own lockfile only, as the docs word it', () => {
    const overridden = readPackageJson({
      dependencies: { 'left-pad': '^1.3.0' },
      overrides: { x: '1.0.0' },
    });
    expect(
      installed({ packageJson: overridden, lockfiles: { 'bun.lock': bunLock() } }).packageManager,
    ).toBe('bun');
    const patched = readPackageJson({
      dependencies: { 'left-pad': '^1.3.0' },
      patchedDependencies: { 'left-pad@1.3.0': 'p.patch' },
    });
    expect(installed({ packageJson: patched }).packageManager).toBe('npm');
  });

  test('an empty overrides object sets nothing', () => {
    expect(
      installed({
        packageJson: readPackageJson({ dependencies: { 'left-pad': '^1.3.0' }, overrides: {} }),
      }),
    ).toBeDefined();
  });
});

spec(`${LIMITS}.Frozen resolution`, () => {
  test('the install uses exactly the lockfile: npm ci, bun install --frozen-lockfile', () => {
    expect(installed()).toMatchObject({
      frozen: true,
      run: { spec: { form: 'exec', command: 'npm', args: ['ci', '--ignore-scripts'] } },
    });
    expect(installed({ lockfiles: { 'bun.lock': bunLock() } }).run.spec).toEqual({
      form: 'exec',
      command: 'bun',
      args: ['install', '--frozen-lockfile', '--ignore-scripts'],
    });
  });

  test('it is skipped when package.json and the lockfile do not list the same dependencies', () => {
    expect(changed({ 'left-pad': '^1.4.0' })).toMatchObject({
      reason: 'lockfile-mismatch',
      detail: ['dependencies: left-pad'],
    });
    expect(changed({ 'left-pad': '^1.3.0', extra: '1.0.0' }).detail).toEqual([
      'dependencies: extra',
    ]);
    expect(changed({}).detail).toEqual(['dependencies: left-pad']);
  });

  test('a dev dependency added to package.json alone is a mismatch too; one both list is not', () => {
    const dev = {
      dependencies: { 'left-pad': '^1.3.0' },
      devDependencies: { typescript: '5.0.0' },
    };
    expect(skipped({ packageJson: readPackageJson(dev) }).detail).toEqual([
      'devDependencies: typescript',
    ]);
    expect(
      installed({
        packageJson: readPackageJson(dev),
        lockfiles: {
          'package-lock.json': npmLock({ root: { devDependencies: { typescript: '5.0.0' } } }),
        },
      }),
    ).toBeDefined();
  });

  test('bun.lock is compared the same way', () => {
    expect(
      skipped({
        lockfiles: { 'bun.lock': bunLock() },
        packageJson: readPackageJson({ dependencies: { 'left-pad': '^2' } }),
      }).reason,
    ).toBe('lockfile-mismatch');
  });
});

spec(`${LIMITS}.No lifecycle scripts`, () => {
  test('both package managers run with --ignore-scripts', () => {
    expect(installed().run.spec).toMatchObject({
      args: expect.arrayContaining(['--ignore-scripts']),
    });
    expect(installed({ lockfiles: { 'bun.lock': bunLock() } }).run.spec).toMatchObject({
      args: expect.arrayContaining(['--ignore-scripts']),
    });
    expect(installed().ignoreScripts).toBe(true);
  });
});

spec(`${LIMITS}.A separate install folder`, () => {
  test('the package manager runs in a folder of its own that holds only a copy of the dependency list', () => {
    const plan = installed();
    expect(plan.run.cwd).toBe('/tmp/kit-deps-1');
    expect(plan.stage.copy).toEqual([
      { from: `${ROOT}/package.json`, to: '/tmp/kit-deps-1/package.json' },
      { from: `${ROOT}/package-lock.json`, to: '/tmp/kit-deps-1/package-lock.json' },
    ]);
  });

  test('so the plugin’s .npmrc, .env and bunfig.toml are never copied there', () => {
    const copied = installed({ lockfiles: { 'bun.lock': bunLock() } }).stage.copy.map(
      (file) => file.to,
    );
    expect(copied).toEqual(['/tmp/kit-deps-1/package.json', '/tmp/kit-deps-1/bun.lock']);
  });

  test('when the install succeeds the resulting node_modules is moved into the plugin', () => {
    expect(installed().stage.moveBack).toEqual({
      from: '/tmp/kit-deps-1/node_modules',
      to: `${ROOT}/node_modules`,
    });
  });

  test('a folder that is the plugin itself or inside it would read the plugin’s files and is refused', () => {
    for (const installDir of [ROOT, `${ROOT}/.deps`]) {
      const result = planNodeDepsInstall(input({ installDir }));
      expect(result.plan.action).toBe('skip');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'installDir' });
    }
  });
});

spec(`${LIMITS}.60-second timeout`, () => {
  const plan = installed();

  test('the install runs for at most 60 seconds', () => {
    expect(plan.run.timeoutMs).toBe(60_000);
  });

  test('the run handed to CommandRunner carries the plan, the host environment and the abort signal, nothing added', () => {
    const signal = new AbortController().signal;
    const run = nodeDepsRun(plan, { HOME: '/home/u', PATH: '/bin' }, signal);
    expect(run).toEqual({
      spec: plan.run.spec,
      cwd: '/tmp/kit-deps-1',
      env: { HOME: '/home/u', PATH: '/bin' },
      timeoutMs: 60_000,
      mergeStderr: true,
      signal,
    });
  });
});
