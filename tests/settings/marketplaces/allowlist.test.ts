/**
 * settings-reference.md § `strictKnownMarketplaces` ("Allowed source types", "Owner wildcards",
 * "Exact matching"), plugins/org.md § "Allowlist with `strictKnownMarketplaces`" ("How entries match").
 */
import { describe, expect, test } from 'bun:test';
import { admits, directory, file, git, github, url } from '../../support/marketplace-sources.ts';
import { spec } from '../../support/spec.ts';

spec(
  [
    'settings.key.strictKnownMarketplaces',
    'policy.reference.Exact matching',
    'policy.rule.Source values valid only in policy lists',
    'policy.rule.Source objects in settings',
    'policy.org.How entries match',
    'policy.reference.Owner wildcards.Owner case',
    'policy.reference.Owner wildcards.path',
    'policy.reference.Owner wildcards.ref',
    'policy.org.Allowlist with strictKnownMarketplaces.github',
    'policy.org.Allowlist with strictKnownMarketplaces.git',
    'policy.org.Allowlist with strictKnownMarketplaces.url',
    'policy.org.Allowlist with strictKnownMarketplaces.file and directory',
    'policy.org.Allowlist with strictKnownMarketplaces.github owner wildcard',
    'policy.reference.Allowed source types.github',
    'policy.reference.Allowed source types.git',
    'policy.reference.Allowed source types.url',
    'policy.reference.Allowed source types.file',
    'policy.reference.Allowed source types.directory',
    "marketplace.hosting.Work around what a marketplace can't do.Restrict what else users install",
  ],
  () => {
    describe('exact matching', () => {
      test('repo, ref and path must match exactly, or be undefined on both sides (the doc pairs)', () => {
        const plain = github('acme-corp/plugins');
        const onMain = github('acme-corp/plugins', { ref: 'main' });
        const inDir = github('acme-corp/plugins', { path: 'marketplace' });
        expect(admits(plain, plain)).toBe(true);
        expect(admits(plain, onMain)).toBe(false);
        expect(admits(onMain, plain)).toBe(false);
        expect(admits(onMain, onMain)).toBe(true);
        expect(admits(onMain, github('acme-corp/plugins', { ref: 'v2' }))).toBe(false);
        expect(admits(inDir, plain)).toBe(false);
        expect(admits(plain, inDir)).toBe(false);
        expect(admits(inDir, inDir)).toBe(true);
      });

      test('a git entry compares url, ref and path exactly: slash, .git and scheme are different values', () => {
        const entry = git('https://gitlab.example.com/tools/plugins.git', { ref: 'production' });
        expect(
          admits(entry, git('https://gitlab.example.com/tools/plugins.git', { ref: 'production' })),
        ).toBe(true);
        expect(
          admits(entry, git('https://gitlab.example.com/tools/plugins', { ref: 'production' })),
        ).toBe(false);
        expect(
          admits(
            entry,
            git('https://gitlab.example.com/tools/plugins.git/', { ref: 'production' }),
          ),
        ).toBe(false);
        expect(
          admits(entry, git('ssh://gitlab.example.com/tools/plugins.git', { ref: 'production' })),
        ).toBe(false);
        expect(admits(entry, git('https://gitlab.example.com/tools/plugins.git'))).toBe(false);
      });

      test('an owner/repo entry does not cover a git URL that clones the same repository, and the reverse', () => {
        expect(
          admits(github('acme-corp/plugins'), git('https://github.com/acme-corp/plugins.git')),
        ).toBe(false);
        expect(
          admits(git('https://github.com/acme-corp/plugins.git'), github('acme-corp/plugins')),
        ).toBe(false);
      });

      test('owner and repo are case-sensitive', () => {
        expect(admits(github('acme-corp/plugins'), github('Acme-Corp/plugins'))).toBe(false);
        expect(admits(github('acme-corp/plugins'), github('acme-corp/Plugins'))).toBe(false);
      });

      test('a url entry matches on its url value; headers are not compared', () => {
        const entry = url('https://plugins.example.com/marketplace.json');
        const withHeaders = {
          source: 'url',
          url: 'https://plugins.example.com/marketplace.json',
          headers: { Authorization: 'Bearer token' },
        } as const;
        expect(admits(entry, withHeaders)).toBe(true);
        expect(admits(withHeaders, entry)).toBe(true);
        expect(admits(entry, url('https://plugins.example.com/other.json'))).toBe(false);
      });

      test('file and directory entries match their absolute path exactly', () => {
        expect(
          admits(
            file('/opt/acme-corp/plugins/marketplace.json'),
            file('/opt/acme-corp/plugins/marketplace.json'),
          ),
        ).toBe(true);
        expect(
          admits(
            file('/opt/acme-corp/plugins/marketplace.json'),
            file('/opt/acme-corp/plugins/other.json'),
          ),
        ).toBe(false);
        expect(
          admits(
            directory('/opt/acme-corp/approved-marketplaces'),
            directory('/opt/acme-corp/approved-marketplaces/'),
          ),
        ).toBe(false);
        expect(
          admits(
            directory('/opt/acme-corp/approved-marketplaces'),
            directory('/opt/acme-corp/approved-marketplaces'),
          ),
        ).toBe(true);
      });
    });

    describe('owner wildcards', () => {
      const wildcard = github('acme-corp/*');

      test('"<owner>/*" matches every repository under that owner', () => {
        expect(admits(wildcard, github('acme-corp/plugins'))).toBe(true);
        expect(admits(wildcard, github('acme-corp/anything-else'))).toBe(true);
      });

      test('and no other owner, not even a longer name or another case', () => {
        expect(admits(wildcard, github('other-corp/plugins'))).toBe(false);
        expect(admits(wildcard, github('acme-corp-evil/plugins'))).toBe(false);
        expect(admits(wildcard, github('Acme-Corp/plugins'))).toBe(false);
      });

      test('only the whole repository-name position can be a wildcard: *, */plugins and acme-corp/tools-* match nothing', () => {
        for (const repo of ['*', '*/plugins', 'acme-corp/tools-*', '*/*', 'acme-*/plugins']) {
          expect(admits(github(repo), github('acme-corp/plugins'))).toBe(false);
          expect(admits(github(repo), github('acme-corp/tools-x'))).toBe(false);
        }
      });

      test('the wildcard admits no source that itself carries one, and no git URL', () => {
        expect(admits(wildcard, github('acme-corp/*'))).toBe(false);
        expect(admits(wildcard, git('https://github.com/acme-corp/plugins.git'))).toBe(false);
      });

      test('follows the exact rules for ref and takes any path unless the entry pins one', () => {
        expect(admits(wildcard, github('acme-corp/plugins', { ref: 'main' }))).toBe(false);
        expect(
          admits(
            github('acme-corp/*', { ref: 'main' }),
            github('acme-corp/plugins', { ref: 'main' }),
          ),
        ).toBe(true);
        expect(admits(github('acme-corp/*', { ref: 'main' }), github('acme-corp/plugins'))).toBe(
          false,
        );
        expect(admits(wildcard, github('acme-corp/plugins', { path: 'any/where' }))).toBe(true);
        expect(
          admits(
            github('acme-corp/*', { path: 'marketplace' }),
            github('acme-corp/plugins', { path: 'marketplace' }),
          ),
        ).toBe(true);
        expect(
          admits(
            github('acme-corp/*', { path: 'marketplace' }),
            github('acme-corp/plugins', { path: 'other' }),
          ),
        ).toBe(false);
        expect(
          admits(github('acme-corp/*', { path: 'marketplace' }), github('acme-corp/plugins')),
        ).toBe(false);
      });
    });
  },
);
