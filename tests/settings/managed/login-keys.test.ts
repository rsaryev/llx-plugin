/**
 * managed-settings.md § Which managed source supplies login keys and § Compose every managed
 * source (the "Login keys" row); settings-reference.md, `managedSourcesBehavior` (the gateway login
 * keys are never read from server-managed settings).
 */
import { describe, expect, test } from 'bun:test';
import { compose, policyOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MERGE = { managedSourcesBehavior: 'merge' } as const;

spec('settingsMerge.managed.Which managed source supplies login keys', () => {
  test('the MDM policy or managed file supplies the login keys, even for a key remote settings also set', () => {
    for (const machine of ['plist', 'hklm', 'file'] as const) {
      const settings = policyOf({
        remote: { model: 'a', forceLoginOrgUUID: OTHER, forceLoginMethod: 'console' },
        [machine]: { forceLoginOrgUUID: ORG, forceLoginMethod: 'claudeai' },
      });
      expect(settings.forceLoginOrgUUID).toBe(ORG);
      expect(settings.forceLoginMethod).toBe('claudeai');
    }
  });

  test('a first-party key the machine policy omits comes from remote settings', () => {
    const settings = policyOf({
      remote: { model: 'a', forceLoginOrgUUID: OTHER, forceLoginMethod: 'console' },
      file: { forceLoginMethod: 'claudeai' },
    });
    expect(settings.forceLoginOrgUUID).toBe(OTHER);
    expect(settings.forceLoginMethod).toBe('claudeai');
  });

  test('with no machine policy the remote settings supply them', () => {
    expect(policyOf({ remote: { forceLoginOrgUUID: OTHER } }).forceLoginOrgUUID).toBe(OTHER);
  });

  test('the gateway login keys are never taken from remote settings', () => {
    const settings = policyOf({
      remote: {
        model: 'a',
        forceLoginGatewayUrl: 'https://gateway.example',
        gatewayInternalNetworks: ['10.0.0.0/8'],
        forceLoginMethod: 'gateway',
      },
      file: { forceLoginOrgUUID: ORG },
    });
    expect(settings.forceLoginGatewayUrl).toBeUndefined();
    expect(settings.gatewayInternalNetworks).toBeUndefined();
    expect(settings.forceLoginMethod).toBeUndefined();
  });

  test('the gateway login keys of the machine policy apply', () => {
    const settings = policyOf({
      remote: { model: 'a' },
      file: { forceLoginGatewayUrl: 'https://gateway.example', forceLoginMethod: 'gateway' },
    });
    expect(settings.forceLoginGatewayUrl).toBe('https://gateway.example');
    expect(settings.forceLoginMethod).toBe('gateway');
  });

  describe('a machine with both an MDM policy and a managed settings file', () => {
    const held = {
      plist: { model: 'a' },
      file: { forceLoginOrgUUID: ORG, forceLoginMethod: 'claudeai' },
    };

    test('login keys in the file are ignored once the MDM policy sets any policy key', () => {
      const settings = policyOf(held);
      expect(settings.forceLoginOrgUUID).toBeUndefined();
      expect(settings.forceLoginMethod).toBeUndefined();
    });

    test('even under managedSourcesBehavior merge', () => {
      const settings = policyOf({ ...held, plist: { ...MERGE, model: 'a' } });
      expect(settings.forceLoginOrgUUID).toBeUndefined();
      expect(compose({ ...held, plist: { ...MERGE, model: 'a' } }).used).toEqual(['plist', 'file']);
    });

    test('an MDM policy with only control keys does not hide them', () => {
      expect(policyOf({ plist: { ...MERGE }, file: held.file }).forceLoginOrgUUID).toBe(ORG);
    });
  });
});

spec('settingsMerge.managed.Compose every managed source.Login keys', () => {
  test('under either setting they come from the higher-ranked of the MDM policy and the file that carries a policy key, ahead of remote', () => {
    for (const behavior of ['first-wins', 'merge'] as const) {
      const settings = policyOf({
        remote: { managedSourcesBehavior: behavior, model: 'a', forceLoginOrgUUID: OTHER },
        plist: { forceLoginOrgUUID: ORG },
        file: { forceLoginOrgUUID: 'file-org' },
      });
      expect(settings.forceLoginOrgUUID).toBe(ORG);
    }
  });

  test('the file supplies them when it is the highest machine source with a policy key', () => {
    const settings = policyOf({
      remote: { ...MERGE, model: 'a', forceLoginOrgUUID: OTHER },
      plist: { managedSourcesBehavior: 'merge' },
      file: { forceLoginOrgUUID: ORG },
    });
    expect(settings.forceLoginOrgUUID).toBe(ORG);
  });
});
