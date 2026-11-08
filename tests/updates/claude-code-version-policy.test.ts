/**
 * settings-reference.md § `autoUpdatesChannel` and § `minimumVersion`, setup.md § Configure release
 * channel and § Pin a minimum version. The channel picks which version background auto-updates and
 * `claude update` follow; `minimumVersion` keeps them from installing anything below it (an invalid
 * value is ignored) and never blocks a start. The two required keys are in
 * claude-code-version-required.test.ts.
 */
import { expect, test } from 'bun:test';
import { channelSwitch } from '../../src/updates/claude-code-version-policy.ts';
import { gate, layer, pick, policyOf } from '../support/version-policy.ts';
import { spec } from '../support/spec.ts';

spec('updates.key.autoUpdatesChannel', () => {
  test('unset, Claude Code follows latest', () => {
    expect(policyOf().channel).toBe('latest');
    expect(pick(policyOf())).toMatchObject({
      outcome: 'install',
      version: '2.1.120',
      from: 'latest',
    });
  });

  test('"stable" follows the stable release, "latest" the most recent one', () => {
    expect(pick(policyOf(layer('user', { autoUpdatesChannel: 'stable' })))).toMatchObject({
      outcome: 'install',
      version: '2.1.110',
      from: 'stable',
    });
    expect(pick(policyOf(layer('user', { autoUpdatesChannel: 'latest' })))).toMatchObject({
      version: '2.1.120',
      from: 'latest',
    });
  });

  test('any file may set it; managed settings enforce one channel for the organization', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed', 'parent'] as const) {
      expect(policyOf(layer(scope, { autoUpdatesChannel: 'stable' })).channel).toBe('stable');
    }
    const enforced = policyOf(
      layer('user', { autoUpdatesChannel: 'latest' }),
      layer('managed', { autoUpdatesChannel: 'stable' }),
    );
    expect(enforced.channel).toBe('stable');
  });

  test('a --add-dir directory carries only enabledPlugins and extraKnownMarketplaces, so it cannot set the channel', () => {
    const added = layer('addDir', { autoUpdatesChannel: 'stable' });
    expect(policyOf(added).channel).toBe('latest');
    expect(policyOf(layer('user', { autoUpdatesChannel: 'latest' }), added).channel).toBe('latest');
  });

  test('switching from latest to stable in /config asks whether to allow a downgrade or stay; staying sets minimumVersion', () => {
    const request = { from: 'latest', to: 'stable', currentVersion: '2.1.130' } as const;
    expect(channelSwitch(request)).toEqual({ ask: 'downgrade-or-stay' });
    expect(channelSwitch({ ...request, answer: 'stay' })).toEqual({
      set: { autoUpdatesChannel: 'stable', minimumVersion: '2.1.130' },
      remove: [],
    });
    expect(channelSwitch({ ...request, answer: 'downgrade' })).toEqual({
      set: { autoUpdatesChannel: 'stable' },
      remove: [],
    });
  });

  test('switching back to latest removes the key, and clears minimumVersion', () => {
    expect(channelSwitch({ from: 'stable', to: 'latest', currentVersion: '2.1.130' })).toEqual({
      set: {},
      remove: ['autoUpdatesChannel', 'minimumVersion'],
    });
  });
});

const onStable = (minimumVersion?: string) =>
  policyOf(
    layer('user', {
      autoUpdatesChannel: 'stable',
      ...(minimumVersion === undefined ? {} : { minimumVersion }),
    }),
  );

spec('updates.key.minimumVersion', () => {
  const stableBehind = { installed: '2.1.110', latest: '2.1.130', stable: '2.1.100' };

  test('moving to stable downgrades without it, and with it the update is refused', () => {
    expect(pick(onStable(), stableBehind)).toMatchObject({
      outcome: 'install',
      version: '2.1.100',
      downgrade: true,
    });
    expect(pick(onStable('2.1.110'), stableBehind)).toEqual({
      outcome: 'skip',
      reason: 'below-minimum-version',
    });
  });

  test('the docs example, stable with a floor of 2.1.100, installs what is at or above it', () => {
    expect(pick(onStable('2.1.100'), { installed: '2.1.90', stable: '2.1.100' })).toMatchObject({
      outcome: 'install',
      version: '2.1.100',
    });
    expect(pick(onStable('2.1.100'), { installed: '2.1.90', stable: '2.1.99' })).toEqual({
      outcome: 'skip',
      reason: 'below-minimum-version',
    });
  });

  test('a value that is not a valid version is ignored', () => {
    const policy = onStable('latest-please');
    expect(policy.minimumVersion).toBeUndefined();
    expect(pick(policy, stableBehind)).toMatchObject({ outcome: 'install', version: '2.1.100' });
  });

  test('it only constrains updates: Claude Code still starts below it', () => {
    expect(gate(onStable('2.1.100'), '2.1.50')).toEqual({ allowed: true });
  });

  test('a --add-dir directory cannot freeze updates with it', () => {
    const policy = policyOf(layer('addDir', { minimumVersion: '9.0.0' }));
    expect(policy.minimumVersion).toBeUndefined();
    expect(pick(policy)).toMatchObject({ outcome: 'install', version: '2.1.120' });
  });

  test('in managed settings it is an organization-wide minimum that user and project settings cannot lower', () => {
    const policy = policyOf(
      layer('user', { minimumVersion: '2.1.50' }),
      layer('project', { minimumVersion: '2.1.60' }),
      layer('managed', { minimumVersion: '2.1.100' }),
    );
    expect(policy.minimumVersion).toBe('2.1.100');
  });

  test('switching back to latest clears it', () => {
    expect(
      channelSwitch({ from: 'stable', to: 'latest', currentVersion: '2.1.130' }),
    ).toMatchObject({
      remove: ['autoUpdatesChannel', 'minimumVersion'],
    });
  });
});
