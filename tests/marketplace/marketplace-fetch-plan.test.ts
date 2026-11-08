/**
 * marketplace-reference.md § Marketplace sources (the table), § Fields by type; plugins/
 * host-marketplace.md § Stay within the download limits for hosted files (5 MiB, 10 seconds and the
 * redirect rule for a `marketplace.json` from a `url` source); plugins/host-marketplace.md § Keep
 * plugin files out of Git LFS; marketplace-reference.md § Relative path plugin source (a `url`
 * marketplace has only its marketplace.json); settings-reference.md § extraKnownMarketplaces.
 */
import { expect, test } from 'bun:test';
import { parseMarketplaceSource } from '../../src/format/marketplace/marketplace-source.ts';
import type { MarketplaceSource } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { planMarketplaceFetch } from '../../src/marketplace/marketplace-fetch-plan.ts';
import { spec } from '../support/spec.ts';

const MARKETPLACE_FILE = '.claude-plugin/marketplace.json';

function sourceFrom(raw: unknown): MarketplaceSource {
  const { source } = parseMarketplaceSource(raw, { policy: false });
  if (source === undefined) throw new Error('did not parse');
  return source;
}
const planOf = (raw: unknown) => planMarketplaceFetch(sourceFrom(raw));

spec('marketplace.sourceField.url', () => {
  test('a url source downloads only that file: 5 MiB, 10 seconds', () => {
    expect(planOf({ source: 'url', url: 'https://plugins.example.com/marketplace.json' })).toEqual({
      kind: 'http-file',
      url: 'https://plugins.example.com/marketplace.json',
      maxBytes: 5_242_880, // 5 MiB
      timeoutMs: 10_000,
      redirects: {
        crossOrigin: 'https-only',
        blockedHosts: 'refused',
        headersAcrossOrigins: 'none',
      },
      headers: {},
    });
  });

  test('a redirect to a different origin must use https, avoids blocked hosts and carries no headers', () => {
    const plan = planOf({
      source: 'url',
      url: 'https://plugins.example.com/marketplace.json',
      headers: { Authorization: 'Bearer abc' },
    });
    expect(plan).toMatchObject({
      headers: { authorization: 'Bearer abc' },
      redirects: {
        crossOrigin: 'https-only',
        blockedHosts: 'refused',
        headersAcrossOrigins: 'none',
      },
    });
  });

  test('its plugins cannot use relative-path sources: only marketplace.json is downloaded', () => {
    const source = sourceFrom({
      source: 'url',
      url: 'https://plugins.example.com/marketplace.json',
    });
    const refused = planPluginFetch(
      { kind: 'relative', path: 'plugins/formatter', bare: false },
      { platform: 'posix', marketplaceOrigin: source },
    );
    expect(refused.plan).toBeUndefined();
    expect(refused.issues[0]).toMatchObject({ severity: 'error', path: 'source' });
    expect(refused.issues[0]?.message).toContain('marketplace added by URL');
    const remote = planPluginFetch(
      { kind: 'github', repo: 'acme/formatter' },
      { platform: 'posix', marketplaceOrigin: source },
    );
    expect(remote.plan).toBeDefined();
  });

  test('a git source clones the repository at that url', () => {
    expect(
      planOf({ source: 'git', url: 'https://git.example.com/org/m.git', ref: 'main' }),
    ).toEqual({
      kind: 'git',
      repo: { url: 'https://git.example.com/org/m.git' },
      ref: 'main',
      path: MARKETPLACE_FILE,
    });
  });

  test('a url source sends its headers (names lower case) and names its command', () => {
    const plan = planOf({
      source: 'url',
      url: 'https://plugins.example.com/marketplace.json',
      headers: { Authorization: 'Bearer abc' },
      headersHelper: 'print-token',
    });
    expect(plan).toMatchObject({
      kind: 'http-file',
      headers: { authorization: 'Bearer abc' },
      helper: 'print-token',
    });
  });
});

spec('marketplace.sourceField.repo', () => {
  test('a github source clones the repository named by its shorthand', () => {
    expect(planOf({ source: 'github', repo: 'acme-corp/claude-plugins' })).toEqual({
      kind: 'git',
      repo: { shorthand: 'acme-corp/claude-plugins' },
      path: MARKETPLACE_FILE,
    });
  });

  test('an owner wildcard names no repository: planning refuses, as the clone would fail', () => {
    const plan = planOf({ source: 'github', repo: 'your-org/*' });
    expect(plan).toMatchObject({ severity: 'error', path: 'repo' });
    expect(plan).not.toHaveProperty('kind');
  });

  test('owner and repository follow GitHub naming rules, as in marketplace add', () => {
    for (const repo of ['-acme/tools', 'acme-/tools', 'acme/..', 'acme/a/b', 'acme']) {
      expect(planMarketplaceFetch({ kind: 'github', repo, path: MARKETPLACE_FILE })).toMatchObject({
        severity: 'error',
        path: 'repo',
      });
    }
  });
});

spec('marketplace.sourceField.ref', () => {
  test('a ref is checked out; without one the default branch is cloned', () => {
    expect(planOf({ source: 'github', repo: 'a/b', ref: 'v1.0.0' })).toMatchObject({
      ref: 'v1.0.0',
    });
    expect(planOf({ source: 'github', repo: 'a/b' })).not.toHaveProperty('ref');
  });
});

spec('marketplace.sourceField.path', () => {
  test('the marketplace file inside a repository defaults to .claude-plugin/marketplace.json', () => {
    expect(planOf({ source: 'github', repo: 'a/b' })).toMatchObject({ path: MARKETPLACE_FILE });
    expect(planOf({ source: 'git', url: 'https://h.example/r.git' })).toMatchObject({
      path: MARKETPLACE_FILE,
    });
    expect(planOf({ source: 'github', repo: 'a/b', path: 'catalog/m.json' })).toMatchObject({
      path: 'catalog/m.json',
    });
  });

  test('a file source is read in place and its root is the directory two levels up', () => {
    expect(
      planOf({ source: 'file', path: '/opt/acme/my-marketplace/.claude-plugin/marketplace.json' }),
    ).toEqual({
      kind: 'read-file',
      path: '/opt/acme/my-marketplace/.claude-plugin/marketplace.json',
      root: '/opt/acme/my-marketplace',
    });
  });

  test('a Windows file path goes up two levels with its own separators', () => {
    expect(
      planOf({ source: 'file', path: 'C:\\plugins\\m\\.claude-plugin\\marketplace.json' }),
    ).toMatchObject({ root: 'C:\\plugins\\m' });
  });

  test('a relative file path with fewer than two directories stops at the current directory', () => {
    for (const path of [
      'marketplace.json',
      './marketplace.json',
      '.claude-plugin/marketplace.json',
      './.claude-plugin/marketplace.json',
    ]) {
      expect(planOf({ source: 'file', path })).toMatchObject({ kind: 'read-file', root: '.' });
    }
    expect(planOf({ source: 'file', path: 'm/.claude-plugin/marketplace.json' })).toMatchObject({
      root: 'm',
    });
    expect(planOf({ source: 'file', path: '../m/.claude-plugin/marketplace.json' })).toMatchObject({
      root: '../m',
    });
  });

  test('a file directly under the filesystem or drive root has that root', () => {
    expect(planOf({ source: 'file', path: '/marketplace.json' })).toMatchObject({ root: '/' });
    expect(planOf({ source: 'file', path: '/m/marketplace.json' })).toMatchObject({ root: '/' });
    expect(planOf({ source: 'file', path: 'C:\\m.json' })).toMatchObject({ root: 'C:\\' });
    expect(planOf({ source: 'file', path: 'C:\\a\\m.json' })).toMatchObject({ root: 'C:\\' });
  });

  test('a directory source is the marketplace root itself', () => {
    expect(planOf({ source: 'directory', path: '/opt/acme/my-marketplace' })).toEqual({
      kind: 'read-directory',
      root: '/opt/acme/my-marketplace',
    });
  });
});

spec('marketplace.sourceField.sparsePaths', () => {
  test('the directories become the sparse checkout of the clone', () => {
    const plan = planOf({
      source: 'github',
      repo: 'a/b',
      sparsePaths: ['.claude-plugin', 'plugins'],
    });
    expect(plan).toMatchObject({ kind: 'git', sparsePaths: ['.claude-plugin', 'plugins'] });
  });

  test('without them the whole repository is cloned', () => {
    expect(planOf({ source: 'git', url: 'https://h.example/r.git' })).not.toHaveProperty(
      'sparsePaths',
    );
  });
});

spec('marketplace.sourceField.skipLfs', () => {
  test('the plan is deep-equal with and without it, set or not', () => {
    const github = { source: 'github', repo: 'a/b', ref: 'main' };
    const git = { source: 'git', url: 'https://h.example/r.git' };
    for (const base of [github, git]) {
      const without = planOf(base);
      expect(planOf({ ...base, skipLfs: true })).toEqual(without);
      expect(planOf({ ...base, skipLfs: false })).toEqual(without);
    }
  });
});

spec('marketplace.sourceField.plugins', () => {
  test('a settings source is an inline catalog: no file is fetched', () => {
    const plan = planOf({
      source: 'settings',
      name: 'team-tools',
      plugins: [{ name: 'f', source: { source: 'github', repo: 'a/b' } }],
    });
    expect(plan).toMatchObject({ kind: 'inline' });
    if (!('entries' in plan)) throw new Error('not inline');
    expect(plan.entries.map((entry) => entry.name)).toEqual(['f']);
  });
});

test('npm and the policy-only types have nothing to fetch, with the documented reasons', () => {
  const npm = planMarketplaceFetch({ kind: 'npm', package: '@acme/m' });
  expect(npm).toEqual({
    severity: 'error',
    path: 'source',
    message: 'NPM marketplace sources not yet implemented',
  });
  for (const source of [
    { kind: 'skills-dir' },
    { kind: 'hostPattern', hostPattern: '^a$' },
    { kind: 'pathPattern', pathPattern: '^/a' },
  ] as const) {
    expect(planMarketplaceFetch(source)).toEqual({
      severity: 'error',
      path: 'source',
      message: 'Unsupported marketplace source type',
    });
  }
});
