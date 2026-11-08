/**
 * Behaviour of the matcher engine both marketplace lists share, outside the requirement ids: the
 * judgments of spec/judgments.md (npm entries, regex flavour, hosts of unnamed forms, canonical
 * repository identity) and the host and git URL helpers the matcher is built from.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource } from '../../../src/protocol/official.ts';
import { canonicalRepo } from '../../../src/settings/marketplaces/git-url.ts';
import { hostOfGit, hostOfUrl } from '../../../src/settings/marketplaces/host-of.ts';
import { matchMarketplaceSource } from '../../../src/settings/marketplaces/index.ts';
import {
  directory,
  file,
  git,
  github,
  hostPattern,
  pathPattern,
  skillsDir,
} from '../../support/marketplace-sources.ts';

describe('canonicalRepo (judgment: one identity for every spelling of a repository)', () => {
  test('drops scheme, user, port, fragment, .git and trailing slashes; lowercases the host', () => {
    const same = [
      'https://GitHub.com/acme/plugins',
      'https://github.com/acme/plugins.git',
      'https://github.com/acme/plugins/',
      'https://github.com/acme/plugins.git/#v1',
      'git@github.com:acme/plugins.git',
      'github.com:acme/plugins',
      'ssh://git@github.com:22/acme/plugins.git',
    ];
    for (const spelling of same) {
      expect(canonicalRepo(spelling)).toEqual({ host: 'github.com', path: 'acme/plugins' });
    }
  });

  test('keeps the case of the path and tells hosts apart', () => {
    expect(canonicalRepo('https://github.com/Acme/Plugins')?.path).toBe('Acme/Plugins');
    expect(canonicalRepo('https://gitlab.com/acme/plugins')?.host).toBe('gitlab.com');
  });

  test('a text with no host is its own identity under the empty host', () => {
    expect(canonicalRepo('/srv/git/plugins.git/')).toEqual({ host: '', path: '/srv/git/plugins' });
  });
});

describe('host extraction (judgment: forms the docs leave open)', () => {
  test('a host is lower case, without user or port', () => {
    expect(hostOfGit('ssh://git@GIT.Example.com:2222/tools/plugins.git', false)).toBe(
      'git.example.com',
    );
    expect(hostOfGit('git@Git.Example.com:tools/plugins.git', false)).toBe('git.example.com');
    expect(hostOfUrl('https://Plugins.Example.com:8443/m.json')).toBe('plugins.example.com');
  });

  test('a local path, a Windows drive and a bare word have no host in either mode', () => {
    for (const text of [
      '/srv/git/plugins',
      './plugins',
      '../plugins',
      '~/plugins',
      'C:/x',
      'C:\\x',
      'plugins',
    ]) {
      expect(hostOfGit(text, false)).toBeUndefined();
      expect(hostOfGit(text, true)).toBeUndefined();
    }
  });

  test('a url source that does not parse has no host; file URLs have none either', () => {
    expect(hostOfUrl('not a url')).toBeUndefined();
    expect(hostOfUrl('file:///opt/marketplace.json')).toBeUndefined();
  });
});

describe('regex flavour (judgment: JavaScript RegExp, matched anywhere)', () => {
  test('a pattern that does not compile matches nothing in either list', () => {
    for (const list of ['strict', 'blocked'] as const) {
      expect(matchMarketplaceSource(list, hostPattern('('), github('acme/plugins'))).toBe(false);
      expect(matchMarketplaceSource(list, pathPattern('['), directory('/opt/x'))).toBe(false);
    }
  });
});

describe('sources that are not marketplaces', () => {
  test('a pattern or skills-dir entry is never itself matched as a source', () => {
    for (const list of ['strict', 'blocked'] as const) {
      expect(matchMarketplaceSource(list, hostPattern('.*'), hostPattern('.*'))).toBe(false);
      expect(matchMarketplaceSource(list, pathPattern('.*'), pathPattern('.*'))).toBe(false);
      expect(matchMarketplaceSource(list, skillsDir, skillsDir)).toBe(false);
    }
  });
});

describe('npm entries (judgment: from the SDK type comments, the docs table has no npm row)', () => {
  const entry = { source: 'npm', package: '@acme/claude-marketplace' } as const;
  const scoped = { source: 'npm', package: '@acme/*' } as const;
  const pinned = {
    source: 'npm',
    package: 'pkg',
    registry: 'https://npm.example.com/api/',
  } as const;

  test('a package name matches exactly; "@scope/*" matches every package of the scope only', () => {
    for (const list of ['strict', 'blocked'] as const) {
      expect(
        matchMarketplaceSource(list, entry, { source: 'npm', package: '@acme/claude-marketplace' }),
      ).toBe(true);
      expect(matchMarketplaceSource(list, entry, { source: 'npm', package: '@acme/other' })).toBe(
        false,
      );
      expect(matchMarketplaceSource(list, scoped, { source: 'npm', package: '@acme/other' })).toBe(
        true,
      );
      expect(
        matchMarketplaceSource(list, scoped, { source: 'npm', package: '@acme-evil/other' }),
      ).toBe(false);
      expect(matchMarketplaceSource(list, scoped, { source: 'npm', package: '@acme/a/b' })).toBe(
        false,
      );
    }
  });

  test('an entry with a registry prefix needs the source to name a registry under it', () => {
    const under = {
      source: 'npm',
      package: 'pkg',
      registry: 'https://npm.example.com/api/v1',
    } as const;
    expect(matchMarketplaceSource('strict', pinned, under)).toBe(true);
    expect(matchMarketplaceSource('strict', pinned, { source: 'npm', package: 'pkg' })).toBe(false);
    expect(
      matchMarketplaceSource('strict', pinned, {
        source: 'npm',
        package: 'pkg',
        registry: 'https://evil.example/api/',
      }),
    ).toBe(false);
  });

  test('the version is not compared and an npm entry matches no other kind', () => {
    expect(matchMarketplaceSource('strict', entry, { ...entry, version: '9.9.9' })).toBe(true);
    expect(matchMarketplaceSource('strict', entry, github('@acme/claude-marketplace'))).toBe(false);
    expect(matchMarketplaceSource('strict', hostPattern('.*'), entry)).toBe(false);
  });
});

const inline = (name: string): MarketplaceSource => ({ source: 'settings', name, plugins: [] });

describe('settings entries (judgment)', () => {
  test('match the inline marketplace of the same name only', () => {
    expect(matchMarketplaceSource('strict', inline('inline'), inline('inline'))).toBe(true);
    expect(matchMarketplaceSource('strict', inline('inline'), inline('other'))).toBe(false);
  });
});

describe('exact entries of the same kind only', () => {
  test('file and directory entries do not cross', () => {
    for (const list of ['strict', 'blocked'] as const) {
      expect(matchMarketplaceSource(list, file('/opt/m'), directory('/opt/m'))).toBe(false);
      expect(matchMarketplaceSource(list, directory('/opt/m'), directory('/opt/m'))).toBe(true);
    }
  });

  test('a git entry never matches a github source under the strict list', () => {
    expect(matchMarketplaceSource('strict', git('https://github.com/a/b'), github('a/b'))).toBe(
      false,
    );
  });
});
