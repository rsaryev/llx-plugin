/**
 * managed-settings.md § Let an embedding host add policy; settings-reference.md, `parentSettingsBehavior`.
 */
import { expect, test } from 'bun:test';
import type { Settings } from '../../../src/protocol/official.ts';
import { createPolicyView, type PolicyLayer } from '../../../src/settings/index.ts';
import {
  applyParentRules,
  parentSettingsOf,
  withHelperSettings,
} from '../../../src/settings/managed/index.ts';
import { compose, parentOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

spec('policy.key.parentSettingsBehavior', () => {
  test('it is read from the highest-priority admin source only', () => {
    expect(
      compose({ remote: { parentSettingsBehavior: 'merge', model: 'a' }, file: { model: 'b' } })
        .parentMerge,
    ).toBe(true);
    expect(
      compose({ remote: { model: 'a' }, file: { parentSettingsBehavior: 'merge' } }).parentMerge,
    ).toBe(false);
  });

  test('the default drops host-supplied settings when an admin-deployed tier is present', () => {
    const composed = compose({ file: { model: 'a' } });
    const outcome = parentSettingsOf(composed, { permissions: { deny: ['Read(./x)'] } });
    expect(composed.parentMerge).toBe(false);
    expect(outcome.settings).toBeUndefined();
  });

  test('"merge" applies the host-supplied settings under the admin tier', () => {
    const composed = compose({ file: { model: 'a', parentSettingsBehavior: 'merge' } });
    const outcome = parentSettingsOf(composed, { permissions: { deny: ['Read(./x)'] } });
    expect(outcome.settings).toEqual({ permissions: { deny: ['Read(./x)'] } });
  });

  test('with no admin-deployed tier the host settings apply as the only managed tier', () => {
    const composed = compose({});
    expect(composed.hasManagedSettings).toBe(false);
    expect(parentSettingsOf(composed, { model: 'a' }).settings).toEqual({ model: 'a' });
  });

  test('a policy helper turns parent merging off whatever the key says', () => {
    const composed = compose({ file: { parentSettingsBehavior: 'merge', model: 'a' } });
    const helped = withHelperSettings(composed, { model: 'b' });
    expect(helped.parentMerge).toBe(false);
    expect(parentSettingsOf(helped, { model: 'c' }).settings).toBeUndefined();
  });
});

spec('policy.managed.Let an embedding host add policy', () => {
  const merging = (admin: object) =>
    compose({ file: { parentSettingsBehavior: 'merge', ...admin } });

  test('by default parent settings are ignored whenever an admin source is present', () => {
    for (const held of [
      { remote: { model: 'a' } },
      { plist: { model: 'a' } },
      { file: { model: 'a' } },
    ]) {
      expect(parentSettingsOf(compose(held), { model: 'host' }).settings).toBeUndefined();
    }
  });

  test('allowManagedPermissionRulesOnly in any admin source drops parent allow rules and additionalDirectories', () => {
    const composed = compose({
      remote: { parentSettingsBehavior: 'merge', model: 'a' },
      file: { allowManagedPermissionRulesOnly: true },
    });
    const outcome = parentSettingsOf(composed, {
      permissions: { allow: ['Bash(ls)'], deny: ['Read(./x)'], additionalDirectories: ['/data'] },
    });
    expect(outcome.settings).toEqual({ permissions: { deny: ['Read(./x)'] } });
    expect(outcome.dropped).toEqual(['permissions.allow', 'permissions.additionalDirectories']);
  });

  test('without the lock the host permission allow rules still apply', () => {
    const outcome = parentSettingsOf(merging({}), { permissions: { allow: ['Bash(ls)'] } });
    expect(outcome.settings).toEqual({ permissions: { allow: ['Bash(ls)'] } });
  });

  test('forceLoginOrgUUID, allowedMcpServers and availableModels of the applied managed settings block the parent value', () => {
    const composed = merging({
      forceLoginOrgUUID: '11111111-1111-4111-8111-111111111111',
      allowedMcpServers: [{ serverName: 'a' }],
      availableModels: ['opus'],
    });
    const parent = {
      forceLoginOrgUUID: '22222222-2222-4222-8222-222222222222',
      allowedMcpServers: [{ serverName: 'b' }],
      availableModels: ['haiku'],
      model: 'host',
    };
    expect(parentSettingsOf(composed, parent).settings).toEqual({ model: 'host' });
  });

  test('the parent list applies when no applied managed source sets one', () => {
    const parent = parentOf({
      allowedMcpServers: [{ serverName: 'b' }],
      availableModels: ['haiku'],
      strictKnownMarketplaces: [{ source: 'github', repo: 'a/b' }],
    });
    expect(parentSettingsOf(merging({}), parent).settings).toEqual(parent);
  });

  test('strictKnownMarketplaces of a managed source blocks the parent list', () => {
    const composed = merging({ strictKnownMarketplaces: [{ source: 'github', repo: 'org/m' }] });
    const outcome = parentSettingsOf(composed, {
      strictKnownMarketplaces: [{ source: 'github', repo: 'a/b' }],
    });
    expect(outcome.settings).toEqual({});
  });

  test('while allowManagedMcpServersOnly is on the highest admin list blocks the parent, and the parent applies only when none sets one', () => {
    const lock = { allowManagedMcpServersOnly: true };
    const parent = { allowedMcpServers: [{ serverName: 'host' }] };
    const blocked = compose({
      remote: {
        ...lock,
        parentSettingsBehavior: 'merge',
        allowedMcpServers: [{ serverName: 'remote' }],
      },
      file: { allowedMcpServers: [{ serverName: 'file' }] },
    });
    expect(parentSettingsOf(blocked, parent).settings).toEqual({});
    const lower = compose({
      remote: { ...lock, parentSettingsBehavior: 'merge' },
      file: { allowedMcpServers: [{ serverName: 'file' }] },
    });
    expect(parentSettingsOf(lower, parent).settings).toEqual({});
    const none = compose({ remote: { ...lock, parentSettingsBehavior: 'merge' } });
    expect(parentSettingsOf(none, parent).settings).toEqual(parent);
  });

  test('allowedProviders: a list in the selected source blocks the parent, and under merge a list in any admin source does', () => {
    const parent: Settings = { allowedProviders: ['anthropic'] };
    const selected = compose({
      remote: { parentSettingsBehavior: 'merge', allowedProviders: ['bedrock'] },
    });
    expect(parentSettingsOf(selected, parent).settings).toEqual({});
    const lower = compose({
      remote: { parentSettingsBehavior: 'merge', model: 'a' },
      file: { allowedProviders: ['bedrock'] },
    });
    expect(parentSettingsOf(lower, parent).settings).toEqual(parent);
    const mergedLower = compose({
      remote: { parentSettingsBehavior: 'merge', managedSourcesBehavior: 'merge', model: 'a' },
      file: { allowedProviders: ['bedrock'] },
    });
    expect(parentSettingsOf(mergedLower, parent).settings).toEqual({});
  });

  test('a parent blockedMarketplaces applies in addition to the managed blocklist', () => {
    const composed = merging({ blockedMarketplaces: [{ source: 'github', repo: 'bad/one' }] });
    const outcome = parentSettingsOf(composed, {
      blockedMarketplaces: [{ source: 'github', repo: 'bad/two' }],
    });
    expect(outcome.settings).toEqual({
      blockedMarketplaces: [{ source: 'github', repo: 'bad/two' }],
    });
  });
});

spec('policy.managed.Let an embedding host add policy', () => {
  const view = (...layers: PolicyLayer[]) => createPolicyView(layers);
  const merging = { hasManagedSettings: true, parentMerge: true };

  test('over a view a host built itself the managed value blocks the parent one, as when the kit reads the layers', () => {
    const effective = applyParentRules(
      view(
        { scope: 'managed', settings: { availableModels: ['sonnet'] } },
        { scope: 'parent', settings: { availableModels: ['opus'], model: 'opus' } },
      ),
      merging,
    );
    const parent = effective.layers.find((layer) => layer.scope === 'parent');
    expect(parent?.settings).toEqual({ model: 'opus' });
  });

  test('a parent layer that stays keeps the keys it could not read, so their floors still apply', () => {
    const effective = applyParentRules(
      view(
        { scope: 'managed', settings: { allowedMcpServers: [] } },
        {
          scope: 'parent',
          settings: { allowedMcpServers: [{ serverName: 'p' }] },
          invalid: ['crossSessionInbound'],
        },
      ),
      merging,
    );
    expect(effective.layers.find((layer) => layer.scope === 'parent')?.invalid).toEqual([
      'crossSessionInbound',
    ]);
  });

  test('applying the rule to a view it already filtered returns that view', () => {
    const once = applyParentRules(
      view({ scope: 'managed', settings: {} }, { scope: 'parent', settings: { model: 'a' } }),
      { hasManagedSettings: true, parentMerge: false },
    );
    expect(applyParentRules(once, { hasManagedSettings: true, parentMerge: false })).toBe(once);
    expect(once.layers.map((layer) => layer.scope)).toEqual(['managed']);
  });
});
