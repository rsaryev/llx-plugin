/**
 * settings.md § Settings precedence ("managed settings, command line, project local, shared
 * project, user"; a key set at a higher level overrides the same key lower down) and § Precedence
 * examples (the project value beats the user value, local beats project, managed beats everything,
 * `--settings` beats every file except managed). `parent` is not ranked by the docs; `addDir` is the lowest source of `enabledPlugins`:
 * spec/judgments.md. The keys' own behaviour has requirement ids, so this file is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  POLICY_SCOPES,
  createPolicyView,
  type PolicyScope,
  type PolicyLayer,
} from '../../src/settings/index.ts';
import { layerOf, plain } from '../support/settings-layers.ts';
import { SCOPE_RANK, orderedLayers } from '../../src/settings/layers.ts';

const flag = (scope: PolicyScope, value: boolean): PolicyLayer =>
  layerOf(scope, { enableWorkflows: value });

describe('settings layers', () => {
  test('the documented order, highest first, is managed, --settings, local, project, user', () => {
    const documented = ['managed', 'flag', 'local', 'project', 'user'];
    expect(plain(POLICY_SCOPES.filter((scope) => documented.includes(scope)))).toEqual(documented);
  });

  test('ranks fall with the order of POLICY_SCOPES', () => {
    const ranks = POLICY_SCOPES.map((scope) => SCOPE_RANK[scope]);
    expect(ranks).toEqual(ranks.toSorted((a, b) => b - a));
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  test('orderedLayers puts the highest first whatever order the host gave', () => {
    const given = POLICY_SCOPES.toReversed().map((scope) => flag(scope, true));
    expect(orderedLayers(given).map((layer) => layer.scope)).toEqual([...POLICY_SCOPES]);
  });

  test('two layers of one scope keep the order they were given', () => {
    const first = layerOf('managed', { enableWorkflows: true });
    const second = layerOf('managed', { enableWorkflows: false });
    expect(orderedLayers([first, second])).toEqual([first, second]);
  });

  test('team settings override personal settings, local gets the personal value back', () => {
    const user = flag('user', false);
    const project = flag('project', true);
    expect(createPolicyView([user, project]).get('enableWorkflows')).toBe(true);
    expect(createPolicyView([user, project, flag('local', false)]).get('enableWorkflows')).toBe(
      false,
    );
  });

  test('managed settings override everything, --settings included', () => {
    const view = createPolicyView([
      flag('user', false),
      flag('local', false),
      flag('flag', false),
      layerOf('managed', { disableWorkflows: true }),
    ]);
    expect(view.winner('disableWorkflows')?.scope).toBe('managed');
    const managedWins = createPolicyView([flag('flag', false), flag('managed', true)]);
    expect(managedWins.get('enableWorkflows')).toBe(true);
  });

  test('--settings overrides the files for a key the files set, and keeps the ones it leaves out', () => {
    const view = createPolicyView([
      layerOf('user', { enableWorkflows: false, disableWorkflows: false }),
      layerOf('project', { enableWorkflows: false }),
      layerOf('flag', { enableWorkflows: true }),
    ]);
    expect(view.get('enableWorkflows')).toBe(true);
    expect(view.get('disableWorkflows')).toBe(false);
    expect(view.winner('disableWorkflows')?.scope).toBe('user');
  });

  test('a key nobody sets has no value and no winner', () => {
    const view = createPolicyView([flag('user', true)]);
    expect(view.get('channelsEnabled')).toBeUndefined();
    expect(view.winner('channelsEnabled')).toBeUndefined();
    expect(view.eachFromHighest('channelsEnabled')).toEqual([]);
  });

  test('eachFromHighest lists every layer that sets the key, highest first, with its position', () => {
    const view = createPolicyView([
      flag('user', true),
      flag('project', false),
      flag('user', false),
    ]);
    expect(
      view
        .eachFromHighest('enableWorkflows')
        .map((holder) => [holder.scope, holder.position, holder.value]),
    ).toEqual([
      ['project', 0, false],
      ['user', 1, true],
      ['user', 2, false],
    ]);
  });

  test('view.layers is the ordered layers', () => {
    const layers = [flag('user', true), flag('managed', true)];
    expect(createPolicyView(layers).layers.map((layer) => layer.scope)).toEqual([
      'managed',
      'user',
    ]);
  });
});
