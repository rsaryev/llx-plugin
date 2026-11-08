/**
 * errors.md § "Managed settings document could not be parsed" (a present document that does not
 * parse as a JSON object: "none of its settings are in effect"; "An empty `managed-settings.json`
 * counts as `{}` and doesn't block launch"); settings.md § "Fix a broken settings file" (a broken
 * user, project or local file is skipped and the rest continues). `SettingsSources` is the host's
 * way to hand over the sources it has; the keys have ids of their own, so this is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import { POLICY_SCOPES, loadSettingsLayers, type PolicyScope } from '../../src/settings/index.ts';
import { plain } from '../support/settings-layers.ts';

const signal = new AbortController().signal;

/** A host that has the given sources and records which scopes it was asked for. */
function host(sources: Partial<Record<PolicyScope, unknown>>) {
  const asked: PolicyScope[] = [];
  return {
    asked,
    read: (scope: PolicyScope) => {
      asked.push(scope);
      return Promise.resolve(sources[scope]);
    },
  };
}

describe('loadSettingsLayers', () => {
  test('asks for every scope and returns a layer for each source that exists, highest first', async () => {
    const sources = host({ user: { enableWorkflows: true }, managed: { disableWorkflows: true } });
    const { layers, issues } = await loadSettingsLayers(sources, signal);
    expect(sources.asked).toEqual([...POLICY_SCOPES]);
    expect(layers.map((layer) => layer.scope)).toEqual(['managed', 'user']);
    expect(issues).toEqual([]);
  });

  test('a source given as text is parsed', async () => {
    const { layers } = await loadSettingsLayers(
      host({ project: '{ "enableWorkflows": false }' }),
      signal,
    );
    expect(plain(layers[0]?.settings)).toEqual({ enableWorkflows: false });
  });

  test('an empty document counts as {}', async () => {
    const { layers, issues } = await loadSettingsLayers(host({ managed: '  \n' }), signal);
    expect(layers).toEqual([{ scope: 'managed', settings: {} }]);
    expect(issues).toEqual([]);
  });

  test('a managed document that does not parse is an error with the documented message, and is skipped', async () => {
    const { layers, issues } = await loadSettingsLayers(
      host({ managed: '{ nope', user: { enableWorkflows: true } }),
      signal,
    );
    expect(layers.map((layer) => layer.scope)).toEqual(['user']);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toStartWith(
      'Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it.',
    );
  });

  test('a user file that does not parse is skipped with a warning, the rest continues', async () => {
    const { layers, issues } = await loadSettingsLayers(
      host({ user: '{ nope', project: { enableWorkflows: true } }),
      signal,
    );
    expect(layers.map((layer) => layer.scope)).toEqual(['project']);
    expect(issues.map((one) => one.severity)).toEqual(['warning']);
  });

  test('only the scopes asked for are read', async () => {
    const sources = host({ user: {}, project: {} });
    const { layers } = await loadSettingsLayers(sources, signal, ['user']);
    expect(sources.asked).toEqual(['user']);
    expect(layers.map((layer) => layer.scope)).toEqual(['user']);
  });

  test('what each layer says is collected', async () => {
    const { issues } = await loadSettingsLayers(
      host({ user: { strictKnownMarketplaces: [] }, managed: { disableAllHooks: 'yes' } }),
      signal,
    );
    expect(issues.map((one) => one.path).toSorted()).toEqual([
      'managed:disableAllHooks',
      'user:strictKnownMarketplaces',
    ]);
  });
});
