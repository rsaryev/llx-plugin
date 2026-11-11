/**
 * settings-reference.md, the entries `managedSourcesBehavior` (with the conditions its key table does
 * not show) and `forceRemoteSettingsRefresh` (where the key is read).
 */
import { describe, expect, test } from 'bun:test';
import { withHelperSettings } from '../../../src/settings/managed/index.ts';
import { compose, policyOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const MERGE = { managedSourcesBehavior: 'merge' } as const;

spec('policy.key.managedSourcesBehavior', () => {
  test('the default is first-wins; "merge" is the only other value', () => {
    expect(compose({ file: { model: 'a' } }).behavior).toBe('first-wins');
    expect(compose({ plist: { ...MERGE, model: 'a' } }).behavior).toBe('merge');
  });

  test('only the highest source carrying the key or a policy key decides, so a lower source cannot opt in', () => {
    const optIn = compose({ plist: { cleanupPeriodDays: 1 }, file: { ...MERGE, model: 'a' } });
    expect(optIn.behavior).toBe('first-wins');
    expect(optIn.used).toEqual(['plist']);
  });

  test('neither the Windows HKCU registry nor parent settings take part in the merge', () => {
    const composed = compose({ hklm: { ...MERGE, model: 'a' }, hkcu: { cleanupPeriodDays: 1 } });
    expect(composed.used).toEqual(['hklm']);
    expect(composed.layer.settings.cleanupPeriodDays).toBeUndefined();
  });

  test('under first-wins a file below server-managed settings contributes only the cross-source keys', () => {
    const settings = policyOf({
      remote: { model: 'a' },
      file: { cleanupPeriodDays: 1, allowAllClaudeAiMcps: true },
    });
    expect(settings.cleanupPeriodDays).toBeUndefined();
    expect(settings.allowAllClaudeAiMcps).toBe(true);
  });

  describe('conditions the key table does not show', () => {
    test('modelOverrides comes from the highest source that sets it', () => {
      const overrides = { 'claude-opus-5': 'arn:one' };
      expect(
        policyOf({
          remote: { ...MERGE, model: 'a' },
          file: { modelOverrides: overrides },
        }).modelOverrides,
      ).toEqual(overrides);
    });

    test('a higher source that sets availableModels without modelOverrides hides every source`s modelOverrides', () => {
      const settings = policyOf({
        remote: { ...MERGE, availableModels: ['opus'] },
        file: { modelOverrides: { 'claude-opus-5': 'arn:one' } },
      });
      expect(settings.modelOverrides).toBeUndefined();
      expect(settings.availableModels).toEqual(['opus']);
    });

    test('a higher source that sets both keeps its modelOverrides', () => {
      const settings = policyOf({
        remote: { ...MERGE, availableModels: ['opus'], modelOverrides: { a: 'x' } },
        file: { modelOverrides: { b: 'y' } },
      });
      expect(settings.modelOverrides).toEqual({ a: 'x' });
    });

    test('policyHelper is honored only when the highest source with a policy key is an MDM policy or a file', () => {
      const helper = { policyHelper: { path: '/usr/local/bin/claude-policy' } };
      expect(compose({ remote: { ...MERGE, model: 'a' }, file: helper }).helper.runsAtLaunch).toBe(
        false,
      );
      expect(
        compose({ plist: { ...MERGE, ...helper }, file: { model: 'a' } }).helper.runsAtLaunch,
      ).toBe(true);
      expect(compose({ file: helper }).helper.runsAtLaunch).toBe(true);
    });

    test('allowedProviders: the machine list still limits the result, a server-managed list can only narrow it', () => {
      const settings = policyOf({
        remote: { allowedProviders: ['anthropic', 'bedrock'] },
        file: { allowedProviders: ['bedrock', 'vertex'] },
      });
      expect(settings.allowedProviders).toEqual(['bedrock']);
    });

    test('allowedProviders: a server-managed list alone applies as it is', () => {
      expect(policyOf({ remote: { allowedProviders: ['anthropic'] } }).allowedProviders).toEqual([
        'anthropic',
      ]);
    });
  });
});

spec(['policy.key.forceRemoteSettingsRefresh', 'policy.server.Enforce fail-closed startup'], () => {
  test('a true from any admin source applies, even one that is not the highest-priority source', () => {
    const composed = compose({
      remote: { model: 'a' },
      file: { forceRemoteSettingsRefresh: true },
    });
    expect(composed.forceRemoteRefresh).toBe(true);
    expect(composed.layer.settings.forceRemoteSettingsRefresh).toBe(true);
  });

  test('the user-writable HKCU registry cannot set it', () => {
    const composed = compose({ file: { model: 'a' }, hkcu: { forceRemoteSettingsRefresh: true } });
    expect(composed.forceRemoteRefresh).toBe(false);
    expect(composed.layer.settings.forceRemoteSettingsRefresh).toBeUndefined();
  });

  test('false and unset leave the startup check off', () => {
    expect(compose({ file: { forceRemoteSettingsRefresh: false } }).forceRemoteRefresh).toBe(false);
    expect(compose({ file: { model: 'a' } }).forceRemoteRefresh).toBe(false);
  });

  test('the startup check reads the admin sources, so a policy helper output does not change it', () => {
    const composed = compose({
      file: { forceRemoteSettingsRefresh: true, policyHelper: { path: '/bin/h' } },
    });
    const helped = withHelperSettings(composed, { model: 'a' });
    expect(helped.forceRemoteRefresh).toBe(true);
    expect(helped.layer.settings.forceRemoteSettingsRefresh).toBeUndefined();
  });
});
