/**
 * What the kit decides where the docs are silent (spec/judgments.md); none of it is under spec().
 */
import { describe, expect, test } from 'bun:test';
import { readSurfaceLocks } from '../../../src/settings/customization/index.ts';
import { customizationOf, locking } from '../../support/customization.ts';
import { fromFrontmatter, fromPlugin, fromPluginFrontmatter } from '../../support/hook-policy.ts';

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

  test('the frontmatter hooks of a skills-directory plugin stop under any lock, as the plugin itself does', () => {
    const policy = customizationOf(locking(['mcp']));
    const folder = { skillsDirPlugin: true };
    expect(policy.loads('hooks', fromPlugin('p@skills-dir', folder))).toBe(false);
    expect(policy.loads('hooks', fromPluginFrontmatter('skill', 'p@acme'))).toBe(true);
  });

  test('a skill from the managed directory keeps its frontmatter hooks under every lock', () => {
    const policy = customizationOf(locking(true));
    expect(policy.loads('hooks', fromFrontmatter('skill', 'managed'))).toBe(true);
  });
});
