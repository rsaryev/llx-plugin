/**
 * What the kit decides where the docs are silent (spec/judgments.md); none of it is under spec().
 */
import { describe, expect, test } from 'bun:test';
import { readSurfaceLocks } from '../../../src/settings/customization/index.ts';
import { customizationOf, locking } from '../../support/customization.ts';
import {
  fromFrontmatter,
  fromPlugin,
  fromPluginFrontmatter,
  fromSettings,
} from '../../support/hook-policy.ts';

describe('strictPluginOnlyCustomization judgments', () => {
  test('false is an explicit no-op, as the SDK type documents: nothing locked, nothing counted', () => {
    const read = readSurfaceLocks(false);
    expect(read.locked.size).toBe(0);
    expect(read.unknownNames).toBe(0);
    expect(customizationOf(locking(false)).skillsDirPlugins()).toEqual({ admitted: true });
  });

  test('null reads like an absent key', () => {
    expect(readSurfaceLocks(null).locked.size).toBe(0);
  });

  test('skills from an added directory or from claude.ai keep their pre-approval: the docs name personal and project skills only', () => {
    const policy = customizationOf(locking(['hooks']));
    for (const source of ['addDir', 'synced'] as const) {
      expect(
        policy.skillAllowedToolsPreapproved({ source, declaresHooks: true, contextFork: false }),
      ).toBe(true);
    }
  });

  describe('the frontmatter hooks of a skills-directory plugin stop under any lock, as the plugin itself does', () => {
    const folder = { skillsDirPlugin: true };

    test.each([['mcp'], ['hooks']] as const)('under a lock on %s only', (surface) => {
      const policy = customizationOf(locking([surface]));
      expect(policy.loads('hooks', fromPlugin('p@skills-dir', folder))).toBe(false);
      for (const owner of ['skill', 'command', 'agent'] as const) {
        expect(policy.loads('hooks', fromPluginFrontmatter(owner, 'p@skills-dir', folder))).toBe(
          false,
        );
      }
    });

    test('the same frontmatter hooks of a plugin a marketplace delivers keep loading under a lock on another surface', () => {
      const policy = customizationOf(locking(['mcp']));
      for (const owner of ['skill', 'command', 'agent'] as const) {
        expect(policy.loads('hooks', fromPluginFrontmatter(owner, 'p@acme'))).toBe(true);
      }
    });

    test('with nothing locked they load', () => {
      const policy = customizationOf([]);
      expect(policy.loads('hooks', fromPluginFrontmatter('skill', 'p@skills-dir', folder))).toBe(
        true,
      );
    });
  });

  test("hooks from --settings and from the SDK settings option stop with the user's under a hooks lock", () => {
    const policy = customizationOf(locking(['hooks']));
    for (const scope of ['flag', 'sdkSettingsOption'] as const) {
      expect(policy.loads('hooks', fromSettings(scope))).toBe(false);
    }
    const other = customizationOf(locking(['skills']));
    for (const scope of ['flag', 'sdkSettingsOption'] as const) {
      expect(other.loads('hooks', fromSettings(scope))).toBe(true);
    }
  });

  test('a skill from the managed directory keeps its frontmatter hooks under every lock', () => {
    const policy = customizationOf(locking(true));
    expect(policy.loads('hooks', fromFrontmatter('skill', 'managed'))).toBe(true);
  });
});
