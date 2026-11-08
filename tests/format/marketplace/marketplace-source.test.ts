/**
 * marketplace-reference.md § Marketplace sources (the table of source types and their fields), §
 * Fields by type, § Source values valid only in policy lists, § Source objects in settings;
 * settings-reference.md § extraKnownMarketplaces (a `settings` source's plugins must be remote, the
 * `name` must match the marketplace key); plugins/host-marketplace.md § Authenticate archive
 * downloads (an inline entry may set `headers` and `headersHelper`).
 */
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_PATH,
  errors,
  parse,
  sourceOf,
  warnings,
} from '../../support/marketplace-source.ts';
import { spec } from '../../support/spec.ts';

spec('marketplace.sourceField.url', () => {
  test('on a url source it is the link to the marketplace.json file', () => {
    const result = parse({ source: 'url', url: 'https://plugins.example.com/marketplace.json' });
    expect(result.source).toEqual({
      kind: 'url',
      url: 'https://plugins.example.com/marketplace.json',
    });
    expect(result.issues).toEqual([]);
    expect(result.loadStatus).toBe('loads');
  });

  test('on a git source it is the repository to clone, and the doc example parses', () => {
    const raw = {
      source: 'git',
      url: 'https://git.example.com/your-org/your-marketplace.git',
      ref: 'main',
    };
    expect(parse(raw)).toEqual({
      source: {
        kind: 'git',
        url: 'https://git.example.com/your-org/your-marketplace.git',
        ref: 'main',
        path: DEFAULT_PATH,
      },
      issues: [],
      loadStatus: 'loads',
    });
  });

  test('a url source without url, or with a url that is not a string, is Invalid input', () => {
    for (const raw of [{ source: 'url' }, { source: 'url', url: 7 }, { source: 'git' }]) {
      const result = parse(raw);
      expect(result.source).toBeUndefined();
      expect(errors(result.issues).map((i) => i.path)).toEqual(['url']);
    }
    expect(parse({ source: 'url' }).issues[0]?.message).toBe('Invalid input');
  });

  test('the field means nothing on the other types: it is reported as unknown', () => {
    const result = parse({ source: 'github', repo: 'a/b', url: 'https://x.example/m.json' });
    expect(result.source).toEqual({ kind: 'github', repo: 'a/b', path: DEFAULT_PATH });
    expect(warnings(result.issues).map((i) => i.path)).toEqual(['url']);
  });
});

// `headers` and `headersHelper` are proven by the download-headers tests (their requirement ids);
// here only that a url source carries them through the parser.
describe('a url source carries headers and headersHelper', () => {
  test('a url source keeps its headers and headersHelper', () => {
    const raw = {
      source: 'url',
      url: 'https://plugins.example.com/marketplace.json',
      headers: { Authorization: 'Bearer abc' },
      headersHelper: 'print-token',
    };
    expect(sourceOf(raw)).toEqual({
      kind: 'url',
      url: 'https://plugins.example.com/marketplace.json',
      headers: { Authorization: 'Bearer abc' },
      headersHelper: 'print-token',
    });
  });

  test('headers must be a map of strings and headersHelper a string', () => {
    const base = { source: 'url', url: 'https://x.example/m.json' };
    expect(errors(parse({ ...base, headers: 'x' }).issues).map((i) => i.path)).toEqual(['headers']);
    expect(errors(parse({ ...base, headers: { A: 1 } }).issues).map((i) => i.path)).toEqual([
      'headers.A',
    ]);
    expect(errors(parse({ ...base, headersHelper: 1 }).issues).map((i) => i.path)).toEqual([
      'headersHelper',
    ]);
  });
});

describe('headersHelper belongs to url sources', () => {
  test('is a url-source field: on github it is reported as unknown', () => {
    const result = parse({ source: 'github', repo: 'a/b', headersHelper: 'cmd' });
    expect(warnings(result.issues).map((i) => i.path)).toEqual(['headersHelper']);
    expect(result.source).not.toHaveProperty('headersHelper');
  });
});

spec('marketplace.sourceField.ref', () => {
  test('is the branch or tag of a github or git source', () => {
    expect(sourceOf({ source: 'github', repo: 'a/b', ref: 'v1.0.0' })).toMatchObject({
      ref: 'v1.0.0',
    });
    expect(sourceOf({ source: 'git', url: 'https://h.example/r.git', ref: 'main' })).toMatchObject({
      ref: 'main',
    });
  });

  test('it defaults to the default branch: no ref is recorded', () => {
    expect(sourceOf({ source: 'github', repo: 'a/b' })).not.toHaveProperty('ref');
  });

  test('a ref that is not a string is an error', () => {
    const result = parse({ source: 'github', repo: 'a/b', ref: 3 });
    expect(result.source).toBeUndefined();
    expect(errors(result.issues).map((i) => i.path)).toEqual(['ref']);
  });

  test('on a url source it is reported as unknown', () => {
    const result = parse({ source: 'url', url: 'https://x.example/m.json', ref: 'main' });
    expect(warnings(result.issues).map((i) => i.path)).toEqual(['ref']);
  });
});

spec('marketplace.sourceField.repo', () => {
  test('a github source names one repository', () => {
    const result = parse({ source: 'github', repo: 'acme-corp/claude-plugins' });
    expect(result).toEqual({
      source: { kind: 'github', repo: 'acme-corp/claude-plugins', path: DEFAULT_PATH },
      issues: [],
      loadStatus: 'loads',
    });
  });

  test('the owner wildcard is valid in a policy list: it matches every repository of the owner', () => {
    const result = parse({ source: 'github', repo: 'your-org/*' }, true);
    expect(result.source).toMatchObject({ kind: 'github', repo: 'your-org/*' });
    expect(result.issues).toEqual([]);
  });

  test('in extraKnownMarketplaces the wildcard is taken literally and the clone fails', () => {
    const result = parse({ source: 'github', repo: 'your-org/*' }, false);
    expect(result.source).toMatchObject({ kind: 'github', repo: 'your-org/*' });
    expect(warnings(result.issues).map((i) => i.path)).toEqual(['repo']);
    expect(result.loadStatus).not.toBe('loads');
  });

  test('repo is required and a string; on a git source it is unknown', () => {
    expect(parse({ source: 'github' }).issues).toEqual([
      { severity: 'error', path: 'repo', message: 'Invalid input' },
    ]);
    expect(errors(parse({ source: 'github', repo: 1 }).issues).map((i) => i.path)).toEqual([
      'repo',
    ]);
    expect(
      warnings(parse({ source: 'git', url: 'https://h.example/r.git', repo: 'a/b' }).issues).map(
        (i) => i.path,
      ),
    ).toEqual(['repo']);
  });
});

spec('marketplace.sourceField.path', () => {
  test('on github and git it is the marketplace file inside the repository, defaulting to .claude-plugin/marketplace.json', () => {
    expect(sourceOf({ source: 'github', repo: 'a/b' })).toMatchObject({ path: DEFAULT_PATH });
    expect(sourceOf({ source: 'git', url: 'https://h.example/r.git' })).toMatchObject({
      path: DEFAULT_PATH,
    });
    expect(
      sourceOf({ source: 'github', repo: 'a/b', path: 'marketplace/catalog.json' }),
    ).toMatchObject({ path: 'marketplace/catalog.json' });
  });

  test('on file it is the marketplace file itself and on directory the marketplace root', () => {
    expect(sourceOf({ source: 'file', path: '/opt/m/.claude-plugin/marketplace.json' })).toEqual({
      kind: 'file',
      path: '/opt/m/.claude-plugin/marketplace.json',
    });
    expect(sourceOf({ source: 'directory', path: '/opt/m' })).toEqual({
      kind: 'directory',
      path: '/opt/m',
    });
  });

  test('file and directory require a path that is a string', () => {
    for (const kind of ['file', 'directory']) {
      expect(parse({ source: kind }).issues).toEqual([
        { severity: 'error', path: 'path', message: 'Invalid input' },
      ]);
      expect(errors(parse({ source: kind, path: 4 }).issues).map((i) => i.path)).toEqual(['path']);
    }
  });

  test('on a url source it is reported as unknown', () => {
    const result = parse({ source: 'url', url: 'https://x.example/m.json', path: 'p' });
    expect(warnings(result.issues).map((i) => i.path)).toEqual(['path']);
  });
});

spec('marketplace.sourceField.sparsePaths', () => {
  test('is the list of directories of a sparse checkout, as the doc example writes it', () => {
    const raw = {
      source: 'git',
      url: 'https://h.example/r.git',
      sparsePaths: ['.claude-plugin', 'plugins'],
    };
    expect(sourceOf(raw)).toMatchObject({ sparsePaths: ['.claude-plugin', 'plugins'] });
    expect(sourceOf({ ...raw, source: 'github', repo: 'a/b', url: undefined })).toMatchObject({
      sparsePaths: ['.claude-plugin', 'plugins'],
    });
  });

  test('without it the whole repository is cloned: none is recorded', () => {
    expect(sourceOf({ source: 'github', repo: 'a/b' })).not.toHaveProperty('sparsePaths');
  });

  test('it must be an array of strings', () => {
    const base = { source: 'github', repo: 'a/b' };
    expect(
      errors(parse({ ...base, sparsePaths: '.claude-plugin' }).issues).map((i) => i.path),
    ).toEqual(['sparsePaths']);
    expect(errors(parse({ ...base, sparsePaths: ['ok', 2] }).issues).map((i) => i.path)).toEqual([
      'sparsePaths[1]',
    ]);
  });

  test('on a directory source it is reported as unknown', () => {
    const result = parse({ source: 'directory', path: '/x', sparsePaths: ['a'] });
    expect(warnings(result.issues).map((i) => i.path)).toEqual(['sparsePaths']);
  });
});

spec('marketplace.sourceField.skipLfs', () => {
  test('github and git accept it without an issue; it has no effect on the parsed source beyond being kept', () => {
    for (const skipLfs of [true, false]) {
      const github = parse({ source: 'github', repo: 'a/b', skipLfs });
      const git = parse({ source: 'git', url: 'https://h.example/r.git', skipLfs });
      expect(github.issues).toEqual([]);
      expect(git.issues).toEqual([]);
      expect(github.loadStatus).toBe('loads');
      expect(github.source).toMatchObject({ skipLfs });
    }
  });

  test('it must be a boolean', () => {
    const result = parse({ source: 'github', repo: 'a/b', skipLfs: 'yes' });
    expect(result.source).toBeUndefined();
    expect(errors(result.issues).map((i) => i.path)).toEqual(['skipLfs']);
  });

  test('on the other types it is reported as unknown', () => {
    for (const raw of [
      { source: 'url', url: 'https://x.example/m.json' },
      { source: 'file', path: '/x/.claude-plugin/marketplace.json' },
      { source: 'directory', path: '/x' },
    ]) {
      const result = parse({ ...raw, skipLfs: true });
      expect(warnings(result.issues).map((i) => i.path)).toEqual(['skipLfs']);
      expect(result.source).not.toHaveProperty('skipLfs');
    }
  });
});
