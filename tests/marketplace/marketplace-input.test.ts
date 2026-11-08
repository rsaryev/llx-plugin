/**
 * cli-reference.md § plugin marketplace add (the table of what you type and the source type it
 * becomes, the unrecognized-source and bare-host messages, `--sparse`); marketplace-reference.md §
 * Marketplace sources (the `marketplace add` input column) and § Fields by type (`repo`: `marketplace
 * add` rejects `owner/*`). No requirement id covers the input column on its own, so these tests sit
 * outside `spec(...)`; the judgments are in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginIssue } from '../../src/format/issues.ts';
import type { MarketplaceSource } from '../../src/format/marketplace/types.ts';
import { parseMarketplaceInput } from '../../src/marketplace/marketplace-input.ts';

const FILE = '.claude-plugin/marketplace.json';
const sourceOf = (text: string, options = {}): MarketplaceSource => {
  const result = parseMarketplaceInput(text, options);
  if (!('kind' in result)) throw new Error(result.message);
  return result;
};
const issueOf = (text: string, options = {}): PluginIssue => {
  const result = parseMarketplaceInput(text, options);
  if ('kind' in result) throw new Error(`parsed as ${result.kind}`);
  return result;
};

describe('GitHub shorthand', () => {
  test('owner/repo is a github source on the default branch', () => {
    expect(sourceOf('your-org/your-marketplace')).toEqual({
      kind: 'github',
      repo: 'your-org/your-marketplace',
      path: FILE,
    });
  });

  test('owner/repo#ref and owner/repo@ref pin the ref', () => {
    expect(sourceOf('acme/tools#v1.2')).toMatchObject({
      kind: 'github',
      repo: 'acme/tools',
      ref: 'v1.2',
    });
    expect(sourceOf('acme/tools@release')).toMatchObject({ repo: 'acme/tools', ref: 'release' });
  });

  test('owner/* is rejected as not a valid owner/repo shorthand', () => {
    const found = issueOf('your-org/*');
    expect(found.severity).toBe('error');
    expect(found.message).toContain('not a valid owner/repo shorthand');
  });

  test('owner and repo follow GitHub naming rules', () => {
    for (const text of ['-acme/tools', 'acme-/tools', 'ac me/tools', 'acme/to ols', 'acme/..']) {
      expect(parseMarketplaceInput(text)).toHaveProperty('severity', 'error');
    }
  });

  test('a bare host such as gitlab.example.com/team/plugins fails as an invalid shorthand and says what to do', () => {
    const found = issueOf('gitlab.example.com/team/plugins');
    expect(found.message).toContain('not a valid owner/repo shorthand');
    expect(found.message).toContain('https://');
    expect(found.message).toContain('local path');
  });
});

describe('git URLs', () => {
  test('user@host:path[.git][#ref] clones over SSH', () => {
    expect(sourceOf('git@github.com:acme/tools.git')).toEqual({
      kind: 'git',
      url: 'git@github.com:acme/tools.git',
      path: FILE,
    });
    expect(sourceOf('deploy@git.example.com:team/plugins#main')).toMatchObject({
      kind: 'git',
      url: 'deploy@git.example.com:team/plugins',
      ref: 'main',
    });
  });

  test('an http(s) URL ending in .git, or containing /_git/, is cloned; #ref pins a ref', () => {
    expect(sourceOf('https://example.com/repo.git')).toMatchObject({
      kind: 'git',
      url: 'https://example.com/repo.git',
    });
    expect(sourceOf('https://example.com/repo.git#v2')).toMatchObject({
      url: 'https://example.com/repo.git',
      ref: 'v2',
    });
    expect(sourceOf('https://dev.azure.com/org/project/_git/repo')).toMatchObject({
      kind: 'git',
      url: 'https://dev.azure.com/org/project/_git/repo',
    });
  });

  test('a github.com or gitlab.com repository URL is cloned with .git appended, over http too', () => {
    expect(sourceOf('https://github.com/acme/tools')).toMatchObject({
      kind: 'git',
      url: 'https://github.com/acme/tools.git',
    });
    expect(sourceOf('http://gitlab.com/namespace/project')).toMatchObject({
      url: 'http://gitlab.com/namespace/project.git',
    });
    expect(sourceOf('https://gitlab.com/group/subgroup/project')).toMatchObject({
      url: 'https://gitlab.com/group/subgroup/project.git',
    });
  });
});

describe('hosted marketplace.json', () => {
  test('any other http(s) URL is fetched as a marketplace.json, a self-hosted git host without .git too', () => {
    expect(sourceOf('https://plugins.example.com/marketplace.json')).toEqual({
      kind: 'url',
      url: 'https://plugins.example.com/marketplace.json',
    });
    expect(sourceOf('https://git.example.com/team/plugins')).toMatchObject({ kind: 'url' });
  });

  test('a github.com URL to a file is not a repository: it stays a url', () => {
    expect(sourceOf('https://gitlab.com/group/project/-/raw/main/marketplace.json')).toMatchObject({
      kind: 'url',
    });
  });
});

describe('local paths', () => {
  test('./path, ../path, /path and ~/path to a directory read the directory in place', () => {
    for (const path of ['./market', '../market', '/opt/market', '~/market']) {
      expect(sourceOf(path)).toEqual({ kind: 'directory', path });
    }
  });

  test('the same forms to a .json file read the file in place', () => {
    for (const path of ['./m/.claude-plugin/marketplace.json', '/opt/m.json', '~/x.JSON']) {
      expect(sourceOf(path)).toEqual({ kind: 'file', path });
    }
  });

  test('on Windows, .\\, ..\\ and C:\\ forms also work; on macOS and Linux they do not', () => {
    for (const path of ['.\\market', '..\\market', 'C:\\market']) {
      expect(sourceOf(path, { platform: 'windows' })).toEqual({ kind: 'directory', path });
      expect(parseMarketplaceInput(path)).toHaveProperty('severity', 'error');
    }
    expect(sourceOf('C:\\m\\marketplace.json', { platform: 'windows' })).toMatchObject({
      kind: 'file',
    });
  });
});

describe('what is not a source', () => {
  test('an unrecognized source says what is accepted', () => {
    for (const text of ['', 'market', '  ']) {
      expect(issueOf(text).message).toBe(
        'Invalid marketplace source format. Try: owner/repo, https://..., or ./path',
      );
    }
  });
});

describe('--sparse', () => {
  test('sets sparsePaths on a github or git source', () => {
    expect(sourceOf('acme/mono', { sparse: ['.claude-plugin', 'plugins'] })).toMatchObject({
      kind: 'github',
      sparsePaths: ['.claude-plugin', 'plugins'],
    });
    expect(sourceOf('https://h.example/r.git', { sparse: ['plugins'] })).toMatchObject({
      kind: 'git',
      sparsePaths: ['plugins'],
    });
  });

  test('is refused for the other types: github and git sources only', () => {
    for (const text of ['https://x.example/m.json', './dir']) {
      const found = issueOf(text, { sparse: ['a'] });
      expect(found.message).toContain('github and git sources only');
    }
  });

  test('an empty list sets nothing', () => {
    expect(sourceOf('acme/mono', { sparse: [] })).not.toHaveProperty('sparsePaths');
  });
});
