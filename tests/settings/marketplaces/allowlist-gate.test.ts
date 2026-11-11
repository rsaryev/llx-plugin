/**
 * settings-reference.md § `strictKnownMarketplaces` ("Allowed source types": `skills-dir`; "Allow only
 * the official marketplace"), plugins/org.md § "Restrict what users can install" (the quoted
 * messages), "Keep skills-directory plugins loading", "Lock every source out", "Allow the official
 * marketplace and your own".
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf } from '../../support/settings-layers.ts';
import {
  admits,
  directory,
  gateOf,
  git,
  github,
  hostPattern,
  managed,
  official,
  skillsDir,
  url,
} from '../../support/marketplace-sources.ts';
import { spec } from '../../support/spec.ts';

spec(
  [
    'settings.key.strictKnownMarketplaces',
    'policy.org.Control matrix.strictKnownMarketplaces',
    'policy.org.Control matrix',
    'policy.org.Allowlist with strictKnownMarketplaces.skills-dir',
    'policy.reference.Allowed source types.skills-dir',
    'policy.reference.Allow only the official marketplace',
    'policy.org.Allow the official marketplace and your own',
    'policy.org.Lock every source out',
    'policy.org.Restrict what users can install',
    'policy.org.Restrict what users can install.Before a download',
    'policy.org.Restrict what users can install.At session start',
    'policy.org.Keep skills-directory plugins loading',
    'policy.reference.Marketplace key aliases',
    'policy.org.Aliases for the marketplace keys',
    'policy.troubleshooting.Marketplace "<name>" is not in the allowed marketplace list',
    "policy.troubleshooting.Marketplace source '<source>' is blocked by enterprise policy",
  ],
  () => {
    describe('skills-dir', () => {
      test('a skills-dir entry matches no marketplace', () => {
        for (const source of [
          github('a/b'),
          url('https://x.example/m.json'),
          directory('/opt/x'),
          skillsDir,
        ]) {
          expect(admits(skillsDir, source)).toBe(false);
        }
      });

      test('locking any customization type stops skills-directory plugins whether or not the entry is present', () => {
        const withEntry = { strictKnownMarketplaces: [github('a/b'), skillsDir] };
        const locked = { admitted: false, by: 'strictPluginOnlyCustomization' } as const;
        expect(
          managed({ ...withEntry, strictPluginOnlyCustomization: true }).skillsDirectoryPlugins(),
        ).toEqual(locked);
        expect(
          managed({
            ...withEntry,
            strictPluginOnlyCustomization: ['mcp'],
          }).skillsDirectoryPlugins(),
        ).toEqual(locked);
        expect(
          managed({ strictPluginOnlyCustomization: ['hooks'] }).skillsDirectoryPlugins(),
        ).toEqual(locked);
        expect(
          managed({ ...withEntry, strictPluginOnlyCustomization: [] }).skillsDirectoryPlugins(),
        ).toEqual({ admitted: true });
        expect(
          managed({ ...withEntry, strictPluginOnlyCustomization: false }).skillsDirectoryPlugins(),
        ).toEqual({ admitted: true });
      });

      test('any allowlist, even an empty one, stops skills-directory plugins; the entry keeps them', () => {
        expect(managed({}).skillsDirectoryPlugins().admitted).toBe(true);
        expect(managed({ strictKnownMarketplaces: [] }).skillsDirectoryPlugins()).toEqual({
          admitted: false,
          by: 'strictKnownMarketplaces',
        });
        expect(
          managed({ strictKnownMarketplaces: [github('a/b')] }).skillsDirectoryPlugins().admitted,
        ).toBe(false);
        expect(
          managed({ strictKnownMarketplaces: [github('a/b'), skillsDir] }).skillsDirectoryPlugins()
            .admitted,
        ).toBe(true);
      });

      test('the entry admits no marketplace itself: only the skills-dir entry leaves every source locked out', () => {
        const gate = managed({ strictKnownMarketplaces: [skillsDir] });
        expect(gate.check(official).allowed).toBe(false);
        expect(gate.check(github('a/b')).allowed).toBe(false);
      });
    });

    describe('the allowlist as a gate', () => {
      test('unset: users can add any marketplace', () => {
        expect(managed({}).check(github('anyone/anything'))).toEqual({ allowed: true });
        expect(gateOf().check(url('https://x.example/m.json'))).toEqual({ allowed: true });
      });

      test('[] is a complete lockdown that blocks every source, including the official marketplace', () => {
        const gate = managed({ strictKnownMarketplaces: [] });
        for (const source of [
          official,
          github('a/b'),
          url('https://x.example/m.json'),
          directory('/opt/x'),
        ]) {
          const verdict = gate.check(source);
          expect(verdict.allowed).toBe(false);
          if (!verdict.allowed) expect(verdict.by).toBe('strictKnownMarketplaces');
        }
      });

      test('[] ends the message with "No external marketplaces are allowed." rather than a list', () => {
        expect(managed({ strictKnownMarketplaces: [] }).check(github('a/b'))).toEqual({
          allowed: false,
          by: 'strictKnownMarketplaces',
          message:
            "Marketplace source 'github:a/b' is blocked by enterprise policy. No external marketplaces are allowed.",
        });
      });

      test('allow only the official marketplace: its repository is admitted, others are not', () => {
        const gate = managed({ strictKnownMarketplaces: [official] });
        expect(gate.check(official)).toEqual({ allowed: true });
        expect(gate.check(github('acme-corp/plugins')).allowed).toBe(false);
        expect(
          gate.check(git('https://github.com/anthropics/claude-plugins-official.git')).allowed,
        ).toBe(false);
      });

      test('a source outside the list fails with "is blocked by enterprise policy" followed by the allowed sources', () => {
        const gate = managed({
          strictKnownMarketplaces: [official, github('your-org/*'), skillsDir],
        });
        const verdict = gate.check(git('https://example.com/other-marketplace.git'));
        expect(verdict.allowed).toBe(false);
        expect(verdict).toEqual({
          allowed: false,
          by: 'strictKnownMarketplaces',
          message:
            "Marketplace source 'git:https://example.com/other-marketplace.git' is blocked by enterprise policy. Allowed sources: github:anthropics/claude-plugins-official, github:your-org/*, skills-dir",
        });
        expect(gate.check(github('your-org/your-marketplace'))).toEqual({ allowed: true });
      });

      test('an installed marketplace whose source no longer matches is listed as "not in the allowed marketplace list"', () => {
        const gate = managed({ strictKnownMarketplaces: [github('acme-corp/approved')] });
        expect(gate.checkRegistered('acme-tools', github('acme-corp/approved'))).toEqual({
          loads: true,
        });
        expect(gate.checkRegistered('acme-tools', github('acme-corp/other'))).toEqual({
          loads: false,
          message:
            'Marketplace "acme-tools" is not in the allowed marketplace list\nAllowed sources: github:acme-corp/approved',
        });
      });

      test('the load-time message points to the administrator when the allowlist is empty', () => {
        const gate = managed({ strictKnownMarketplaces: [] });
        const expected = {
          loads: false,
          message:
            'Marketplace "acme-tools" is not in the allowed marketplace list\nContact your administrator to configure allowed marketplace sources',
        };
        expect(gate.checkRegistered('acme-tools', github('acme-corp/other'))).toEqual(expected);
        expect(gate.checkMissing('acme-tools')).toEqual(expected);
      });

      test('a shorthand that points at github.com while the allowlist admits a host by hostname adds a Tip', () => {
        const gate = managed({
          strictKnownMarketplaces: [hostPattern('^git\\.internal\\.example$')],
        });
        expect(gate.check(github('acme-corp/tools'))).toEqual({
          allowed: false,
          by: 'strictKnownMarketplaces',
          message:
            "Marketplace source 'github:acme-corp/tools' is blocked by enterprise policy. Allowed sources: hostPattern:^git\\.internal\\.example$\nTip: the owner/repo shorthand assumes github.com. If the repository lives on your internal host, add it again with its full URL, such as git@your-git-host.com:owner/repo.git",
        });
      });

      test('no Tip without a hostname entry or for a source that is not the shorthand', () => {
        const none = managed({ strictKnownMarketplaces: [github('acme-corp/approved')] }).check(
          github('acme-corp/tools'),
        );
        expect(!none.allowed && none.message.includes('Tip:')).toBe(false);
        const full = managed({ strictKnownMarketplaces: [hostPattern('^git\\.internal$')] }).check(
          git('git@elsewhere.example:acme-corp/tools.git'),
        );
        expect(!full.allowed && full.message.includes('Tip:')).toBe(false);
      });

      test('a marketplace Claude Code cannot find does not load while any allowlist is set, with the policy error', () => {
        const gate = managed({ strictKnownMarketplaces: [github('acme-corp/approved')] });
        expect(gate.restrictionActive()).toBe(true);
        expect(gate.checkMissing('stale-marketplace')).toEqual({
          loads: false,
          message:
            'Marketplace "stale-marketplace" is not in the allowed marketplace list\nAllowed sources: github:acme-corp/approved',
        });
        expect(managed({}).restrictionActive()).toBe(false);
        expect(managed({}).checkMissing('stale-marketplace')).toEqual({ loads: true });
        expect(managed({ strictKnownMarketplaces: [] }).restrictionActive()).toBe(true);
      });

      test('the allowlist is taken whole from the highest managed source, never combined', () => {
        const gate = gateOf(
          ['managed', { strictKnownMarketplaces: [github('acme-corp/a')] }],
          ['parent', { strictKnownMarketplaces: [github('acme-corp/b')] }],
        );
        expect(gate.check(github('acme-corp/a')).allowed).toBe(true);
        expect(gate.check(github('acme-corp/b')).allowed).toBe(false);
      });

      test('a parent-supplied allowlist applies only when no managed source sets one (managed-settings.md, parent settings)', () => {
        const gate = gateOf(['parent', { strictKnownMarketplaces: [github('acme-corp/b')] }]);
        expect(gate.check(github('acme-corp/b')).allowed).toBe(true);
        expect(gate.check(github('acme-corp/a')).allowed).toBe(false);
      });

      test('it applies only in managed settings: a user or project file cannot set it', () => {
        const gate = gateOf(
          ['user', { strictKnownMarketplaces: [] }],
          ['project', { strictKnownMarketplaces: [] }],
        );
        expect(gate.check(github('a/b'))).toEqual({ allowed: true });
        expect(gate.restrictionActive()).toBe(false);
      });

      test('the alias allowedMarketplaces is the same allowlist', () => {
        const gate = managed({ allowedMarketplaces: [github('acme-corp/approved')] });
        expect(gate.check(github('acme-corp/approved')).allowed).toBe(true);
        expect(gate.check(github('acme-corp/other')).allowed).toBe(false);
      });

      test('an entry that can not be enforced is stripped and the valid subset is enforced', () => {
        const raw = {
          strictKnownMarketplaces: [
            hostPattern('('),
            github('acme-corp/approved'),
            { source: 'github' },
          ],
        };
        expect(issuesOf('managed', raw).length).toBeGreaterThan(0);
        const gate = managed(raw);
        expect(gate.check(github('acme-corp/approved')).allowed).toBe(true);
        expect(gate.check(github('acme-corp/other')).allowed).toBe(false);
        expect(gate.check(url('https://x.example/m.json')).allowed).toBe(false);
      });

      test('unreadable in managed settings it is an empty allowlist: a total lockdown', () => {
        const gate = managed({ strictKnownMarketplaces: 'github' });
        expect(gate.check(official).allowed).toBe(false);
      });
    });
  },
);
