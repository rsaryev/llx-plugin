/**
 * settings-reference.md § `blockedMarketplaces`, plugins/org.md § "Restrict what users can install"
 * (checks before download and at session start, the two quoted messages), "Blocklist with
 * `blockedMarketplaces`" ("checked first", `skills-dir`, not an active restriction).
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf } from '../../support/settings-layers.ts';
import {
  gateOf,
  git,
  github,
  hostPattern,
  managed,
  official,
  skillsDir,
} from '../../support/marketplace-sources.ts';
import { spec } from '../../support/spec.ts';

spec('settings.key.blockedMarketplaces', () => {
  describe('the blocklist as a gate', () => {
    test('unset: no marketplace is blocked', () => {
      expect(managed({}).check(github('untrusted/plugins'))).toEqual({ allowed: true });
    });

    test('a blocked source fails before download with "is blocked by enterprise policy"', () => {
      const gate = managed({ blockedMarketplaces: [github('untrusted/plugins')] });
      const verdict = gate.check(github('untrusted/plugins'));
      expect(verdict.allowed).toBe(false);
      if (verdict.allowed) return;
      expect(verdict.by).toBe('blockedMarketplaces');
      expect(verdict.message).toContain('is blocked by enterprise policy');
      expect(verdict.message).toContain('untrusted/plugins');
      expect(gate.check(github('trusted/plugins'))).toEqual({ allowed: true });
    });

    test('an installed marketplace whose source is blocked is listed as "blocked by enterprise policy"', () => {
      const gate = managed({ blockedMarketplaces: [github('untrusted/*')] });
      expect(gate.checkRegistered('shady', github('untrusted/plugins'))).toEqual({
        loads: false,
        message: 'Marketplace "shady" is blocked by enterprise policy',
      });
      expect(gate.checkRegistered('fine', github('trusted/plugins'))).toEqual({ loads: true });
    });

    test('it does not block a marketplace registered from a source it does not match', () => {
      const gate = managed({ blockedMarketplaces: [github('untrusted/plugins')] });
      expect(
        gate.checkRegistered('mirror', git('https://mirror.example.com/untrusted/plugins.git')),
      ).toEqual({
        loads: true,
      });
    });

    test('the blocklist is checked first: a source on both lists is blocked by the blocklist', () => {
      const gate = managed({
        strictKnownMarketplaces: [github('acme-corp/*')],
        blockedMarketplaces: [github('acme-corp/secret')],
      });
      const verdict = gate.check(github('acme-corp/secret'));
      expect(verdict.allowed).toBe(false);
      if (!verdict.allowed) expect(verdict.by).toBe('blockedMarketplaces');
      expect(gate.checkRegistered('s', github('acme-corp/secret'))).toEqual({
        loads: false,
        message: 'Marketplace "s" is blocked by enterprise policy',
      });
      expect(gate.check(github('acme-corp/ok'))).toEqual({ allowed: true });
      const outside = gate.check(github('elsewhere/ok'));
      if (!outside.allowed) expect(outside.by).toBe('strictKnownMarketplaces');
    });

    test('blocklists of the managed and parent sources are combined', () => {
      const gate = gateOf(
        ['managed', { blockedMarketplaces: [github('untrusted/a')] }],
        ['parent', { blockedMarketplaces: [github('untrusted/b')] }],
      );
      expect(gate.check(github('untrusted/a')).allowed).toBe(false);
      expect(gate.check(github('untrusted/b')).allowed).toBe(false);
      expect(gate.check(github('untrusted/c')).allowed).toBe(true);
    });

    test('it applies only in managed settings: a user file cannot set it', () => {
      const gate = gateOf(['user', { blockedMarketplaces: [github('untrusted/plugins')] }]);
      expect(gate.check(github('untrusted/plugins'))).toEqual({ allowed: true });
    });

    test('a hostPattern that does not compile is kept with a warning and blocks nothing, yet the restriction stays active', () => {
      const raw = { blockedMarketplaces: [hostPattern('('), github('untrusted/plugins')] };
      expect(issuesOf('managed', raw).some((issue) => issue.severity === 'warning')).toBe(true);
      const gate = managed(raw);
      expect(gate.restrictionActive()).toBe(true);
      expect(gate.check(github('untrusted/plugins')).allowed).toBe(false);
      expect(gate.check(github('trusted/plugins')).allowed).toBe(true);
      expect(managed({ blockedMarketplaces: [hostPattern('(')] }).restrictionActive()).toBe(true);
    });

    test('an entry that is not a marketplace source is stripped; a wholly invalid value is dropped with a warning', () => {
      expect(managed({ blockedMarketplaces: [{ source: 'github' }] }).restrictionActive()).toBe(
        false,
      );
      const dropped = managed({ blockedMarketplaces: 'github' });
      expect(dropped.check(official)).toEqual({ allowed: true });
      expect(issuesOf('managed', { blockedMarketplaces: 'github' }).length).toBeGreaterThan(0);
    });

    test('a marketplace Claude Code cannot find does not load once the blocklist names a source', () => {
      const gate = managed({ blockedMarketplaces: [github('untrusted/plugins')] });
      expect(gate.restrictionActive()).toBe(true);
      expect(gate.checkMissing('stale')).toEqual({
        loads: false,
        message: 'Marketplace "stale" is blocked by enterprise policy',
      });
    });

    test('a blocklist that names only skills-dir is not an active restriction', () => {
      const gate = managed({ blockedMarketplaces: [skillsDir] });
      expect(gate.restrictionActive()).toBe(false);
      expect(gate.checkMissing('stale')).toEqual({ loads: true });
      expect(managed({ blockedMarketplaces: [skillsDir, github('a/b')] }).restrictionActive()).toBe(
        true,
      );
    });

    test('a skills-dir entry stops skills-directory plugins loading from both locations', () => {
      expect(
        managed({ blockedMarketplaces: [github('a/b')] }).skillsDirectoryPlugins().admitted,
      ).toBe(true);
      expect(managed({ blockedMarketplaces: [skillsDir] }).skillsDirectoryPlugins()).toEqual({
        admitted: false,
        by: 'blockedMarketplaces',
      });
    });

    test('the blocklist wins over an allowlist skills-dir entry for skills-directory plugins', () => {
      const gate = managed({
        strictKnownMarketplaces: [skillsDir],
        blockedMarketplaces: [skillsDir],
      });
      expect(gate.skillsDirectoryPlugins()).toEqual({ admitted: false, by: 'blockedMarketplaces' });
    });
  });
});
