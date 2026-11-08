/**
 * marketplace-reference.md § Plugin sources (shared `ref` and `sha`), § Relative path plugin
 * source (what resolves for each marketplace source), § github / url / git-subdir plugin source;
 * host-marketplace.md § Avoid relative-path entries in a URL-hosted marketplace.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource, PluginSource } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import type { FetchPlanContext } from '../../src/marketplace/types.ts';
import { spec } from '../support/spec.ts';

const SHA = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
const posix: FetchPlanContext = { platform: 'posix' };
const plan = (source: PluginSource, context: FetchPlanContext = posix) =>
  planPluginFetch(source, context);
const withOrigin = (marketplaceOrigin: MarketplaceSource): FetchPlanContext => ({
  platform: 'posix',
  marketplaceOrigin,
});

const relative = (path: string): PluginSource => ({ kind: 'relative', path, bare: false });

spec('marketplace.source.Relative path', () => {
  test('resolves from the marketplace root: ./plugins/formatter is <root>/plugins/formatter', () => {
    expect(plan(relative('plugins/formatter'))).toEqual({
      plan: {
        kind: 'local',
        fromMarketplaceRoot: 'plugins/formatter',
        submodules: 'plugin-subtree',
      },
      issues: [],
    });
  });

  test('"." is the marketplace root itself', () => {
    expect(plan(relative('.')).plan).toEqual({
      kind: 'local',
      fromMarketplaceRoot: '.',
      submodules: 'whole-repository',
    });
  });

  test('github, git, file and directory marketplaces have the files, so a relative path resolves', () => {
    const origins: MarketplaceSource[] = [
      { kind: 'github', repo: 'o/r', path: '.claude-plugin/marketplace.json' },
      { kind: 'git', url: 'https://h/r.git', path: '.claude-plugin/marketplace.json' },
      { kind: 'file', path: '/m/.claude-plugin/marketplace.json' },
      { kind: 'directory', path: '/m' },
    ];
    for (const origin of origins) {
      expect(plan(relative('plugins/f'), withOrigin(origin)).plan?.kind).toBe('local');
    }
  });

  test('a url marketplace has only marketplace.json: relative paths cannot resolve', () => {
    const result = plan(
      relative('plugins/formatter'),
      withOrigin({ kind: 'url', url: 'https://example.com/marketplace.json' }),
    );
    expect(result.plan).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.severity).toBe('error');
    expect(result.issues[0]?.message).toContain('cannot resolve');
    expect(result.issues[0]?.message).toContain(
      'its marketplace entry path does not stay inside the marketplace directory',
    );
  });

  test('a settings marketplace rejects relative paths outright', () => {
    const result = plan(
      relative('plugins/f'),
      withOrigin({ kind: 'settings', name: 'm', plugins: [] }),
    );
    expect(result.plan).toBeUndefined();
    expect(result.issues[0]?.message).toContain('rejected');
  });

  test('without a known origin the path is planned from the marketplace root', () => {
    expect(plan(relative('x'), posix).plan?.kind).toBe('local');
  });
});

describe('plugin sources that are not relative are fetched on their own, whatever the origin', () => {
  test('a github source plans the same for a url marketplace', () => {
    const origin = withOrigin({ kind: 'url', url: 'https://example.com/marketplace.json' });
    expect(plan({ kind: 'github', repo: 'o/r' }, origin).plan?.kind).toBe('git');
    expect(plan({ kind: 'archive', url: 'https://a.example/f.zip' }, origin).plan?.kind).toBe(
      'archive',
    );
  });
});

spec('marketplace.source.github', () => {
  test('repo is owner/repo; with no ref and no sha the default branch is cloned', () => {
    expect(plan({ kind: 'github', repo: 'your-org/formatter' })).toEqual({
      plan: {
        kind: 'git',
        repo: { shorthand: 'your-org/formatter' },
        checkout: 'default-branch',
        sparse: false,
        partialClone: false,
        lfs: 'pointer-files',
      },
      issues: [],
    });
  });

  test('ref is a branch or tag', () => {
    expect(plan({ kind: 'github', repo: 'o/r', ref: 'v2.0.0' }).plan).toMatchObject({
      ref: 'v2.0.0',
      checkout: 'ref',
    });
  });

  test('when both ref and sha are set, the sha is checked out', () => {
    expect(plan({ kind: 'github', repo: 'o/r', ref: 'v2.0.0', sha: SHA }).plan).toMatchObject({
      ref: 'v2.0.0',
      sha: SHA,
      checkout: 'sha',
    });
    expect(plan({ kind: 'github', repo: 'o/r', sha: SHA }).plan).toMatchObject({ checkout: 'sha' });
  });
});

spec('marketplace.source.url', () => {
  test('https, http, file and git@ URLs are planned as written, with no .git suffix needed', () => {
    for (const url of [
      'https://gitlab.example.com/your-group/formatter.git',
      'https://dev.azure.com/org/project/_git/formatter',
      'http://git.internal/r',
      'file:///srv/git/formatter',
      'git@github.com:your-org/formatter.git',
    ]) {
      expect(plan({ kind: 'url', url }).plan).toEqual({
        kind: 'git',
        repo: { url },
        checkout: 'default-branch',
        sparse: false,
        partialClone: false,
        lfs: 'pointer-files',
      });
    }
  });

  test('the url type does not take owner/repo shorthand', () => {
    const result = plan({ kind: 'url', url: 'your-org/formatter' });
    expect(result.plan).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'source.url' });
    expect(result.issues[0]?.message).toContain('owner/repo');
  });

  test('a value that is no git URL form is refused', () => {
    for (const url of [
      'ftp://host/r.git',
      'ssh://git@host/r.git',
      'formatter',
      '/srv/git/r',
      'github.com/o/r',
    ]) {
      expect(plan({ kind: 'url', url }).plan).toBeUndefined();
    }
  });

  test('ref and sha work as for github: the sha wins', () => {
    expect(plan({ kind: 'url', url: 'https://h/r.git', ref: 'main', sha: SHA }).plan).toMatchObject(
      {
        ref: 'main',
        sha: SHA,
        checkout: 'sha',
      },
    );
  });
});

spec('marketplace.source.git-subdir', () => {
  test('checks out only the subdirectory, sparsely, and asks for a partial clone over https', () => {
    expect(
      plan({
        kind: 'git-subdir',
        url: 'https://github.com/your-org/monorepo.git',
        path: 'tools/formatter',
      }),
    ).toEqual({
      plan: {
        kind: 'git',
        repo: { url: 'https://github.com/your-org/monorepo.git' },
        subdir: 'tools/formatter',
        checkout: 'default-branch',
        sparse: true,
        partialClone: true,
        lfs: 'pointer-files',
      },
      issues: [],
    });
  });

  test('a partial clone is asked over SSH, and for GitHub shorthand', () => {
    for (const url of ['git@github.com:your-org/monorepo.git', 'your-org/monorepo']) {
      expect(plan({ kind: 'git-subdir', url, path: 'p' }).plan).toMatchObject({
        sparse: true,
        partialClone: true,
        lfs: 'pointer-files',
      });
    }
  });

  test('shorthand becomes a GitHub shorthand repository, a URL stays a URL', () => {
    expect(plan({ kind: 'git-subdir', url: 'your-org/monorepo', path: 'p' }).plan).toMatchObject({
      repo: { shorthand: 'your-org/monorepo' },
    });
  });

  test('over http or file:// there is no partial clone, the checkout is still sparse', () => {
    for (const url of ['http://git.internal/monorepo.git', 'file:///srv/monorepo']) {
      expect(plan({ kind: 'git-subdir', url, path: 'p' }).plan).toMatchObject({
        sparse: true,
        partialClone: false,
        lfs: 'pointer-files',
      });
    }
  });

  test('ref and sha are shared with github and url', () => {
    expect(
      plan({ kind: 'git-subdir', url: 'o/r', path: 'p', ref: 'v1', sha: SHA }).plan,
    ).toMatchObject({ ref: 'v1', sha: SHA, checkout: 'sha' });
    expect(plan({ kind: 'git-subdir', url: 'o/r', path: 'p', ref: 'v1' }).plan).toMatchObject({
      checkout: 'ref',
    });
  });
});

describe('judgments: git plans', () => {
  test('a github repo that is not owner/repo is refused before cloning', () => {
    for (const repo of ['formatter', 'a/b/c', 'https://github.com/o/r']) {
      const result = plan({ kind: 'github', repo });
      expect(result.plan).toBeUndefined();
      expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'source.repo' });
    }
  });

  test('a git-subdir path that leaves the repository is refused', () => {
    for (const path of [
      '../x',
      'a/../../x',
      '/etc',
      '\\\\host\\share',
      'C:\\x',
      'C:/x',
      'c:x',
      'a\\..\\b',
    ]) {
      const result = plan({ kind: 'git-subdir', url: 'o/r', path });
      expect(result.plan).toBeUndefined();
      expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'source.path' });
    }
  });

  test('a git-subdir url that is no git URL form is refused', () => {
    expect(plan({ kind: 'git-subdir', url: 'nonsense', path: 'p' }).plan).toBeUndefined();
  });

  test('a marketplace origin that is no concrete marketplace (npm, skills-dir, patterns) does not refuse a relative path', () => {
    const origins: MarketplaceSource[] = [
      { kind: 'npm', package: 'm' },
      { kind: 'skills-dir' },
      { kind: 'hostPattern', hostPattern: '^h$' },
      { kind: 'pathPattern', pathPattern: '^/p' },
    ];
    for (const origin of origins) {
      expect(plan(relative('x'), withOrigin(origin)).plan?.kind).toBe('local');
    }
  });
});
