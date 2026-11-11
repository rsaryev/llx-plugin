/**
 * marketplace-reference.md § npm plugin source, § archive plugin source, § command plugin source
 * (Shell and working directory, Copy mode and link mode); host-marketplace.md § Stay within the
 * download limits for hosted files.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import type { FetchPlanContext } from '../../src/marketplace/types.ts';
import { spec } from '../support/spec.ts';

const posix: FetchPlanContext = { platform: 'posix' };
const plan = (source: PluginSource, context: FetchPlanContext = posix) =>
  planPluginFetch(source, context);
const npm = (pkg: string, rest: { version?: string; registry?: string } = {}): PluginSource => ({
  kind: 'npm',
  package: pkg,
  ...rest,
});
const archiveSource = (url: string, sha256?: string): PluginSource => ({
  kind: 'archive',
  url,
  ...(sha256 === undefined ? {} : { sha256 }),
});

const commandSource = (
  rest: { mode?: 'copy' | 'link'; timeoutSeconds?: number } = {},
): PluginSource => ({
  kind: 'command',
  command: 'my-tool claude-plugin-path',
  timeoutSeconds: rest.timeoutSeconds ?? 60,
  mode: rest.mode ?? 'copy',
});

const refusals = (source: PluginSource, context: FetchPlanContext = posix) => {
  const result = plan(source, context);
  expect(result.plan).toBeUndefined();
  return result.issues;
};

spec(['marketplace.source.npm', 'marketplace.create.Choose a plugin source.npm'], () => {
  test('a package name with a version, a range or a dist-tag; install scripts and dependencies are off', () => {
    expect(
      plan(npm('@your-org/formatter', { version: '^2.0.0', registry: 'https://npm.example.com' })),
    ).toEqual({
      plan: {
        kind: 'npm',
        spec: { package: '@your-org/formatter', version: '^2.0.0' },
        registry: 'https://npm.example.com',
        runInstallScripts: false,
        installDependencies: false,
      },
      issues: [],
    });
    expect(plan(npm('formatter', { version: 'beta' })).plan).toMatchObject({
      spec: { package: 'formatter', version: 'beta' },
    });
  });

  test('omitting the version fetches latest', () => {
    expect(plan(npm('@your-org/formatter')).plan).toMatchObject({
      spec: { package: '@your-org/formatter', version: 'latest' },
    });
  });

  test('a version appended to the package name is used, and `version` only applies without one', () => {
    expect(plan(npm('@your-org/formatter@2.0.0')).plan).toMatchObject({
      spec: { package: '@your-org/formatter', version: '2.0.0' },
    });
    expect(plan(npm('formatter@1.2.3', { version: '^9' })).plan).toMatchObject({
      spec: { package: 'formatter', version: '1.2.3' },
    });
  });

  test('an https link to the tarball is planned as a tarball', () => {
    expect(plan(npm('https://registry.example.com/f/-/f-2.0.0.tgz')).plan).toMatchObject({
      kind: 'npm',
      spec: { tarballUrl: 'https://registry.example.com/f/-/f-2.0.0.tgz' },
      runInstallScripts: false,
      installDependencies: false,
    });
  });

  test('a git address, a folder or file: path and an npm: alias are refused, naming the value and the reason', () => {
    const values = [
      ['git+https://github.com/o/r.git', 'not an http or https link'],
      ['git@github.com:o/r.git', 'not an http or https link'],
      ['github:o/r', 'not an http or https link'],
      ['o/r', 'git address'],
      ['https://github.com/o/r.git', 'git address'],
      ['./local-dir', 'folder or file: path'],
      ['../up', 'folder or file: path'],
      ['/abs/dir', 'folder or file: path'],
      ['file:../pkg', 'folder or file: path'],
      ['npm:real-name@1', 'npm: alias'],
      ['alias@npm:real-name', 'npm: alias'],
    ] as const;
    for (const [value, reason] of values) {
      const issues = refusals(npm(value));
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe('error');
      expect(issues[0]?.path).toBe('source.package');
      expect(issues[0]?.message).toContain(`"${value}"`);
      expect(issues[0]?.message).toContain(reason);
    }
  });

  test('a tarball link on github.com, gist.github.com, gitlab.com, bitbucket.org or git.sr.ht is refused, even a GitHub release download', () => {
    for (const link of [
      'https://github.com/o/r/releases/download/v1/pkg-1.tgz',
      'https://gist.github.com/u/abc/raw/pkg.tgz',
      'https://gitlab.com/o/r/-/archive/main/r.tgz',
      'https://bitbucket.org/o/r/get/main.tgz',
      'https://git.sr.ht/~u/r/archive/main.tar.gz',
    ]) {
      const issues = refusals(npm(link));
      expect(issues[0]?.message).toContain(`"${link}"`);
      expect(issues[0]?.message).toContain('tarball link');
    }
  });

  test('a GitLab npm registry link under gitlab.com/api/v4/ is the exception', () => {
    const link = 'https://gitlab.com/api/v4/projects/1/packages/npm/f/-/f-1.0.0.tgz';
    expect(plan(npm(link)).plan).toMatchObject({ spec: { tarballUrl: link } });
  });

  test("a tarball link over http is refused unless it points at the installing user's own default registry", () => {
    const link = 'http://npm.internal/f/-/f-1.0.0.tgz';
    expect(refusals(npm(link))[0]?.message).toContain('http');
    expect(
      refusals(npm(link), { platform: 'posix', defaultNpmRegistry: 'https://other.example.com' }),
    ).toHaveLength(1);
    expect(
      plan(npm(link), { platform: 'posix', defaultNpmRegistry: 'http://npm.internal' }).plan,
    ).toMatchObject({ spec: { tarballUrl: link } });
    expect(
      plan(npm(link), { platform: 'posix', defaultNpmRegistry: 'http://npm.internal/' }).plan?.kind,
    ).toBe('npm');
  });

  test('a link on the default registry host but outside its path prefix is refused', () => {
    const context: FetchPlanContext = {
      platform: 'posix',
      defaultNpmRegistry: 'http://npm.internal/a',
    };
    expect(plan(npm('http://npm.internal/a/f/-/f-1.0.0.tgz'), context).plan?.kind).toBe('npm');
    for (const link of ['http://npm.internal/b/f.tgz', 'http://npm.internal/ab/f.tgz']) {
      const issues = refusals(npm(link), context);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toContain('default npm registry');
    }
  });

  test("the registry must use https unless it is the installing user's own default registry", () => {
    const insecure = npm('f', { registry: 'http://npm.internal' });
    const issues = refusals(insecure);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', path: 'source.registry' });
    expect(plan(npm('f', { registry: 'https://npm.internal' })).plan?.kind).toBe('npm');
    expect(
      plan(insecure, { platform: 'posix', defaultNpmRegistry: 'http://npm.internal' }).plan,
    ).toMatchObject({ registry: 'http://npm.internal' });
  });

  test('an ordinary package name, scoped or not, passes the checks', () => {
    for (const name of ['formatter', '@your-org/formatter', 'formatter.js', 'a-b_c']) {
      expect(plan(npm(name)).issues).toEqual([]);
    }
  });
});

spec('marketplace.source.archive', () => {
  const DIGEST = '6BFA50E3D2E00C052B46ABE51FFF89346AC803E45771F76DCF6DF1AB74CCA5E1';
  test('plans the download with the documented limits, the root at the top or one directory down', () => {
    expect(plan(archiveSource('https://artifacts.example.com/formatter-2.0.0.zip')).plan).toEqual({
      kind: 'archive',
      url: 'https://artifacts.example.com/formatter-2.0.0.zip',
      limits: {
        maxDownloadBytes: 256 * 1024 * 1024,
        timeoutMs: 120_000,
        maxRedirects: 5,
        maxEntries: 100_000,
        maxFileBytes: 512 * 1024 * 1024,
        maxUncompressedBytes: 1024 * 1024 * 1024,
        maxCompressionRatio: 50,
      },
      headers: {},
      rootDepth: 'top-or-one-down',
    });
  });

  test('the sha256 is kept, uppercase or lowercase, and compared without regard to case', () => {
    expect(plan(archiveSource('https://a.example/f.zip', DIGEST)).plan).toMatchObject({
      sha256: DIGEST.toLowerCase(),
    });
  });

  test('the url must use https://', () => {
    for (const url of ['http://a.example/f.zip', 'ftp://a.example/f.zip', 'file:///f.zip']) {
      const issues = refusals(archiveSource(url));
      expect(issues[0]).toMatchObject({ severity: 'error', path: 'source.url' });
      expect(issues[0]?.message).toContain('https');
    }
  });

  test('the url cannot point at a loopback, link-local or cloud-metadata host', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '127.1.2.3',
      '[::1]',
      '169.254.169.254',
      '169.254.1.1',
      '[fe80::1]',
      '[fd00:ec2::254]',
      'metadata.google.internal',
    ]) {
      const issues = refusals(archiveSource(`https://${host}/f.zip`));
      expect(issues[0]?.message).toContain('loopback, link-local or cloud-metadata');
    }
  });

  test('an ordinary host and an address outside those ranges pass', () => {
    for (const host of ['artifacts.example.com', '8.8.8.8', '10.0.0.5', '[2001:db8::1]']) {
      expect(plan(archiveSource(`https://${host}/f.zip`)).issues).toEqual([]);
    }
  });
});

spec('marketplace.source.command', () => {
  test('runs through sh, from the home directory, with the timeout in milliseconds', () => {
    expect(plan(commandSource({ timeoutSeconds: 120 }))).toEqual({
      plan: {
        kind: 'command',
        command: 'my-tool claude-plugin-path',
        shell: 'sh',
        cwd: 'home',
        timeoutMs: 120_000,
        mode: 'copy',
      },
      issues: [],
    });
  });

  test('on Windows it runs through cmd.exe', () => {
    expect(plan(commandSource(), { platform: 'windows' }).plan).toMatchObject({
      shell: 'cmd',
      cwd: 'home',
    });
  });

  test('link mode is planned on macOS and Linux and refused on Windows, which says to declare copy', () => {
    expect(plan(commandSource({ mode: 'link' })).plan).toMatchObject({ mode: 'link' });
    const issues = refusals(commandSource({ mode: 'link' }), { platform: 'windows' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('Windows');
    expect(issues[0]?.message).toContain('"mode": "copy"');
    expect(plan(commandSource({ mode: 'copy' }), { platform: 'windows' }).plan?.kind).toBe(
      'command',
    );
  });
});

describe('judgments: package plans', () => {
  test("a git address in the shape of npm's own GitHub shorthand is refused, a scoped name is not", () => {
    expect(refusals(npm('owner/repo#main'))).toHaveLength(1);
    expect(plan(npm('@owner/repo')).issues).toEqual([]);
  });

  test('a subdomain of a refused tarball host (codeload.github.com) is refused too', () => {
    expect(refusals(npm('https://codeload.github.com/o/r/tar.gz/main'))).toHaveLength(1);
  });

  test('a package that is an empty appended version keeps the version option', () => {
    expect(plan(npm('formatter@', { version: '2' })).plan).toMatchObject({
      spec: { package: 'formatter', version: '2' },
    });
  });

  test('an unparseable archive url is refused', () => {
    const issues = refusals({ kind: 'archive', url: 'not a url' });
    expect(issues[0]).toMatchObject({ severity: 'error', path: 'source.url' });
  });

  test('other blocked spellings: IPv4-mapped IPv6, decimal IPv4, a trailing dot, .localhost and Alibaba metadata', () => {
    for (const host of [
      '[::ffff:127.0.0.1]',
      '2130706433',
      'localhost.',
      'app.localhost',
      '100.100.100.200',
      '[::ffff:169.254.169.254]',
      '[::]',
    ]) {
      expect(refusals({ kind: 'archive', url: `https://${host}/f.zip` })).toHaveLength(1);
    }
  });
});
