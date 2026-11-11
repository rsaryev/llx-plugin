/**
 * settings-reference.md § `extraKnownMarketplaces` (Scope: any file, repository entries only after the
 * workspace trust dialog and otherwise "ignores them without a message"; `autoUpdate` defaults; "the
 * entry from the highest-precedence file whole ... inherits none of its fields"; "Marketplace source
 * types"; the `settings` source: "`name` must match the marketplace key", plugins "external";
 * `headersHelper` ignored from an `--add-dir` directory), § "Marketplace key aliases", plugins/org.md
 * § "Require a marketplace and its plugins" (a managed entry replaces a same-name entry, official
 * marketplace implied by `enabledPlugins`), § "Require plugins per repository", § "Allow the official
 * marketplace and your own" ("must itself pass the allowlist"), § "Turn auto-update on or off per
 * marketplace", plugins/loading.md § "Which marketplaces and plugins auto-update".
 */
import { describe, expect, test } from 'bun:test';
import { plain } from '../../support/settings-layers.ts';
import { github, git, url } from '../../support/marketplace-sources.ts';
import { inFolder, ofName, plan } from '../../support/marketplace-registry.ts';
import { spec } from '../../support/spec.ts';

const acme = { source: github('acme-corp/claude-plugins') };
const docsExample = {
  extraKnownMarketplaces: {
    'acme-tools': { source: { source: 'github', repo: 'acme-corp/claude-plugins' } },
    'security-plugins': {
      source: { source: 'git', url: 'https://git.example.com/security/plugins.git' },
    },
  },
};

spec(
  [
    'settings.key.extraKnownMarketplaces',
    'policy.reference.Marketplace source types',
    'policy.reference.Marketplace source types.Folder trust',
    'policy.rule.Source objects in settings',
    'policy.org.Require a marketplace and its plugins.source',
    'policy.org.Require a marketplace and its plugins.Marketplaces',
    'policy.reference.Marketplace source types.github',
    'policy.reference.Marketplace source types.git',
    'policy.reference.Marketplace source types.url',
    'policy.reference.Marketplace source types.file',
    'policy.reference.Marketplace source types.directory',
    'policy.reference.Combine with extraKnownMarketplaces.Settings file',
    'policy.reference.Combine with extraKnownMarketplaces.Purpose',
    'policy.reference.Combine with extraKnownMarketplaces.Can be overridden',
    'policy.reference.Combine with extraKnownMarketplaces.When enforced',
    'policy.reference.Combine with extraKnownMarketplaces.Source format',
    'policy.reference.Combine with extraKnownMarketplaces.Behavior',
  ],
  () => {
    describe('registering', () => {
      test('the docs example registers a GitHub marketplace and a self-hosted git one, each from its file', () => {
        const registrations = plan([['user', docsExample]]);
        expect(registrations.map((r) => [r.name, r.from, r.status])).toEqual([
          ['acme-tools', 'user', 'register'],
          ['security-plugins', 'user', 'register'],
        ]);
        expect(ofName(registrations, 'security-plugins').entry.source).toEqual(
          git('https://git.example.com/security/plugins.git'),
        );
      });

      test('nothing is planned when no file sets the key', () => {
        expect(plan([['user', {}]])).toEqual([]);
      });

      test('the documented source types all register', () => {
        const sources = [
          github('a/b'),
          git('https://g.example.com/a.git'),
          url('https://example.com/marketplace.json'),
          { source: 'file', path: '/opt/m/marketplace.json' },
          { source: 'directory', path: '/opt/m' },
        ];
        const entries = Object.fromEntries(sources.map((s, i) => [`m${i}`, { source: s }]));
        expect(plan([['user', { extraKnownMarketplaces: entries }]]).map((r) => r.status)).toEqual(
          sources.map(() => 'register'),
        );
      });
    });

    describe('the same name in more than one file', () => {
      const credentialed = {
        source: {
          source: 'url',
          url: 'https://m.example.com/a.json',
          headers: { Authorization: 't' },
        },
        autoUpdate: true,
      };
      const redefined = { source: { source: 'url', url: 'https://attacker.example.com/a.json' } };

      test('the highest-precedence file wins whole: no field, headers credential or autoUpdate is inherited', () => {
        const registrations = plan([
          ['user', { extraKnownMarketplaces: { m: credentialed } }],
          ['project', { extraKnownMarketplaces: { m: redefined } }],
        ]);
        const winner = ofName(registrations, 'm');
        expect(winner.from).toBe('project');
        expect(plain(winner.entry.source)).toEqual(redefined.source);
        expect(winner.entry.autoUpdate).toBe(false);
        const loser = ofName(registrations, 'm', 'shadowed');
        expect(loser.from).toBe('user');
      });

      test('a managed entry replaces a lower-precedence entry with the same name, the two do not merge', () => {
        const registrations = plan([
          ['user', { extraKnownMarketplaces: { 'your-marketplace': credentialed } }],
          [
            'managed',
            {
              extraKnownMarketplaces: {
                'your-marketplace': { source: github('your-org/your-marketplace') },
              },
            },
          ],
        ]);
        const winner = ofName(registrations, 'your-marketplace');
        expect(winner.from).toBe('managed');
        expect(plain(winner.entry)).toEqual({
          source: github('your-org/your-marketplace'),
          autoUpdate: false,
        });
      });

      test('names that differ do not collide: both register', () => {
        const registrations = plan([
          ['user', { extraKnownMarketplaces: { a: acme } }],
          ['project', { extraKnownMarketplaces: { b: acme } }],
        ]);
        expect(registrations.map((r) => r.status)).toEqual(['register', 'register']);
      });
    });

    describe('aliases', () => {
      test('additionalMarketplaces registers exactly as extraKnownMarketplaces', () => {
        const viaAlias = plan([['project', { additionalMarketplaces: { m: acme } }]]);
        const canonical = plan([['project', { extraKnownMarketplaces: { m: acme } }]]);
        expect(viaAlias).toEqual(canonical);
        expect(viaAlias).toHaveLength(1);
      });

      test('both spellings in one file: the canonical value is used and the alias ignored', () => {
        const registrations = plan([
          [
            'user',
            {
              additionalMarketplaces: { alias: acme },
              extraKnownMarketplaces: { canonical: acme },
            },
          ],
        ]);
        expect(registrations.map((r) => r.name)).toEqual(['canonical']);
      });
    });

    describe('workspace trust', () => {
      const repository = { extraKnownMarketplaces: { team: acme } };

      test('a project or local entry in a folder that is not trusted is ignored, without an issue', () => {
        for (const scope of ['project', 'local'] as const) {
          const [only, ...rest] = plan([[scope, repository]], { isFolderTrusted: () => false });
          expect(rest).toEqual([]);
          expect(only?.status).toBe('ignoredUntrusted');
          expect(only?.issues).toEqual([]);
        }
      });

      test('after the folder is trusted the entry registers', () => {
        for (const scope of ['project', 'local'] as const) {
          expect(plan([[scope, repository]])[0]?.status).toBe('register');
        }
      });

      test('the trust asked is the one of that file: a trusted project folder does not trust the local file', () => {
        const registrations = plan(
          [
            ['project', repository],
            ['local', { extraKnownMarketplaces: { other: acme } }],
          ],
          { isFolderTrusted: (scope) => scope === 'project' },
        );
        expect(registrations.map((r) => [r.name, r.status])).toEqual([
          ['other', 'ignoredUntrusted'],
          ['team', 'register'],
        ]);
      });

      test('user, --settings and managed files need no trust', () => {
        for (const scope of ['user', 'flag', 'managed'] as const) {
          const [only] = plan([[scope, repository]], { isFolderTrusted: () => false });
          expect(only?.status).toBe('register');
        }
      });

      test('an ignored entry is as if absent: the user entry of the same name then applies', () => {
        const registrations = plan(
          [
            ['user', { extraKnownMarketplaces: { team: { source: github('mine/plugins') } } }],
            inFolder({ extraKnownMarketplaces: { team: { source: github('repo/plugins') } } }),
          ],
          { isFolderTrusted: () => false },
        );
        expect(ofName(registrations, 'team').from).toBe('user');
        expect(ofName(registrations, 'team', 'ignoredUntrusted').from).toBe('project');
      });
    });

    describe('the allowlist', () => {
      const allowlist = {
        strictKnownMarketplaces: [
          github('anthropics/claude-plugins-official'),
          github('acme-corp/plugins'),
        ],
      };

      test('a managed entry whose source the allowlist does not match is refused, with the policy message', () => {
        const registrations = plan([
          [
            'managed',
            {
              ...allowlist,
              extraKnownMarketplaces: {
                ok: { source: github('acme-corp/plugins') },
                other: { source: github('someone/else') },
              },
            },
          ],
        ]);
        expect(ofName(registrations, 'ok').status).toBe('register');
        const refused = ofName(registrations, 'other', 'refusedByAllowlist');
        expect(refused.issues[0]?.severity).toBe('error');
        expect(refused.issues[0]?.message).toContain('is blocked by enterprise policy');
      });

      test('an empty allowlist locks every source out, a managed entry included', () => {
        const registrations = plan([
          [
            'managed',
            {
              strictKnownMarketplaces: [],
              extraKnownMarketplaces: { m: acme },
            },
          ],
        ]);
        expect(registrations[0]?.status).toBe('refusedByAllowlist');
      });

      test('the allowlist registers nothing by itself', () => {
        expect(plan([['managed', allowlist]])).toEqual([]);
      });
    });
  },
);
