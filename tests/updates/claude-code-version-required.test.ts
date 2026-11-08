/**
 * settings-reference.md § `requiredMinimumVersion` and § `requiredMaximumVersion`, setup.md § Pin a
 * minimum version: managed only; Claude Code refuses to start outside the range; updates skip
 * versions outside it; `claude update`, `claude install` and `claude doctor` keep working. What the
 * docs leave open (how several files' `minimumVersion` combine, the wording of the refusal, an
 * unknown channel, a floor that updates skip) is outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { gate, layer, messageOf, pick, policyOf } from '../support/version-policy.ts';
import { spec } from '../support/spec.ts';

spec('updates.key.requiredMaximumVersion', () => {
  const ceiling = policyOf(layer('managed', { requiredMaximumVersion: '2.1.150' }));

  test('a version newer than the ceiling is refused at startup, with how to recover', () => {
    const verdict = gate(ceiling, '2.1.151');
    expect(verdict).toMatchObject({ allowed: false, reason: 'above-required-maximum' });
    expect(messageOf(verdict)).toContain('approved');
    expect(messageOf(verdict)).toContain('claude install');
  });

  test('the ceiling itself and anything older start', () => {
    expect(gate(ceiling, '2.1.150')).toEqual({ allowed: true });
    expect(gate(ceiling, '2.1.99')).toEqual({ allowed: true });
  });

  test('background auto-updates and claude update skip versions above the ceiling', () => {
    expect(pick(ceiling, { installed: '2.1.140', latest: '2.1.160', stable: '2.1.145' })).toEqual({
      outcome: 'skip',
      reason: 'above-required-maximum',
    });
    // a channel whose version is inside the ceiling keeps updating
    const onStable = policyOf(
      layer('user', { autoUpdatesChannel: 'stable' }),
      layer('managed', { requiredMaximumVersion: '2.1.150' }),
    );
    expect(
      pick(onStable, { installed: '2.1.140', latest: '2.1.160', stable: '2.1.145' }),
    ).toMatchObject({
      outcome: 'install',
      version: '2.1.145',
    });
  });

  test('claude update, claude install and claude doctor keep working above the ceiling', () => {
    for (const command of ['update', 'install', 'doctor'] as const) {
      expect(gate(ceiling, '2.1.200', command)).toEqual({ allowed: true });
    }
  });

  test('only managed settings carry it, and the other files are ignored without a word', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'parent'] as const) {
      expect(
        policyOf(layer(scope, { requiredMaximumVersion: '2.1.1' })).requiredMaximumVersion,
      ).toBeUndefined();
    }
  });

  test('a value that is not a valid version is ignored', () => {
    const policy = policyOf(layer('managed', { requiredMaximumVersion: 'newest' }));
    expect(policy.requiredMaximumVersion).toBeUndefined();
    expect(gate(policy, '9.9.9')).toEqual({ allowed: true });
  });
});

spec('updates.key.requiredMinimumVersion', () => {
  const floor = policyOf(layer('managed', { requiredMinimumVersion: '2.1.150' }));

  test('a version older than the floor is refused at startup and the user is told to update', () => {
    const verdict = gate(floor, '2.1.149');
    expect(verdict).toMatchObject({ allowed: false, reason: 'below-required-minimum' });
    expect(messageOf(verdict)).toContain('Update');
    expect(messageOf(verdict)).toContain('approved');
  });

  test('the floor itself and anything newer start', () => {
    expect(gate(floor, '2.1.150')).toEqual({ allowed: true });
    expect(gate(floor, '2.2.0')).toEqual({ allowed: true });
  });

  test('claude update, claude install and claude doctor keep working below the floor so users can recover', () => {
    for (const command of ['update', 'install', 'doctor'] as const) {
      expect(gate(floor, '2.1.10', command)).toEqual({ allowed: true });
    }
  });

  test('unlike minimumVersion, which only prevents downgrades, this key blocks startup', () => {
    const soft = policyOf(layer('managed', { minimumVersion: '2.1.150' }));
    expect(gate(soft, '2.1.10')).toEqual({ allowed: true });
    expect(gate(floor, '2.1.10')).toMatchObject({ allowed: false });
  });

  test('paired with requiredMaximumVersion it enforces a range: either side refuses', () => {
    const range = policyOf(
      layer('managed', { requiredMinimumVersion: '2.1.100', requiredMaximumVersion: '2.1.150' }),
    );
    expect(gate(range, '2.1.125')).toEqual({ allowed: true });
    expect(gate(range, '2.1.99')).toMatchObject({
      allowed: false,
      reason: 'below-required-minimum',
    });
    expect(gate(range, '2.1.151')).toMatchObject({
      allowed: false,
      reason: 'above-required-maximum',
    });
  });

  test('updates keep an installation inside the range: a version outside it is skipped', () => {
    const range = policyOf(
      layer('managed', { requiredMinimumVersion: '2.1.100', requiredMaximumVersion: '2.1.150' }),
    );
    expect(pick(range, { installed: '2.1.120', latest: '2.1.151', stable: '2.1.140' })).toEqual({
      outcome: 'skip',
      reason: 'above-required-maximum',
    });
    expect(
      pick(range, { installed: '2.1.120', latest: '2.1.130', stable: '2.1.140' }),
    ).toMatchObject({
      outcome: 'install',
      version: '2.1.130',
    });
  });

  test('only managed settings carry it, and a value that is not a version is ignored', () => {
    expect(
      policyOf(layer('user', { requiredMinimumVersion: '9.0.0' })).requiredMinimumVersion,
    ).toBeUndefined();
    expect(
      policyOf(layer('managed', { requiredMinimumVersion: 'x' })).requiredMinimumVersion,
    ).toBeUndefined();
  });
});

describe('Claude Code version policy, what the docs leave open (spec/judgments.md)', () => {
  test('an unknown channel follows latest, like an unset key', () => {
    expect(policyOf(layer('user', JSON.parse('{"autoUpdatesChannel":"nightly"}'))).channel).toBe(
      'latest',
    );
  });

  test('the highest minimumVersion of the files wins, so a user can raise but never lower a managed floor', () => {
    const policy = policyOf(
      layer('user', { minimumVersion: '2.1.200' }),
      layer('managed', { minimumVersion: '2.1.100' }),
    );
    expect(policy.minimumVersion).toBe('2.1.200');
  });

  test('a version spelled v2.1.100 counts as 2.1.100', () => {
    expect(
      policyOf(layer('managed', { requiredMinimumVersion: 'v2.1.100' })).requiredMinimumVersion,
    ).toBe('2.1.100');
  });

  test('an update to the version already installed is already current', () => {
    expect(pick(policyOf(), { installed: '2.1.120' })).toEqual({
      outcome: 'skip',
      reason: 'already-current',
    });
  });

  test('a channel version that is no version is skipped, not installed', () => {
    expect(pick(policyOf(), { latest: 'garbage' })).toEqual({
      outcome: 'skip',
      reason: 'channel-version-unknown',
    });
  });

  test('updates skip a version below requiredMinimumVersion, since it would not start', () => {
    const policy = policyOf(layer('managed', { requiredMinimumVersion: '2.1.130' }));
    expect(pick(policy, { installed: '2.1.100', latest: '2.1.120' })).toEqual({
      outcome: 'skip',
      reason: 'below-required-minimum',
    });
  });
});
