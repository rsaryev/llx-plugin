/**
 * marketplace-reference.md § Marketplace sources: the table of source types, the `marketplace add`
 * input that produces each, and what each does in `extraKnownMarketplaces`, `strictKnownMarketplaces`
 * and `blockedMarketplaces` (the `settings` and `skills-dir` rows are proven in
 * marketplace-source-rows.test.ts).
 */
import { describe, expect, test } from 'bun:test';
import { parseMarketplaceSource } from '../../src/format/marketplace/marketplace-source.ts';
import { parseMarketplaceInput } from '../../src/marketplace/marketplace-input.ts';
import {
  admits,
  blocks,
  directory,
  file,
  git,
  github,
  hostPattern,
  pathPattern,
  url,
} from '../support/marketplace-sources.ts';
import { spec } from '../support/spec.ts';

const READ = { policy: false, key: 'team-tools' } as const;
const POLICY = { policy: true, key: 'team-tools' } as const;
const PAGE = 'marketplace.rule.Marketplace sources';
const loads = (source: Parameters<typeof parseMarketplaceSource>[0]) =>
  parseMarketplaceSource(source, READ).loadStatus;

describe('the table as a whole', () => {
  spec(PAGE, () => {
    test('every type with fields is read; the three settings keys treat each by its row', () => {
      expect(loads(url('https://x.test/m.json'))).toBe('loads');
      expect(loads(github('a/b'))).toBe('loads');
      expect(loads(file('/m.json'))).toBe('loads');
      expect(admits(github('a/b'), github('a/b'))).toBe(true);
      expect(blocks(github('a/b'), github('a/b'))).toBe(true);
    });
  });
});

spec(`${PAGE}.url`, () => {
  test('an http(s) URL that matches no git form is a url source', () => {
    expect(parseMarketplaceInput('https://x.test/m.json')).toMatchObject({
      kind: 'url',
      url: 'https://x.test/m.json',
    });
  });
  test('it loads, and a list allows or blocks the same URL only', () => {
    expect(loads(url('https://x.test/m.json'))).toBe('loads');
    expect(admits(url('https://x.test/m.json'), url('https://x.test/m.json'))).toBe(true);
    expect(admits(url('https://x.test/m.json'), url('https://x.test/other.json'))).toBe(false);
    expect(blocks(url('https://x.test/m.json'), url('https://x.test/m.json'))).toBe(true);
    expect(blocks(url('https://x.test/m.json'), url('https://x.test/other.json'))).toBe(false);
  });
});

spec(`${PAGE}.github`, () => {
  test('owner/repo, owner/repo@ref and owner/repo#ref produce it', () => {
    expect(parseMarketplaceInput('acme/tools')).toMatchObject({
      kind: 'github',
      repo: 'acme/tools',
    });
    for (const text of ['acme/tools@v1', 'acme/tools#v1']) {
      expect(parseMarketplaceInput(text)).toMatchObject({ kind: 'github', ref: 'v1' });
    }
  });
  test('it loads; the allowlist matches repo, ref and path, and repo may be owner/*', () => {
    expect(loads(github('acme/tools'))).toBe('loads');
    expect(admits(github('acme/tools', { ref: 'v1' }), github('acme/tools', { ref: 'v1' }))).toBe(
      true,
    );
    expect(admits(github('acme/tools', { ref: 'v1' }), github('acme/tools', { ref: 'v2' }))).toBe(
      false,
    );
    expect(admits(github('acme/*'), github('acme/tools'))).toBe(true);
    expect(admits(github('acme/*'), github('other/tools'))).toBe(false);
  });
  test('the blocklist blocks the same, and a git URL to the same repository', () => {
    expect(blocks(github('acme/tools'), github('acme/tools'))).toBe(true);
    expect(blocks(github('acme/tools'), git('https://github.com/acme/tools.git'))).toBe(true);
    expect(blocks(github('acme/tools'), github('acme/other'))).toBe(false);
  });
});

spec(`${PAGE}.git`, () => {
  test('user@host:path and URLs ending .git, with /_git/, or naming github.com or gitlab.com produce it', () => {
    for (const text of [
      'git@h.test:a/b.git',
      'https://h.test/a/b.git',
      'https://h.test/_git/x',
      'https://github.com/a/b',
      'https://gitlab.com/a/b',
    ]) {
      expect(parseMarketplaceInput(text)).toMatchObject({ kind: 'git' });
    }
    expect(parseMarketplaceInput('https://gitlab.com/a/b#main')).toMatchObject({ ref: 'main' });
  });
  test('it loads; lists match the same URL, ref and path', () => {
    const entry = git('https://h.test/a/b.git', { ref: 'main' });
    expect(loads(entry)).toBe('loads');
    expect(admits(entry, git('https://h.test/a/b.git', { ref: 'main' }))).toBe(true);
    expect(admits(entry, git('https://h.test/a/b.git', { ref: 'dev' }))).toBe(false);
    expect(blocks(entry, git('https://h.test/a/b.git', { ref: 'main' }))).toBe(true);
  });
});

spec(`${PAGE}.npm`, () => {
  test('no input produces it; in extraKnownMarketplaces it fails to load', () => {
    const read = parseMarketplaceSource({ source: 'npm', package: 'tools' }, READ);
    expect(read.loadStatus).toBe('fails: NPM marketplace sources not yet implemented');
  });
  test('in both policy lists it parses but matches nothing', () => {
    const entry = { source: 'npm', package: 'tools' } as const;
    expect(parseMarketplaceSource(entry, POLICY).source).toBeDefined();
    for (const registered of [
      github('acme/tools'),
      url('https://x.test/m.json'),
      file('/m.json'),
    ]) {
      expect(admits(entry, registered)).toBe(false);
      expect(blocks(entry, registered)).toBe(false);
    }
  });
});

spec([`${PAGE}.file`, `${PAGE}.directory`], () => {
  test('a path to a .json file is a file source, a path to a directory a directory source', () => {
    expect(parseMarketplaceInput('/tmp/m.json')).toMatchObject({ kind: 'file' });
    expect(parseMarketplaceInput('/tmp/dir')).toMatchObject({ kind: 'directory' });
  });
  test('both load, and each list matches the same path', () => {
    for (const make of [file, directory]) {
      expect(loads(make('/tmp/x'))).toBe('loads');
      expect(admits(make('/tmp/x'), make('/tmp/x'))).toBe(true);
      expect(admits(make('/tmp/x'), make('/tmp/y'))).toBe(false);
      expect(blocks(make('/tmp/x'), make('/tmp/x'))).toBe(true);
      expect(blocks(make('/tmp/x'), make('/tmp/y'))).toBe(false);
    }
  });
});

spec(`${PAGE}.hostPattern`, () => {
  test('no input produces it; elsewhere than the policy lists it fails to load', () => {
    expect(
      parseMarketplaceSource({ source: 'hostPattern', hostPattern: 'x' }, READ).loadStatus,
    ).toBe('fails: Unsupported marketplace source type');
  });
  test('the policy lists admit or block github, git and url sources whose host matches', () => {
    const entry = hostPattern('^github\\.com$');
    expect(admits(entry, github('acme/tools'))).toBe(true);
    expect(admits(entry, git('https://gitlab.com/a/b.git'))).toBe(false);
    expect(admits(hostPattern('^example\\.com$'), url('https://example.com/m.json'))).toBe(true);
    expect(blocks(entry, github('acme/tools'))).toBe(true);
    expect(blocks(entry, file('/tmp/m.json'))).toBe(false);
  });
});

spec(`${PAGE}.pathPattern`, () => {
  test('no input produces it; elsewhere than the policy lists it fails to load', () => {
    expect(
      parseMarketplaceSource({ source: 'pathPattern', pathPattern: 'x' }, READ).loadStatus,
    ).toBe('fails: Unsupported marketplace source type');
  });
  test('the policy lists admit or block file and directory sources whose path matches', () => {
    const entry = pathPattern('^/opt/plugins/');
    expect(admits(entry, directory('/opt/plugins/a'))).toBe(true);
    expect(admits(entry, file('/opt/plugins/a.json'))).toBe(true);
    expect(admits(entry, directory('/home/a'))).toBe(false);
    expect(blocks(entry, directory('/opt/plugins/a'))).toBe(true);
    expect(blocks(entry, github('a/b'))).toBe(false);
  });
});
