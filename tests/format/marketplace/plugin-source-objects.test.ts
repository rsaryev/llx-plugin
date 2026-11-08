/**
 * marketplace-reference.md § Plugin sources (the table and the shared `ref` and `sha`), §
 * github plugin source, § url plugin source, § git-subdir plugin source, § npm plugin source, §
 * archive plugin source, § command plugin source, § Validation messages, § Invalid input on a
 * source.
 */
import { expect, test } from 'bun:test';
import type { PluginIssue } from '../../../src/format/issues.ts';
import { parsePluginSource } from '../../../src/format/marketplace/plugin-source.ts';
import { slotAt } from '../../support/marketplace-entries.ts';
import { spec } from '../../support/spec.ts';

const PATH = 'plugins[0].source';
const SHA = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
const DIGEST = '6bfa50e3d2e00c052b46abe51fff89346ac803e45771f76dcf6df1ab74cca5e1';

const parse = (raw: unknown) => parsePluginSource(raw, slotAt());
const invalid = (raw: unknown): void => {
  const result = parse(raw);
  expect(result.source).toBeUndefined();
  expect(result.issues).toEqual([{ severity: 'error', path: PATH, message: 'Invalid input' }]);
};
const issuesOf = (raw: unknown): readonly PluginIssue[] => parse(raw).issues;

spec(['marketplace.source.github', 'marketplace.rule.Invalid input on a source'], () => {
  test('the doc example: repo, ref and sha', () => {
    const raw = { source: 'github', repo: 'your-org/formatter', ref: 'v2.0.0', sha: SHA };
    expect(parse(raw)).toEqual({
      source: { kind: 'github', repo: 'your-org/formatter', ref: 'v2.0.0', sha: SHA },
      issues: [],
    });
  });

  test('ref and sha are optional', () => {
    expect(parse({ source: 'github', repo: 'your-org/formatter' }).source).toEqual({
      kind: 'github',
      repo: 'your-org/formatter',
    });
  });

  test('github without repo, or with a repo that is not a string, is Invalid input', () => {
    invalid({ source: 'github' });
    invalid({ source: 'github', repo: 7 });
    invalid({ source: 'github', repo: ['a/b'] });
  });

  test('sha must be a full 40-character lowercase commit SHA', () => {
    for (const sha of [SHA.slice(0, 39), SHA.toUpperCase(), `${SHA}0`, 'main', 12]) {
      invalid({ source: 'github', repo: 'a/b', sha });
    }
  });

  test('ref must be a string', () => {
    invalid({ source: 'github', repo: 'a/b', ref: 3 });
  });
});

spec('marketplace.source.url', () => {
  test('the doc example: a GitLab URL with a ref', () => {
    const raw = {
      source: 'url',
      url: 'https://gitlab.example.com/your-group/formatter.git',
      ref: 'main',
    };
    expect(parse(raw).source).toEqual({
      kind: 'url',
      url: 'https://gitlab.example.com/your-group/formatter.git',
      ref: 'main',
    });
  });

  test('a URL without a .git suffix is read as written (Azure DevOps, AWS CodeCommit)', () => {
    for (const url of [
      'https://dev.azure.com/org/project/_git/formatter',
      'https://git-codecommit.us-east-1.amazonaws.com/v1/repos/formatter',
    ]) {
      expect(parse({ source: 'url', url }).source).toEqual({ kind: 'url', url });
    }
  });

  test('url, ref and sha follow the shared rules: url is required, sha is 40 lowercase hex', () => {
    invalid({ source: 'url' });
    invalid({ source: 'url', url: 4 });
    invalid({ source: 'url', url: 'https://x.example/r.git', sha: 'abc' });
    expect(parse({ source: 'url', url: 'git@host:o/r.git', sha: SHA }).source).toEqual({
      kind: 'url',
      url: 'git@host:o/r.git',
      sha: SHA,
    });
  });
});

spec('marketplace.source.git-subdir', () => {
  test('the doc example: a monorepo URL and the subdirectory path', () => {
    const raw = {
      source: 'git-subdir',
      url: 'https://github.com/your-org/monorepo.git',
      path: 'tools/formatter',
    };
    expect(parse(raw).source).toEqual({
      kind: 'git-subdir',
      url: 'https://github.com/your-org/monorepo.git',
      path: 'tools/formatter',
    });
  });

  test('url may be GitHub owner/repo shorthand, and ref and sha are carried', () => {
    const raw = { source: 'git-subdir', url: 'your-org/monorepo', path: 'p', ref: 'v1', sha: SHA };
    expect(parse(raw).source).toEqual({
      kind: 'git-subdir',
      url: 'your-org/monorepo',
      path: 'p',
      ref: 'v1',
      sha: SHA,
    });
  });

  test('path and url are required strings', () => {
    invalid({ source: 'git-subdir', url: 'o/r' });
    invalid({ source: 'git-subdir', path: 'p' });
    invalid({ source: 'git-subdir', url: 'o/r', path: 3 });
  });
});

spec(['marketplace.source.npm', 'marketplace.rule.Invalid input on a source'], () => {
  test('the doc example: package, a semver range and a registry', () => {
    const raw = {
      source: 'npm',
      package: '@your-org/formatter',
      version: '^2.0.0',
      registry: 'https://npm.example.com',
    };
    expect(parse(raw).source).toEqual({
      kind: 'npm',
      package: '@your-org/formatter',
      version: '^2.0.0',
      registry: 'https://npm.example.com',
    });
  });

  test('package may carry a version, or be an https tarball link', () => {
    for (const pkg of [
      '@your-org/formatter@2.0.0',
      'https://registry.example.com/f/-/f-2.0.0.tgz',
    ]) {
      expect(parse({ source: 'npm', package: pkg }).source).toEqual({ kind: 'npm', package: pkg });
    }
  });

  test('a package containing ".." is Invalid input', () => {
    invalid({ source: 'npm', package: '../formatter' });
    invalid({ source: 'npm', package: 'a..b' });
  });

  test('a missing package, or one that is not a string, is Invalid input', () => {
    invalid({ source: 'npm' });
    invalid({ source: 'npm', package: 1 });
    invalid({ source: 'npm', package: 'x', version: 2 });
  });
});

spec('marketplace.source.archive', () => {
  test('the doc example: an https URL and a sha256', () => {
    const raw = {
      source: 'archive',
      url: 'https://artifacts.example.com/formatter-2.0.0.zip',
      sha256: DIGEST,
    };
    expect(parse(raw).source).toEqual({
      kind: 'archive',
      url: 'https://artifacts.example.com/formatter-2.0.0.zip',
      sha256: DIGEST,
    });
  });

  test('sha256 is optional, 64 hex characters, uppercase or lowercase', () => {
    const url = 'https://a.example/f.zip';
    expect(parse({ source: 'archive', url }).source).toEqual({ kind: 'archive', url });
    expect(parse({ source: 'archive', url, sha256: DIGEST.toUpperCase() }).source).toEqual({
      kind: 'archive',
      url,
      sha256: DIGEST.toUpperCase(),
    });
    for (const sha256 of [DIGEST.slice(1), `${DIGEST}0`, 'z'.repeat(64), 9]) {
      invalid({ source: 'archive', url, sha256 });
    }
  });

  test('url is required', () => {
    invalid({ source: 'archive' });
    invalid({ source: 'archive', url: 5 });
  });
});

spec('marketplace.source.command', () => {
  test('the doc example: a command and a timeout; mode defaults to copy', () => {
    const raw = { source: 'command', command: 'my-tool claude-plugin-path', timeout: 120 };
    expect(parse(raw)).toEqual({
      source: {
        kind: 'command',
        command: 'my-tool claude-plugin-path',
        timeoutSeconds: 120,
        mode: 'copy',
      },
      issues: [],
    });
  });

  test('timeout defaults to 60 seconds; mode may be link', () => {
    expect(parse({ source: 'command', command: 'x', mode: 'link' }).source).toEqual({
      kind: 'command',
      command: 'x',
      timeoutSeconds: 60,
      mode: 'link',
    });
  });

  test('timeout is a whole number of seconds from 1 to 600', () => {
    for (const ok of [1, 600]) {
      expect(parse({ source: 'command', command: 'x', timeout: ok }).source).toMatchObject({
        timeoutSeconds: ok,
      });
    }
    for (const timeout of [0, 601, -5, 1.5, '60', null])
      invalid({ source: 'command', command: 'x', timeout });
  });

  test('mode is copy or link', () => {
    invalid({ source: 'command', command: 'x', mode: 'symlink' });
    invalid({ source: 'command', command: 'x', mode: 1 });
  });

  test('command is required', () => {
    invalid({ source: 'command' });
    invalid({ source: 'command', command: 9 });
  });

  test('the command must be printable ASCII', () => {
    for (const command of ['my-tool é', 'run\tit', 'a\nb', 'tool ​']) {
      const found = issuesOf({ source: 'command', command });
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ severity: 'error', path: `${PATH}.command` });
      expect(parse({ source: 'command', command }).source).toBeUndefined();
    }
  });

  test('the command has at most 500 characters', () => {
    expect(parse({ source: 'command', command: 'a'.repeat(500) }).source).toBeDefined();
    const found = parse({ source: 'command', command: 'a'.repeat(501) });
    expect(found.source).toBeUndefined();
    expect(found.issues[0]?.path).toBe(`${PATH}.command`);
  });

  test('the command has no run of four or more spaces', () => {
    expect(parse({ source: 'command', command: 'a   b' }).source).toBeDefined();
    const found = parse({ source: 'command', command: 'a    b' });
    expect(found.source).toBeUndefined();
    expect(found.issues[0]?.path).toBe(`${PATH}.command`);
  });
});
