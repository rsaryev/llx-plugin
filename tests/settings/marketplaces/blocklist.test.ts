/**
 * settings-reference.md § `blockedMarketplaces`, § `strictKnownMarketplaces` ("Owner wildcards", the
 * table of matching rules, `hostPattern` host extraction), plugins/org.md § "Blocklist with
 * `blockedMarketplaces`" (canonical git URLs, equivalence of `github` and `git`, `url` entries and
 * bare repository URLs).
 */
import { describe, expect, test } from 'bun:test';
import { matchMarketplaceSource } from '../../../src/settings/marketplaces/index.ts';
import {
  blocks,
  directory,
  file,
  git,
  github,
  hostPattern,
  pathPattern,
  url,
} from '../../support/marketplace-sources.ts';
import { spec } from '../../support/spec.ts';

/** Spellings of github.com/untrusted/plugins (plugins/org.md: `git@` and `https://`, `.git`, trailing slash). */
const SPELLINGS_OF_ONE_REPOSITORY = [
  'https://github.com/untrusted/plugins',
  'https://github.com/untrusted/plugins.git',
  'https://github.com/untrusted/plugins/',
  'https://github.com/untrusted/plugins.git/',
  'git@github.com:untrusted/plugins.git',
  'git@github.com:untrusted/plugins',
  'ssh://git@github.com/untrusted/plugins.git',
  'https://GitHub.com/untrusted/plugins',
];

spec(
  [
    'settings.key.blockedMarketplaces',
    'policy.org.Blocklist with blockedMarketplaces',
    'policy.reference.Owner wildcards.Matching source spellings',
  ],
  () => {
    describe('canonical git URLs', () => {
      test('git@ and https:// forms, .git suffixes and trailing slashes of one github.com repository match one entry', () => {
        for (const entry of [
          github('untrusted/plugins'),
          git('https://github.com/untrusted/plugins.git'),
        ]) {
          for (const spelling of SPELLINGS_OF_ONE_REPOSITORY) {
            expect(blocks(entry, git(spelling))).toBe(true);
          }
        }
      });

      test('a github entry also blocks the equivalent git URL, and the other way around', () => {
        expect(
          blocks(github('untrusted/plugins'), git('git@github.com:untrusted/plugins.git')),
        ).toBe(true);
        expect(
          blocks(git('git@github.com:untrusted/plugins.git'), github('untrusted/plugins')),
        ).toBe(true);
        expect(
          blocks(git('https://github.com/untrusted/plugins/'), github('untrusted/plugins')),
        ).toBe(true);
      });

      test('another repository, another host or another owner is not blocked', () => {
        const entry = github('untrusted/plugins');
        expect(blocks(entry, github('untrusted/other'))).toBe(false);
        expect(blocks(entry, git('https://gitlab.com/untrusted/plugins.git'))).toBe(false);
        expect(blocks(entry, git('https://github.com/trusted/plugins.git'))).toBe(false);
        expect(blocks(entry, git('https://github.com/untrusted/plugins-extra.git'))).toBe(false);
      });

      test('a git entry for another host is canonical too', () => {
        const entry = git('https://gitlab.example.com/tools/plugins.git');
        expect(blocks(entry, git('git@gitlab.example.com:tools/plugins'))).toBe(true);
        expect(blocks(entry, git('ssh://git@gitlab.example.com/tools/plugins/'))).toBe(true);
        expect(blocks(entry, github('tools/plugins'))).toBe(false);
      });

      test('an entry without ref or path blocks every ref and path of the repositories it matches', () => {
        const entry = github('untrusted/plugins');
        expect(blocks(entry, github('untrusted/plugins', { ref: 'v3' }))).toBe(true);
        expect(blocks(entry, github('untrusted/plugins', { path: 'marketplace' }))).toBe(true);
        expect(
          blocks(
            entry,
            git('https://github.com/untrusted/plugins.git', { ref: 'main', path: 'x' }),
          ),
        ).toBe(true);
      });

      test('a pinned ref or path narrows an entry: it blocks only that value', () => {
        const pinnedRef = github('untrusted/plugins', { ref: 'main' });
        expect(blocks(pinnedRef, github('untrusted/plugins', { ref: 'main' }))).toBe(true);
        expect(blocks(pinnedRef, github('untrusted/plugins', { ref: 'dev' }))).toBe(false);
        expect(blocks(pinnedRef, github('untrusted/plugins'))).toBe(false);
        const pinnedPath = github('untrusted/plugins', { path: 'a' });
        expect(blocks(pinnedPath, github('untrusted/plugins', { path: 'a' }))).toBe(true);
        expect(blocks(pinnedPath, github('untrusted/plugins', { path: 'b' }))).toBe(false);
        expect(blocks(pinnedPath, github('untrusted/plugins'))).toBe(false);
        const pinnedGit = git('https://gitlab.example.com/tools/plugins.git', {
          ref: 'main',
          path: 'a',
        });
        const at = (extra: { ref?: string; path?: string }) =>
          git('https://gitlab.example.com/tools/plugins.git', extra);
        expect(blocks(pinnedGit, at({ ref: 'main', path: 'a' }))).toBe(true);
        expect(blocks(pinnedGit, at({ ref: 'dev', path: 'a' }))).toBe(false);
        expect(blocks(pinnedGit, at({ ref: 'main', path: 'b' }))).toBe(false);
      });
    });

    describe('owner wildcards', () => {
      const wildcard = github('untrusted-org/*');

      test('"<owner>/*" blocks every repository under the owner, in any spelling', () => {
        expect(blocks(wildcard, github('untrusted-org/plugins'))).toBe(true);
        expect(blocks(wildcard, github('untrusted-org/anything', { ref: 'main', path: 'p' }))).toBe(
          true,
        );
        expect(blocks(wildcard, git('git@github.com:untrusted-org/plugins.git'))).toBe(true);
        expect(blocks(wildcard, git('https://github.com/untrusted-org/plugins'))).toBe(true);
      });

      test('the owner comparison is case-insensitive', () => {
        expect(blocks(wildcard, github('Untrusted-Org/plugins'))).toBe(true);
        expect(blocks(wildcard, git('https://github.com/UNTRUSTED-ORG/plugins.git'))).toBe(true);
        expect(blocks(github('Untrusted-Org/*'), github('untrusted-org/plugins'))).toBe(true);
      });

      test('another owner, another host and a deeper path are not blocked', () => {
        expect(blocks(wildcard, github('untrusted-org-2/plugins'))).toBe(false);
        expect(blocks(wildcard, git('https://gitlab.com/untrusted-org/plugins.git'))).toBe(false);
        expect(blocks(wildcard, git('https://github.com/untrusted-org/group/plugins.git'))).toBe(
          false,
        );
      });

      test('only the whole repository-name position can be a wildcard: other shapes block nothing', () => {
        for (const repo of ['*', '*/plugins', 'untrusted-org/tools-*', '*/*']) {
          expect(blocks(github(repo), github('untrusted-org/plugins'))).toBe(false);
          expect(blocks(github(repo), github('untrusted-org/tools-x'))).toBe(false);
        }
      });

      test('a pinned ref or path narrows the entry', () => {
        expect(
          blocks(
            github('untrusted-org/*', { ref: 'main' }),
            github('untrusted-org/p', { ref: 'main' }),
          ),
        ).toBe(true);
        expect(
          blocks(
            github('untrusted-org/*', { ref: 'main' }),
            github('untrusted-org/p', { ref: 'dev' }),
          ),
        ).toBe(false);
        expect(
          blocks(
            github('untrusted-org/*', { path: 'm' }),
            github('untrusted-org/p', { path: 'm' }),
          ),
        ).toBe(true);
        expect(blocks(github('untrusted-org/*', { path: 'm' }), github('untrusted-org/p'))).toBe(
          false,
        );
      });
    });

    describe('url entries', () => {
      test('a url entry blocks the same url', () => {
        const entry = url('https://plugins.example.com/marketplace.json');
        expect(blocks(entry, url('https://plugins.example.com/marketplace.json'))).toBe(true);
        expect(blocks(entry, url('https://plugins.example.com/other.json'))).toBe(false);
      });

      test('also apply to a bare https repository URL that is cloned: .git and a #ref are ignored', () => {
        const entry = url('https://gitlab.com/untrusted/plugins');
        expect(blocks(entry, git('https://gitlab.com/untrusted/plugins'))).toBe(true);
        expect(blocks(entry, git('https://gitlab.com/untrusted/plugins.git'))).toBe(true);
        expect(blocks(entry, git('https://gitlab.com/untrusted/plugins#v2'))).toBe(true);
        expect(blocks(entry, git('https://gitlab.com/untrusted/plugins.git#v2'))).toBe(true);
        expect(blocks(entry, git('https://gitlab.com/untrusted/other'))).toBe(false);
        expect(
          blocks(url('https://github.com/untrusted/plugins.git'), github('untrusted/plugins')),
        ).toBe(true);
      });
    });

    describe('hostPattern', () => {
      test('uses the same host extraction for github, url and scheme or user@host:path git sources', () => {
        expect(blocks(hostPattern('^github\\.com$'), github('a/b'))).toBe(true);
        expect(
          blocks(
            hostPattern('^plugins\\.example\\.com$'),
            url('https://plugins.example.com/m.json'),
          ),
        ).toBe(true);
        expect(
          blocks(hostPattern('^git\\.example\\.com$'), git('ssh://git@git.example.com/t/p.git')),
        ).toBe(true);
        expect(
          blocks(hostPattern('^git\\.example\\.com$'), git('git@git.example.com:t/p.git')),
        ).toBe(true);
        expect(
          blocks(hostPattern('^git\\.example\\.com$'), git('git@other.example.com:t/p.git')),
        ).toBe(false);
      });

      test('takes a host from a wider set of forms than the allowlist, so it can match a schemeless address', () => {
        const entry = hostPattern('^git\\.example\\.com$');
        for (const text of [
          'git.example.com:tools/plugins.git',
          'git.example.com/tools/plugins.git',
          'deploy@git.example.com/tools/plugins.git',
        ]) {
          expect(blocks(entry, git(text))).toBe(true);
          expect(matchMarketplaceSource('strict', entry, git(text))).toBe(false);
        }
      });

      test('a local path or file source has no host and is never blocked by a hostPattern', () => {
        expect(blocks(hostPattern('.*'), git('/srv/git/plugins.git'))).toBe(false);
        expect(blocks(hostPattern('.*'), file('/opt/marketplace.json'))).toBe(false);
        expect(blocks(hostPattern('.*'), directory('/opt/marketplaces'))).toBe(false);
      });

      test('a hostPattern for claude.ai blocks a marketplace hosted on claude.ai by its host', () => {
        expect(
          blocks(
            hostPattern('^claude\\.ai$'),
            url('https://claude.ai/marketplaces/team/marketplace.json'),
          ),
        ).toBe(true);
      });
    });

    describe('exact and path entries', () => {
      test('file and directory entries match their path; pathPattern matches anywhere in it', () => {
        expect(blocks(file('/opt/m/marketplace.json'), file('/opt/m/marketplace.json'))).toBe(true);
        expect(blocks(directory('/opt/m'), directory('/opt/m'))).toBe(true);
        expect(blocks(directory('/opt/m'), directory('/opt/m2'))).toBe(false);
        expect(blocks(pathPattern('^/tmp/'), directory('/tmp/x'))).toBe(true);
        expect(blocks(pathPattern('^/tmp/'), directory('/var/tmp/x'))).toBe(false);
        expect(blocks(pathPattern('.*'), github('a/b'))).toBe(false);
      });
    });
  },
);
