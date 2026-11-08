/**
 * settings-reference.md § `strictPluginOnlyCustomization` ("If you lock any surface, Claude Code also
 * stops loading skills-directory plugins, the plugin folders that users keep under `~/.claude/skills/`
 * or `.claude/skills/`"), plugins/loading.md § Skills-directory plugins blocked by managed settings
 * (the two restrictions that skip such a folder: a lock on "one or more kinds of customization", "a
 * `strictKnownMarketplaces` allowlist without a `{ "source": "skills-dir" }` entry, or a
 * `blockedMarketplaces` list with one"; "The whole plugin is skipped when any one kind is locked"),
 * plugins/org.md § Keep skills-directory plugins loading ("If you lock any customization type ...
 * they stop loading whether or not the entry is present. The allowlist doesn't apply to plain skills"),
 * managed-mcp.md § Choose how to control servers ("Plugin servers only": skills-directory plugins stop
 * loading as plugins).
 */
import { describe, expect, test } from 'bun:test';
import { skillsDir, github } from '../../support/marketplace-sources.ts';
import { customizationOf, locking } from '../../support/customization.ts';
import type { Source } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const SURFACES = ['skills', 'agents', 'hooks', 'mcp'] as const;
const admitted = (...sources: readonly Source[]): boolean =>
  customizationOf(sources).skillsDirPlugins().admitted;

spec('settings.key.strictPluginOnlyCustomization', () => {
  describe('skills-directory plugins', () => {
    test('load when nothing restricts them', () => {
      expect(customizationOf([]).skillsDirPlugins()).toEqual({ admitted: true });
    });

    test.each(SURFACES)(
      'stop loading when only %s is locked: any one kind skips the whole plugin',
      (surface) => {
        expect(customizationOf(locking([surface])).skillsDirPlugins()).toEqual({
          admitted: false,
          by: 'strictPluginOnlyCustomization',
        });
      },
    );

    test('stop loading under true', () => {
      expect(admitted(...locking(true))).toBe(false);
    });

    test('an empty array or an unknown name locks no kind and does not stop them', () => {
      expect(admitted(...locking([]))).toBe(true);
      expect(admitted(...locking(['plugins']))).toBe(true);
    });

    test('stop loading whether or not the allowlist has a skills-dir entry', () => {
      const strict = [github('acme/*'), skillsDir];
      for (const entries of [strict, [github('acme/*')]]) {
        const policy = customizationOf([
          [
            'managed',
            { strictPluginOnlyCustomization: ['hooks'], strictKnownMarketplaces: entries },
          ],
        ]);
        expect(policy.skillsDirPlugins().admitted).toBe(false);
      }
    });
  });

  describe('combined with the marketplace lists', () => {
    test('an allowlist without a skills-dir entry stops them, even an empty one', () => {
      for (const list of [[github('acme/*')], []]) {
        const policy = customizationOf([['managed', { strictKnownMarketplaces: list }]]);
        expect(policy.skillsDirPlugins()).toEqual({
          admitted: false,
          by: 'strictKnownMarketplaces',
        });
      }
    });

    test('an allowlist with a skills-dir entry lets them load', () => {
      expect(
        admitted(['managed', { strictKnownMarketplaces: [github('acme/*'), skillsDir] }]),
      ).toBe(true);
    });

    test('a blocklist with a skills-dir entry stops them; one that names other sources does not', () => {
      const blocked = customizationOf([['managed', { blockedMarketplaces: [skillsDir] }]]);
      expect(blocked.skillsDirPlugins()).toEqual({ admitted: false, by: 'blockedMarketplaces' });
      expect(admitted(['managed', { blockedMarketplaces: [github('evil/*')] }])).toBe(true);
    });

    test('the lock still stops them when the allowlist lists skills-dir', () => {
      const policy = customizationOf([
        [
          'managed',
          { strictKnownMarketplaces: [skillsDir], strictPluginOnlyCustomization: ['mcp'] },
        ],
      ]);
      expect(policy.skillsDirPlugins().admitted).toBe(false);
    });
  });

  describe('plain skills are not plugins', () => {
    test('a SKILL.md without a manifest is a plain skill: the allowlist does not apply to it', () => {
      const policy = customizationOf([['managed', { strictKnownMarketplaces: [] }]]);
      expect(policy.skillsDirPlugins().admitted).toBe(false);
      expect(policy.loads('skills', 'userSkills')).toBe(true);
      expect(policy.loads('skills', 'projectSkills')).toBe(true);
    });
  });
});
