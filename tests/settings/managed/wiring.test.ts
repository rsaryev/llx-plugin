/**
 * How a host hands the managed sources to the kit (`SettingsSources.managed`) and how the composed
 * tier reaches the policy (`resolvePolicy({ managed })`). The behaviour itself has ids in the other
 * files of this folder; this wiring is the kit's own API, so it is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import { loadSettingsLayers, type PolicyScope } from '../../../src/settings/index.ts';
import { composeManagedReads, type ManagedReads } from '../../../src/settings/managed/index.ts';
import { resolvePolicy } from '../../../src/settings/index.ts';
import { layerOf } from '../../support/settings-layers.ts';

const signal = new AbortController().signal;

function host(managed: ManagedReads, others: Partial<Record<PolicyScope, unknown>> = {}) {
  const asked: PolicyScope[] = [];
  return {
    asked,
    read: (scope: PolicyScope) => {
      asked.push(scope);
      return Promise.resolve(others[scope]);
    },
    managed: () => Promise.resolve(managed),
  };
}

describe('loadSettingsLayers with the managed sources', () => {
  test('the kit composes the managed tier and never asks for the managed scope', async () => {
    const sources = host({
      remote: { value: { model: 'remote' } },
      file: { base: { value: { model: 'file', cleanupPeriodDays: 7 } } },
    });
    const { layers, fatal } = await loadSettingsLayers(sources, { signal });
    expect(fatal).toBe(false);
    expect(sources.asked).not.toContain('managed');
    expect(layers.map((layer) => layer.scope)).toEqual(['managed']);
    expect(layers[0]?.settings).toEqual({ model: 'remote' });
  });

  test('the managed layer outranks the other sources', async () => {
    const { layers } = await loadSettingsLayers(
      host({ file: { base: { value: { model: 'file' } } } }, { user: { model: 'user' } }),
      { signal },
    );
    expect(layers.map((layer) => layer.scope)).toEqual(['managed', 'user']);
  });

  test('a machine with no managed source has no managed layer', async () => {
    const { layers } = await loadSettingsLayers(host({}, { user: { model: 'user' } }), { signal });
    expect(layers.map((layer) => layer.scope)).toEqual(['user']);
  });

  test('a managed document that does not parse is fatal, even beside a valid one', async () => {
    const { layers, issues, fatal } = await loadSettingsLayers(
      host({ remote: { value: { model: 'a' } }, plist: { malformed: 'bad plist' } }),
      { signal },
    );
    expect(fatal).toBe(true);
    expect(layers).toEqual([]);
    expect(issues.some((issue) => issue.severity === 'error')).toBe(true);
  });

  test('parent settings are dropped when an admin source is present and does not opt in', async () => {
    const { layers } = await loadSettingsLayers(
      host(
        { file: { base: { value: { model: 'file' } } } },
        { parent: { permissions: { deny: ['Read(./x)'] } } },
      ),
      { signal },
    );
    expect(layers.map((layer) => layer.scope)).toEqual(['managed']);
  });

  test('parent settings stay when the admin source sets parentSettingsBehavior merge, cut down by the managed values', async () => {
    const { layers } = await loadSettingsLayers(
      host(
        {
          file: {
            base: {
              value: { parentSettingsBehavior: 'merge', allowManagedPermissionRulesOnly: true },
            },
          },
        },
        { parent: { permissions: { deny: ['Read(./x)'], allow: ['Bash(ls)'] } } },
      ),
      { signal },
    );
    const parent = layers.find((layer) => layer.scope === 'parent');
    expect(parent?.settings.permissions?.deny).toEqual(['Read(./x)']);
    expect(parent?.settings.permissions?.allow).toBeUndefined();
  });

  test('restrictive parent settings keep the HKCU registry from applying', async () => {
    const hkcu = { hkcu: { value: '{"model":"user"}' } };
    const withParent = await loadSettingsLayers(
      host(hkcu, { parent: { permissions: { deny: ['Read(./x)'] } } }),
      { signal },
    );
    expect(withParent.layers.some((layer) => layer.scope === 'managed')).toBe(false);
    const alone = await loadSettingsLayers(host(hkcu), { signal });
    expect(alone.layers[0]?.settings.model).toBe('user');
  });

  test('a host without the multi-source read keeps asking for the managed scope', async () => {
    const asked: PolicyScope[] = [];
    await loadSettingsLayers(
      { read: (scope) => (asked.push(scope), Promise.resolve(undefined)) },
      { signal },
    );
    expect(asked).toContain('managed');
  });
});

describe('resolvePolicy with a composed managed tier', () => {
  const context = {
    account: 'claudeaiPersonal',
    plan: { pro: false },
    hasManagedSettings: false,
    parentMerge: false,
    isFolderTrusted: () => true,
    env: {},
    defaultChannelAllowlist: [],
    officialMarketplaces: [],
  } as const;

  test('whether an administrator deploys managed settings comes from the composition', () => {
    const composed = composeManagedReads({ file: { base: { value: { model: 'a' } } } });
    const parent = layerOf('parent', { permissions: { deny: ['Read(./x)'] } });
    const dropped = resolvePolicy({ layers: [parent], context, managed: composed });
    expect(dropped.view.layers).toEqual([]);
    const kept = resolvePolicy({ layers: [parent], context });
    expect(kept.view.layers.map((layer) => layer.scope)).toEqual(['parent']);
  });

  test('parentSettingsBehavior merge in the highest source keeps the parent layer', () => {
    const composed = composeManagedReads({
      file: { base: { value: { model: 'a', parentSettingsBehavior: 'merge' } } },
    });
    const parent = layerOf('parent', { permissions: { deny: ['Read(./x)'] } });
    const result = resolvePolicy({ layers: [composed.layer, parent], context, managed: composed });
    expect(result.view.layers.map((layer) => layer.scope)).toEqual(['managed', 'parent']);
    expect(composed.parentMerge).toBe(true);
  });
});
