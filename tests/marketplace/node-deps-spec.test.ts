/**
 * plugins/loading.md § Limits on the dependency install ("Registry packages only", "`https`
 * downloads"); plugins/marketplace-reference.md § npm plugin source. One registry-only rule serves
 * the `package` value of an npm source and the dependencies of a plugin's `package.json`.
 */
import { describe, expect, test } from 'bun:test';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import {
  classifySpecifier,
  dependencyRefusal,
  downloadLinkRefusal,
  isRegistryId,
  isRegistryOrigin,
  readPackageJson,
  specifierRefusals,
} from '../../src/marketplace/node-deps-spec.ts';
import { spec } from '../support/spec.ts';

const LIMITS = 'install.loading.Limits on the dependency install';
const NPM = 'marketplace.rule.npm plugin source';

const refusals = (dependencies: Record<string, string>) =>
  specifierRefusals({ dependencies }).map((entry) => entry.name);

spec(`${LIMITS}.Registry packages only`, () => {
  test('a git, GitHub, folder, workspace or linked dependency is not a registry package', () => {
    expect(
      refusals({
        a: 'git+https://example.com/a.git',
        b: 'github:acme/b',
        c: 'acme/c',
        d: 'file:../d',
        e: 'workspace:*',
        f: 'link:../f',
        g: 'git@example.com:acme/g.git',
        h: 'https://example.com/h.git',
      }),
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  test('a version, a range, a dist-tag and an npm: alias are registry packages', () => {
    expect(
      refusals({
        a: '1.2.3',
        b: '^2.0.0',
        c: '>=1.0.0 <2.0.0 || 3.x',
        d: 'latest',
        e: '~1.2',
        f: '*',
        g: 'npm:left-pad@1.3.0',
        h: '1.0.0 - 2.0.0',
      }),
    ).toEqual([]);
  });

  test('every dependency section is checked, and each refusal names the package and the reason', () => {
    const refused = specifierRefusals({
      dependencies: { a: '1.0.0' },
      devDependencies: { b: 'file:../b' },
      optionalDependencies: { c: 'github:acme/c' },
      peerDependencies: { d: 'workspace:^' },
    });
    expect(refused.map((entry) => [entry.section, entry.name])).toEqual([
      ['devDependencies', 'b'],
      ['optionalDependencies', 'c'],
      ['peerDependencies', 'd'],
    ]);
    expect(refused[0]?.reason).toBe('it is a folder dependency');
    expect(dependencyRefusal('github:acme/c')).toBe('it is a git or GitHub dependency');
  });

  test('the classifier names the kind of each specifier', () => {
    expect(classifySpecifier('1.2.3')).toBe('registry');
    expect(classifySpecifier('github:acme/x')).toBe('git-scheme');
    expect(classifySpecifier('acme/x#main')).toBe('git-address');
    expect(classifySpecifier('workspace:*')).toBe('workspace');
    expect(classifySpecifier('link:../x')).toBe('linked');
    expect(classifySpecifier('./x')).toBe('folder');
    expect(classifySpecifier('https://github.com/acme/x/archive/v1.tar.gz')).toBe('tarball-host');
    expect(classifySpecifier('http://example.com/x.tgz')).toBe('tarball-http');
  });

  test('a package.json section that is not an object of strings lists nothing', () => {
    expect(readPackageJson({ dependencies: ['a'], devDependencies: { a: 1, b: '2.0.0' } })).toEqual(
      { devDependencies: { b: '2.0.0' } },
    );
    expect(readPackageJson({ name: 'x' })).toEqual({});
  });
});

spec(`${LIMITS}.https downloads`, () => {
  const own = 'http://registry.internal:4873';

  test('a download link must use https', () => {
    expect(downloadLinkRefusal('https://registry.npmjs.org/a/-/a-1.0.0.tgz', undefined)).toBe(
      undefined,
    );
    expect(downloadLinkRefusal('http://registry.npmjs.org/a/-/a-1.0.0.tgz', undefined)).toContain(
      'https',
    );
  });

  test('a link with another scheme, or with none, does not use https either', () => {
    for (const link of ['ftp://registry.npmjs.org/a.tgz', 'registry.npmjs.org:443/a.tgz']) {
      expect(downloadLinkRefusal(link, undefined)).toBe(
        `the download link ${link} does not use https`,
      );
    }
  });

  test("an http link is allowed only when it points at the installing user's own default npm registry", () => {
    expect(downloadLinkRefusal(`${own}/a/-/a-1.0.0.tgz`, own)).toBe(undefined);
    expect(downloadLinkRefusal(`${own}/a/-/a-1.0.0.tgz`, `${own}/`)).toBe(undefined);
    expect(downloadLinkRefusal('http://registry.internal:4874/a.tgz', own)).toContain('https');
    expect(downloadLinkRefusal('http://registry.internal:48730/a.tgz', own)).toContain('https');
  });
});

describe('judgments: the package.json specifier rules', () => {
  test('a tarball link is no registry package either: the registry is the only source', () => {
    expect(
      refusals({ a: 'https://example.com/a-1.0.0.tgz', b: 'http://example.com/b.tgz' }),
    ).toEqual(['a', 'b']);
  });

  test('a lockfile resolved link is a registry download when it is a link, a bun id with a link is a tarball dependency', () => {
    expect(isRegistryOrigin('https://registry.npmjs.org/a/-/a-1.0.0.tgz')).toBe(true);
    expect(isRegistryOrigin('http://registry.internal/a-1.0.0.tgz')).toBe(true);
    expect(isRegistryOrigin('git+ssh://git@github.com/a/a.git#abc')).toBe(false);
    expect(isRegistryId('1.0.0')).toBe(true);
    expect(isRegistryId('npm:b@1.0.0')).toBe(true);
    expect(isRegistryId('https://example.com/a.tgz')).toBe(false);
    expect(isRegistryId('workspace:packages/a')).toBe(false);
  });

  test('a package.json that is not a JSON object is unreadable, not an empty list', () => {
    expect(readPackageJson([])).toBe('unreadable');
    expect(readPackageJson(null)).toBe('unreadable');
    expect(readPackageJson({})).toEqual({});
  });

  test('an npm: alias is a registry package for a dependency (the docs refuse it only as an npm source value)', () => {
    expect(dependencyRefusal('npm:other@^1')).toBeUndefined();
    expect(
      planPluginFetch({ kind: 'npm', package: 'npm:other@1' }, { platform: 'posix' }).plan,
    ).toBeUndefined();
  });
});

const posix = { platform: 'posix' } as const;
const fetched = (pkg: string, rest: { version?: string; registry?: string } = {}, own?: string) =>
  planPluginFetch(
    { kind: 'npm', package: pkg, ...rest },
    own === undefined ? posix : { ...posix, defaultNpmRegistry: own },
  );

spec(`${NPM}.package`, () => {
  test('a registry package name, a name with a version appended, or an https tarball link', () => {
    expect(fetched('@your-org/formatter').plan).toMatchObject({
      spec: { package: '@your-org/formatter' },
    });
    expect(fetched('@your-org/formatter@2.0.0').plan).toMatchObject({
      spec: { package: '@your-org/formatter', version: '2.0.0' },
    });
    expect(
      fetched('https://registry.npmjs.org/formatter/-/formatter-2.0.0.tgz').plan,
    ).toMatchObject({
      spec: { tarballUrl: 'https://registry.npmjs.org/formatter/-/formatter-2.0.0.tgz' },
    });
  });

  test('a git address, a folder or file: path and an npm: alias are refused before anything is fetched, with the value and the reason', () => {
    for (const value of [
      'github:acme/formatter',
      'git+https://example.com/a.git',
      'acme/formatter',
      './formatter',
      'file:../formatter',
      'npm:other@1',
    ]) {
      const result = fetched(value);
      expect(result.plan).toBeUndefined();
      expect(result.issues[0]?.message).toStartWith(`"${value}" was not installed: it is `);
    }
  });

  test('a tarball link on github.com, gist.github.com, gitlab.com, bitbucket.org or git.sr.ht is refused, even a GitHub release download', () => {
    for (const link of [
      'https://github.com/acme/formatter/releases/download/v1/formatter-1.tgz',
      'https://gist.github.com/acme/abc/archive/main.tar.gz',
      'https://gitlab.com/acme/formatter/-/archive/main/formatter-main.tar.gz',
      'https://bitbucket.org/acme/formatter/get/main.tar.gz',
      'https://git.sr.ht/~acme/formatter/archive/main.tar.gz',
    ]) {
      expect(fetched(link).plan).toBeUndefined();
    }
  });

  test('a GitLab npm registry link under gitlab.com/api/v4/ is the one tarball link of those hosts that is allowed', () => {
    const link =
      'https://gitlab.com/api/v4/projects/1/packages/npm/formatter/-/formatter-1.0.0.tgz';
    expect(fetched(link).plan).toMatchObject({ spec: { tarballUrl: link } });
  });

  test('the package.json dependencies are not installed during the fetch and no install script runs', () => {
    expect(fetched('formatter').plan).toMatchObject({
      installDependencies: false,
      runInstallScripts: false,
    });
  });
});

spec(`${NPM}.A tarball link over http`, () => {
  const own = 'http://npm.internal:4873';

  test('is refused unless it points at the installing user’s own default npm registry', () => {
    const link = `${own}/formatter/-/formatter-1.0.0.tgz`;
    expect(fetched('http://example.com/formatter-1.0.0.tgz', {}, own).plan).toBeUndefined();
    expect(fetched(link, {}, undefined).plan).toBeUndefined();
    expect(fetched(link, {}, own).plan).toMatchObject({ spec: { tarballUrl: link } });
  });

  test('the refusal names the value and says it is over http', () => {
    const [issue] = fetched('http://example.com/f.tgz').issues;
    expect(issue?.message).toContain('"http://example.com/f.tgz" was not installed');
    expect(issue?.message).toContain('over http');
  });
});

spec(`${NPM}.registry`, () => {
  test('a registry URL for a package that is not on the default registry', () => {
    expect(
      fetched('@your-org/formatter', { registry: 'https://npm.example.com' }).plan,
    ).toMatchObject({ registry: 'https://npm.example.com' });
  });

  test('the registry must use https unless it is the installing user’s own default; any other http registry fails before npm contacts it', () => {
    const own = 'http://npm.internal:4873';
    expect(fetched('f', { registry: 'http://npm.example.com' }, own).plan).toBeUndefined();
    expect(fetched('f', { registry: own }, own).plan).toMatchObject({ registry: own });
    expect(fetched('f', { registry: `${own}/` }, own).plan).toBeDefined();
    expect(fetched('f', { registry: 'http://npm.internal:4873' }).plan).toBeUndefined();
  });
});

spec(`${NPM}.version`, () => {
  test('a version, a semver range or a dist-tag is used when package has no version appended', () => {
    for (const version of ['2.0.0', '^2.0.0', 'beta']) {
      expect(fetched('formatter', { version }).plan).toMatchObject({
        spec: { package: 'formatter', version },
      });
    }
  });

  test('omitting it fetches latest, and a version appended to the package name wins', () => {
    expect(fetched('formatter').plan).toMatchObject({ spec: { version: 'latest' } });
    expect(fetched('formatter@1.0.0', { version: '^9' }).plan).toMatchObject({
      spec: { version: '1.0.0' },
    });
  });
});

spec(NPM, () => {
  test('the package is fetched with scripts off and its dependencies left for a separate step', () => {
    expect(
      fetched('@your-org/formatter', { version: '^2.0.0', registry: 'https://npm.example.com' })
        .plan,
    ).toEqual({
      kind: 'npm',
      spec: { package: '@your-org/formatter', version: '^2.0.0' },
      registry: 'https://npm.example.com',
      runInstallScripts: false,
      installDependencies: false,
    });
  });
});
