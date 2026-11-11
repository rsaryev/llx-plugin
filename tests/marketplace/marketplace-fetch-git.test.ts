/**
 * marketplace-reference.md § Fields by type: `url` (git) is "the git repository to clone", `path` is
 * "the marketplace file's path inside the repository", `sparsePaths` is an "array of directories
 * for a sparse checkout" and `ref` is a "branch or tag". What the docs leave open, which values are
 * refused before the clone, is judged outside `spec(...)` (spec/judgments.md): the url takes the
 * forms a `url` plugin source takes, `path` and every sparse path stay inside the repository, and a
 * `ref` must be a name git accepts for a branch or tag, never one git would read as an option. The
 * plugin sources `github`, `url` and `git-subdir` hold their `ref` to the same rule.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource, PluginSource } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { planMarketplaceFetch } from '../../src/marketplace/marketplace-fetch-plan.ts';
import { spec } from '../support/spec.ts';

const FILE = '.claude-plugin/marketplace.json';
const git = (extra: Partial<MarketplaceSource & { kind: 'git' }> = {}): MarketplaceSource => ({
  kind: 'git',
  url: 'https://git.example.com/org/m.git',
  path: FILE,
  ...extra,
});
const github = (
  extra: Partial<MarketplaceSource & { kind: 'github' }> = {},
): MarketplaceSource => ({
  kind: 'github',
  repo: 'acme/tools',
  path: FILE,
  ...extra,
});

spec(['marketplace.sourceField.ref', 'marketplace.sourceField.path'], () => {
  test('a ref, a path and sparse directories inside the repository are cloned as given', () => {
    expect(
      planMarketplaceFetch(git({ ref: 'release/v2', sparsePaths: ['.claude-plugin', 'plugins'] })),
    ).toEqual({
      kind: 'git',
      repo: { url: 'https://git.example.com/org/m.git' },
      ref: 'release/v2',
      path: FILE,
      sparsePaths: ['.claude-plugin', 'plugins'],
      lfs: 'pointer-files',
    });
  });
});

describe('judgments: what a git marketplace source refuses before the clone', () => {
  test.each(['--upload-pack=touch /tmp/x', 'ext::sh -c touch% /tmp/x', 'acme/tools', '/srv/git/m'])(
    'a git url "%s" that is no git URL form is refused on url',
    (url) => {
      expect(planMarketplaceFetch(git({ url }))).toMatchObject({ severity: 'error', path: 'url' });
    },
  );

  test.each([
    '../outside/marketplace.json',
    '/etc/marketplace.json',
    'C:\\m.json',
    'a/../../m.json',
  ])('a path "%s" that leaves the repository is refused on path', (path) => {
    expect(planMarketplaceFetch(git({ path }))).toMatchObject({ severity: 'error', path: 'path' });
    expect(planMarketplaceFetch(github({ path }))).toMatchObject({
      severity: 'error',
      path: 'path',
    });
  });

  test('a sparse path that leaves the repository is refused on its index', () => {
    expect(planMarketplaceFetch(github({ sparsePaths: ['plugins', '../up'] }))).toMatchObject({
      severity: 'error',
      path: 'sparsePaths[1]',
    });
  });

  test.each([
    '-c',
    '--orphan',
    'a..b',
    'has space',
    'a:b',
    'v1^',
    'x~1',
    'a@{0}',
    'end/',
    'x.lock',
    '.hidden',
    'a//b',
    'tab\there',
  ])('a ref "%s" git would read as an option or cannot name is refused on ref', (ref) => {
    expect(planMarketplaceFetch(github({ ref }))).toMatchObject({ severity: 'error', path: 'ref' });
    expect(planMarketplaceFetch(git({ ref }))).toMatchObject({ severity: 'error', path: 'ref' });
  });

  test('the plugin sources hold their ref to the same rule', () => {
    const sources: PluginSource[] = [
      { kind: 'github', repo: 'acme/tools', ref: '--upload-pack=x' },
      { kind: 'url', url: 'https://example.com/r.git', ref: '--upload-pack=x' },
      { kind: 'git-subdir', url: 'https://example.com/r.git', path: 'p', ref: '--upload-pack=x' },
    ];
    for (const source of sources) {
      const result = planPluginFetch(source, { platform: 'posix' });
      expect(result.plan).toBeUndefined();
      expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'source.ref' });
    }
    expect(
      planPluginFetch({ kind: 'github', repo: 'acme/tools', ref: 'v1.0.0' }, { platform: 'posix' })
        .plan,
    ).toBeDefined();
  });
});
