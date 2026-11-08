/**
 * settings-reference.md § Settings index (the keys), § `strictPluginOnlyCustomization` (the four
 * surfaces, in the order the docs list them), § `workflowSizeGuideline`, § `strictKnownMarketplaces`
 * "Allowed source types" and "Marketplace key aliases". The lists are asserted equal to the SDK's
 * types at compile time; this file proves only what the types cannot: names are unique and the
 * order and aliases are the docs'. The keys' behaviour has requirement ids of its own, proven
 * where it decides something, so it is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  MARKETPLACE_KEY_ALIASES,
  MARKETPLACE_SOURCE_KINDS,
  PLUGIN_ONLY_SURFACES,
  POLICY_KEYS,
  SKILL_OVERRIDE_STATES,
  WORKFLOW_SIZES,
} from '../../src/protocol/settings-keys.ts';

const strings = (list: readonly string[]): readonly string[] => list;

describe('settings keys', () => {
  test('are the 34 top-level keys the settings requirements name, each once', () => {
    expect(new Set(POLICY_KEYS).size).toBe(POLICY_KEYS.length);
    expect(POLICY_KEYS).toHaveLength(34);
  });

  test('the strictPluginOnlyCustomization surfaces are skills, agents, hooks, mcp in the docs order', () => {
    expect(strings(PLUGIN_ONLY_SURFACES)).toEqual(['skills', 'agents', 'hooks', 'mcp']);
  });

  test('the skillOverrides states are the four of skills.md', () => {
    expect(strings(SKILL_OVERRIDE_STATES)).toEqual([
      'on',
      'name-only',
      'user-invocable-only',
      'off',
    ]);
  });

  test('the workflow sizes are the four of the workflowSizeGuideline entry', () => {
    expect(strings(WORKFLOW_SIZES)).toEqual(['unrestricted', 'small', 'medium', 'large']);
  });

  test('the marketplace source kinds hold the eight of the docs table', () => {
    const documented = [
      'github',
      'git',
      'url',
      'file',
      'directory',
      'hostPattern',
      'pathPattern',
      'skills-dir',
    ];
    for (const kind of documented) expect(strings(MARKETPLACE_SOURCE_KINDS)).toContain(kind);
  });

  test('the marketplace aliases name the two canonical keys', () => {
    expect(MARKETPLACE_KEY_ALIASES).toEqual({
      allowedMarketplaces: 'strictKnownMarketplaces',
      additionalMarketplaces: 'extraKnownMarketplaces',
    });
    for (const canonical of Object.values(MARKETPLACE_KEY_ALIASES)) {
      expect(strings(POLICY_KEYS)).toContain(canonical);
    }
  });
});
