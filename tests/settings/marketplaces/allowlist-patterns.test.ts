/**
 * settings-reference.md § `strictKnownMarketplaces` ("Allowed source types": `hostPattern` host
 * extraction, `pathPattern`), plugins/org.md § "Allowlist with `strictKnownMarketplaces`"
 * ("Marketplaces hosted on claude.ai").
 */
import { describe, expect, test } from 'bun:test';
import {
  admits,
  directory,
  file,
  git,
  github,
  hostPattern,
  managed,
  pathPattern,
  url,
} from '../../support/marketplace-sources.ts';
import { spec } from '../../support/spec.ts';

spec(
  [
    'settings.key.strictKnownMarketplaces',
    'policy.org.Allowlist with strictKnownMarketplaces.hostPattern',
    'policy.org.Allowlist with strictKnownMarketplaces.pathPattern',
    'policy.reference.Allowed source types.hostPattern',
    'policy.rule.Source values valid only in policy lists',
    'policy.reference.Allowed source types.pathPattern',
  ],
  () => {
    describe('hostPattern', () => {
      const ghes = hostPattern('^github\\.example\\.com$');

      test('a github source always counts as github.com', () => {
        expect(admits(hostPattern('^github\\.com$'), github('acme-corp/plugins'))).toBe(true);
        expect(admits(ghes, github('acme-corp/plugins'))).toBe(false);
      });

      test('takes the hostname from a url source', () => {
        expect(admits(ghes, url('https://github.example.com/acme/m.json'))).toBe(true);
        expect(admits(ghes, url('https://github.example.com.evil.net/acme/m.json'))).toBe(false);
      });

      test('takes it from a git URL with a scheme: the hostname in the URL', () => {
        expect(admits(ghes, git('https://github.example.com/tools/plugins.git'))).toBe(true);
        expect(admits(ghes, git('ssh://git@github.example.com/tools/plugins.git'))).toBe(true);
        expect(admits(ghes, git('ssh://git@github.example.com:2222/tools/plugins.git'))).toBe(true);
        expect(admits(ghes, git('https://other.example.com/tools/plugins.git'))).toBe(false);
      });

      test('takes it from an SSH address without a scheme: the host between @ and :', () => {
        expect(admits(ghes, git('git@github.example.com:tools/plugins.git'))).toBe(true);
        expect(
          admits(
            hostPattern('^git\\.example\\.com$'),
            git('git@git.example.com:tools/plugins.git'),
          ),
        ).toBe(true);
        expect(admits(ghes, git('git@other.example.com:github.example.com/plugins.git'))).toBe(
          false,
        );
      });

      test('any other form without a scheme has no host, so no allowlist hostPattern matches it', () => {
        const anything = hostPattern('.*');
        for (const text of [
          'git.example.com:tools/plugins.git',
          'git.example.com/tools/plugins.git',
          'git.example.com',
          '/srv/git/plugins.git',
          './plugins',
        ]) {
          expect(admits(anything, git(text))).toBe(false);
        }
      });

      test('file and directory sources have no host and never match', () => {
        expect(admits(hostPattern('.*'), file('/opt/marketplace.json'))).toBe(false);
        expect(admits(hostPattern(''), directory('/opt/marketplaces'))).toBe(false);
      });

      test('the pattern matches anywhere in the host unless anchored', () => {
        expect(
          admits(hostPattern('example\\.com'), git('https://github.example.com/a/b.git')),
        ).toBe(true);
        expect(
          admits(hostPattern('^example\\.com$'), git('https://github.example.com/a/b.git')),
        ).toBe(false);
      });

      test('a hostPattern for claude.ai admits a marketplace hosted on claude.ai by its host', () => {
        const claudeAi = hostPattern('^claude\\.ai$');
        expect(admits(claudeAi, url('https://claude.ai/marketplaces/team/marketplace.json'))).toBe(
          true,
        );
        expect(admits(claudeAi, url('https://claude.ai.evil.example/marketplace.json'))).toBe(
          false,
        );
      });
    });

    describe('pathPattern', () => {
      test('is matched anywhere in the path of file and directory sources; ^ pins a prefix', () => {
        expect(admits(pathPattern('^/opt/approved/'), directory('/opt/approved/team'))).toBe(true);
        expect(
          admits(pathPattern('^/opt/approved/'), file('/opt/approved/m/marketplace.json')),
        ).toBe(true);
        expect(
          admits(pathPattern('^/opt/approved/'), directory('/home/me/opt/approved/team')),
        ).toBe(false);
        expect(admits(pathPattern('/opt/approved/'), directory('/home/me/opt/approved/team'))).toBe(
          true,
        );
      });

      test('".*" allows every local path and no network source', () => {
        expect(admits(pathPattern('.*'), directory('/anywhere/at/all'))).toBe(true);
        expect(admits(pathPattern('.*'), file('/anywhere/m.json'))).toBe(true);
        expect(admits(pathPattern('.*'), github('acme-corp/plugins'))).toBe(false);
        expect(admits(pathPattern('.*'), url('https://plugins.example.com/m.json'))).toBe(false);
        expect(admits(pathPattern('.*'), git('git@git.example.com:a/b.git'))).toBe(false);
      });

      test('hostPattern and pathPattern entries together allow network and filesystem sources', () => {
        const gate = managed({
          strictKnownMarketplaces: [hostPattern('^github\\.com$'), pathPattern('^/opt/approved/')],
        });
        expect(gate.check(github('a/b')).allowed).toBe(true);
        expect(gate.check(directory('/opt/approved/x')).allowed).toBe(true);
        expect(gate.check(directory('/tmp/x')).allowed).toBe(false);
      });
    });
  },
);
