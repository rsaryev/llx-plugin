/**
 * settings-reference.md § `extraKnownMarketplaces` ("Marketplace source types": the `settings` source,
 * its `name` and external plugins; `headersHelper` ignored from an `--add-dir` directory; `autoUpdate`
 * defaults), plugins/org.md § "Require a marketplace and its plugins" (official marketplace implied by
 * `enabledPlugins`), § "Turn auto-update on or off per marketplace", plugins/loading.md § "Which
 * marketplaces and plugins auto-update".
 */
import { describe, expect, test } from 'bun:test';
import { plain } from '../../support/settings-layers.ts';
import { github } from '../../support/marketplace-sources.ts';
import { ofName, plan } from '../../support/marketplace-registry.ts';
import { spec } from '../../support/spec.ts';

const inline = (name: string, plugins: readonly unknown[]) => ({
  extraKnownMarketplaces: { 'team-tools': { source: { source: 'settings', name, plugins } } },
});

const helped = (headersHelper: string) => ({
  extraKnownMarketplaces: {
    m: {
      source: {
        source: 'url',
        url: 'https://m.example.com/marketplace.json',
        headers: { 'X-Team': 'a' },
        headersHelper,
      },
    },
    'team-tools': {
      source: {
        source: 'settings',
        name: 'team-tools',
        plugins: [
          {
            name: 'p',
            source: { source: 'archive', url: 'https://a.example.com/p.zip' },
            headers: { 'X-Team': 'a' },
            headersHelper,
          },
        ],
      },
    },
  },
});

const entry = (extra: object) => ({
  extraKnownMarketplaces: { m: { source: github('a/b'), ...extra } },
});

spec('settings.key.extraKnownMarketplaces', () => {
  describe('the `settings` source', () => {
    const formatter = {
      name: 'code-formatter',
      source: { source: 'github', repo: 'acme-corp/code-formatter' },
    };

    test('the docs example, an inline marketplace with one GitHub plugin, registers', () => {
      expect(plan([['user', inline('team-tools', [formatter])]])[0]?.status).toBe('register');
    });

    test('its name must match the marketplace key', () => {
      const [only] = plan([['user', inline('other-name', [formatter])]]);
      expect(only?.status).toBe('invalid');
      expect(only?.issues[0]?.message).toContain('"other-name"');
    });

    test('its plugins must reference external sources such as GitHub or npm', () => {
      const external = [
        { name: 'a', source: { source: 'npm', package: '@acme/a' } },
        { name: 'b', source: { source: 'url', url: 'https://g.example.com/b.git' } },
        { name: 'c', source: { source: 'archive', url: 'https://a.example.com/c.zip' } },
        { name: 'd', source: { source: 'git-subdir', url: 'acme/mono', path: 'tools/d' } },
        formatter,
      ];
      expect(plan([['user', inline('team-tools', external)]])[0]?.status).toBe('register');
      for (const local of ['./plugins/e', '../plugins/e']) {
        const [only] = plan([
          ['user', inline('team-tools', [formatter, { name: 'e', source: local }])],
        ]);
        expect(only?.status).toBe('invalid');
        expect(only?.issues[0]?.message).toContain('"e"');
      }
    });
  });

  describe('headersHelper', () => {
    test('is ignored in an --add-dir directory, on a url source and on an inline plugin entry alike; the fixed headers stay', () => {
      const registrations = plan([['addDir', helped('/opt/bin/mint')]]);
      const text = JSON.stringify(registrations.map((r) => r.entry.source));
      expect(text).not.toContain('headersHelper');
      expect(text).not.toContain('/opt/bin/mint');
      expect(text.match(/X-Team/g)).toHaveLength(2);
      expect(registrations.map((r) => r.status)).toEqual(['register', 'register']);
    });

    test('is kept from user, project, local, --settings and managed files', () => {
      for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
        const registrations = plan([[scope, helped('/opt/bin/mint')]]);
        expect(
          JSON.stringify(registrations.map((r) => r.entry.source)).match(/\/opt\/bin\/mint/g),
        ).toHaveLength(2);
      }
    });
  });

  describe('autoUpdate', () => {
    test('an explicit value is used, either way', () => {
      expect(ofName(plan([['user', entry({ autoUpdate: true })]]), 'm').entry.autoUpdate).toBe(
        true,
      );
      expect(ofName(plan([['user', entry({ autoUpdate: false })]]), 'm').entry.autoUpdate).toBe(
        false,
      );
    });

    test('omitted: false for a third-party marketplace', () => {
      expect(ofName(plan([['user', entry({})]]), 'm').entry.autoUpdate).toBe(false);
    });

    test('omitted: true for claude-plugins-official and for the other official marketplaces the host lists', () => {
      const official = {
        extraKnownMarketplaces: {
          'claude-plugins-official': { source: github('anthropics/claude-plugins-official') },
          'partner-plugins': { source: github('anthropics/partner') },
          'third-party': { source: github('x/y') },
        },
      };
      const registrations = plan([['user', official]], {
        officialMarketplaces: ['claude-plugins-official', 'partner-plugins'],
      });
      expect(registrations.map((r) => [r.name, r.entry.autoUpdate])).toEqual([
        ['claude-plugins-official', true],
        ['partner-plugins', true],
        ['third-party', false],
      ]);
    });

    test('an explicit false on the official marketplace turns it off', () => {
      const registrations = plan([
        [
          'user',
          {
            extraKnownMarketplaces: {
              'claude-plugins-official': {
                source: github('anthropics/claude-plugins-official'),
                autoUpdate: false,
              },
            },
          },
        ],
      ]);
      expect(registrations[0]?.entry.autoUpdate).toBe(false);
    });

    test('a managed entry that sets the field fixes it for the user; one that leaves it unset does not', () => {
      const fixed = plan([['managed', entry({ autoUpdate: false })]]);
      expect(ofName(fixed, 'm').autoUpdateFixed).toBe(true);
      expect(ofName(plan([['managed', entry({})]]), 'm').autoUpdateFixed).toBe(false);
      expect(ofName(plan([['user', entry({ autoUpdate: true })]]), 'm').autoUpdateFixed).toBe(
        false,
      );
    });
  });

  describe('the official marketplace named by enabledPlugins', () => {
    const OFFICIAL = 'claude-plugins-official';
    const enabling = (enabled: boolean, id = `telegram@${OFFICIAL}`) => ({
      enabledPlugins: { [id]: enabled },
    });

    test('a plugin set to true declares the marketplace by itself, from the official source and with auto-update on', () => {
      const registrations = plan([['managed', enabling(true)]]);
      const official = ofName(registrations, OFFICIAL);
      expect(plain(official.entry)).toEqual({
        source: github('anthropics/claude-plugins-official'),
        autoUpdate: true,
      });
      expect(official.from).toBe('managed');
      expect(official.implied).toBe(true);
    });

    test('wherever the key applies: user and project files too, with no trust asked', () => {
      for (const scope of ['user', 'project', 'local'] as const) {
        const registrations = plan([[scope, enabling(true)]], { isFolderTrusted: () => false });
        expect(ofName(registrations, OFFICIAL).from).toBe(scope);
      }
    });

    test('a false, no entry, or a plugin of another marketplace declares nothing', () => {
      expect(plan([['managed', enabling(false)]])).toEqual([]);
      expect(plan([['managed', enabling(true, 'telegram@acme-tools')]])).toEqual([]);
      expect(plan([['managed', {}]])).toEqual([]);
    });

    test('a managed false beats a user true', () => {
      expect(
        plan([
          ['managed', enabling(false)],
          ['user', enabling(true)],
        ]),
      ).toEqual([]);
    });

    test('an explicit entry of that name wins over the implied one', () => {
      const registrations = plan([
        ['managed', enabling(true)],
        [
          'user',
          {
            extraKnownMarketplaces: {
              [OFFICIAL]: {
                source: github('anthropics/claude-plugins-official'),
                autoUpdate: false,
              },
            },
          },
        ],
      ]);
      expect(registrations).toHaveLength(1);
      expect(registrations[0]?.implied).toBe(false);
      expect(registrations[0]?.entry.autoUpdate).toBe(false);
    });

    test('it registers only when the allowlist permits it', () => {
      const [refused] = plan([
        ['managed', { ...enabling(true), strictKnownMarketplaces: [github('acme-corp/plugins')] }],
      ]);
      expect(refused?.status).toBe('refusedByAllowlist');
      const [allowed] = plan([
        [
          'managed',
          {
            ...enabling(true),
            strictKnownMarketplaces: [github('anthropics/claude-plugins-official')],
          },
        ],
      ]);
      expect(allowed?.status).toBe('register');
    });
  });
});
