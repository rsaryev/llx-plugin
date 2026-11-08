/**
 * managed-settings.md § What a developer can change ("Local admin rights", "Other tools"),
 * plugins/org.md § Plan for what managed settings can't enforce and § Troubleshoot policy,
 * plugins/loading.md § Skills-directory plugins blocked by managed settings ("Confirm the cause",
 * "Load the whole plugin"), server-managed-settings.md § Invalid entries in delivered settings.
 */
import { describe, expect, test } from 'bun:test';
import {
  NEAREST_CONTROLS,
  POLICY_SYMPTOMS,
  SYMPTOM_CHECKS,
  UNENFORCEABLE_REQUESTS,
  deliveredPayloadOutcome,
  managedBinding,
  managedSourceLoaded,
  retentionValueApplies,
  skillsDirCause,
  wholePluginRoutes,
} from '../../../src/settings/managed/limits.ts';
import { spec } from '../../support/spec.ts';

const CHANGE = 'policy.managed.What a developer can change';

spec(`${CHANGE}.Local admin rights`, () => {
  test('an administrator on the machine can edit the managed source: it is not binding, MDM redeploys', () => {
    const binding = managedBinding({ localAdmin: true });
    expect(binding.bound).toBe(false);
    expect(binding.note).toContain('MDM');
  });
  test('a developer with no such right is bound', () => {
    expect(managedBinding({})).toEqual({ bound: true });
  });
});

spec(`${CHANGE}.Other tools`, () => {
  test('managed settings bind Claude Code only', () => {
    expect(managedBinding({ otherTool: true }).bound).toBe(false);
  });
});

spec("policy.org.Plan for what managed settings can't enforce", () => {
  test('every request without a key names its nearest controls', () => {
    for (const request of UNENFORCEABLE_REQUESTS) {
      expect(NEAREST_CONTROLS[request].length).toBeGreaterThan(0);
    }
  });
  test('hiding /plugin and gating --plugin-dir point to disableSideloadFlags', () => {
    expect(NEAREST_CONTROLS['hide-plugin-command']).toContain('disableSideloadFlags');
    expect(NEAREST_CONTROLS['gate-plugin-dir-through-allowlist']).toEqual(['disableSideloadFlags']);
    expect(NEAREST_CONTROLS['entries-inside-allowed-marketplace']).toEqual(['enabledPlugins']);
  });
});

spec('policy.org.Troubleshoot policy', () => {
  test('each symptom has a first check', () => {
    for (const symptom of POLICY_SYMPTOMS)
      expect(SYMPTOM_CHECKS[symptom].length).toBeGreaterThan(0);
  });
  test('the managed source loaded when /status lists Enterprise managed settings', () => {
    expect(
      managedSourceLoaded('Setting sources: User settings, Enterprise managed settings (file)'),
    ).toBe(true);
    expect(managedSourceLoaded('Setting sources: User settings, Project settings')).toBe(false);
  });
});

const SKILLS = 'policy.loading.Skills-directory plugins blocked by managed settings';

spec(`${SKILLS}.Confirm the cause`, () => {
  test('an Enterprise managed settings source means ask the administrator; otherwise look at other causes', () => {
    expect(skillsDirCause('Setting sources: Enterprise managed settings (remote)')).toBe(
      'ask-administrator',
    );
    expect(skillsDirCause('Setting sources: User settings')).toBe('check-repository-plugin-causes');
  });
});

spec(`${SKILLS}.Load the whole plugin`, () => {
  test('an allowed marketplace and --plugin-dir are the two routes', () => {
    expect(
      wholePluginRoutes({ allowedMarketplaceAvailable: true, sideloadFlagsDisabled: false }),
    ).toEqual(['marketplace', 'plugin-dir']);
  });
  test('--plugin-dir works unless the administrator turned the flag off', () => {
    expect(
      wholePluginRoutes({ allowedMarketplaceAvailable: true, sideloadFlagsDisabled: true }),
    ).toEqual(['marketplace']);
    expect(
      wholePluginRoutes({ allowedMarketplaceAvailable: false, sideloadFlagsDisabled: true }),
    ).toEqual([]);
  });
});

spec('policy.server.Invalid entries in delivered settings', () => {
  const bad = (key: string, extra = {}) => ({ key, valid: false, ...extra });
  test('a payload with some valid entries applies and replaces the cache', () => {
    expect(deliveredPayloadOutcome([bad('model'), { key: 'env', valid: true }])).toEqual({
      apply: true,
      updateCache: true,
    });
  });
  test('all invalid, none stricter, another key than retention: nothing applies, the cache stays, the cause is reported', () => {
    expect(deliveredPayloadOutcome([bad('model'), bad('cleanupPeriodDays')])).toEqual({
      apply: false,
      updateCache: false,
      failure: 'no setting in the server response could be applied as written',
    });
  });
  test('a key that falls back to a stricter value keeps the payload applied', () => {
    expect(deliveredPayloadOutcome([bad('model', { fallsBackStricter: true })]).apply).toBe(true);
  });
  test('only retention keys invalid: the payload still applies', () => {
    expect(
      deliveredPayloadOutcome([bad('cleanupPeriodDays'), bad('desktopSessionCleanupPeriodDays')])
        .apply,
    ).toBe(true);
  });
  test('an invalid retention value stays in the cache and is never applied', () => {
    expect(retentionValueApplies('cleanupPeriodDays', false)).toBe(false);
    expect(retentionValueApplies('cleanupPeriodDays', true)).toBe(true);
    expect(retentionValueApplies('model', false)).toBe(true);
  });
});

describe('the lists', () => {
  test('are complete', () => {
    expect(UNENFORCEABLE_REQUESTS).toHaveLength(5);
    expect(POLICY_SYMPTOMS).toHaveLength(4);
  });
});
