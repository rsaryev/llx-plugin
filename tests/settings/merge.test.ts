/**
 * settings.md § Settings precedence and § "Lists merge instead of overriding" (a list key set in
 * more than one file combines); settings-reference.md § `allowedHttpHookUrls` and
 * `httpHookAllowedEnvVars` ("Arrays merge across settings files"), § `extraKnownMarketplaces` ("When
 * more than one settings file defines a marketplace entry under the same name, Claude Code uses the
 * entry from the highest-precedence file whole... inherits none of its fields"), `enabledPlugins`;
 * claude-apps-gateway.md § "Settings the locks don't cover" (a parent-supplied blocklist "adds to
 * any blocklist that a managed source sets"; a parent allowlist counts only "when the winning
 * managed source doesn't set one"). The keys have ids of their own, proven where their behaviour is,
 * so this file is not under spec(): it proves the merge strategies and the table of keys.
 */
import { describe, expect, test } from 'bun:test';
import { POLICY_KEYS } from '../../src/protocol/settings-keys.ts';
import {
  KEY_SPECS,
  MERGE_KINDS,
  REPAIR_KINDS,
  SCOPE_RULES,
  createPolicyView,
  type SettingsLayer,
} from '../../src/settings/index.ts';
import { layerOf, plain } from '../support/settings-layers.ts';

const github = (repo: string) => ({ source: 'github', repo });

describe('the table of keys', () => {
  test('every key has a scope rule, a merge kind and a repair kind that exist', () => {
    for (const key of POLICY_KEYS) {
      const spec = KEY_SPECS[key];
      expect(SCOPE_RULES).toContain(spec.scopes);
      expect(MERGE_KINDS).toContain(spec.merge);
      expect(REPAIR_KINDS).toContain(spec.repair);
    }
  });

  test('the docs name lists that merge, and the rest of the keys take the highest value', () => {
    const merging = POLICY_KEYS.filter((key) => KEY_SPECS[key].merge === 'unionArrays');
    expect(merging.toSorted()).toEqual([
      'allowedHttpHookUrls',
      'blockedMarketplaces',
      'httpHookAllowedEnvVars',
    ]);
  });
});

describe('merging the layers of a key', () => {
  test("arrays merge across files: each adds entries, none removes another file's", () => {
    const view = createPolicyView([
      layerOf('user', { allowedHttpHookUrls: ['https://user.example/*'] }),
      layerOf('project', { allowedHttpHookUrls: ['https://project.example/*'] }),
      layerOf('managed', { allowedHttpHookUrls: ['https://managed.example/*'] }),
    ]);
    expect(view.get('allowedHttpHookUrls')).toEqual([
      'https://managed.example/*',
      'https://project.example/*',
      'https://user.example/*',
    ]);
  });

  test('an empty managed list does not remove the entries of the other files', () => {
    const view = createPolicyView([
      layerOf('managed', { httpHookAllowedEnvVars: [] }),
      layerOf('user', { httpHookAllowedEnvVars: ['MY_TOKEN'] }),
    ]);
    expect(view.get('httpHookAllowedEnvVars')).toEqual(['MY_TOKEN']);
  });

  test('a parent blocklist adds to the managed one', () => {
    const view = createPolicyView([
      layerOf('managed', { blockedMarketplaces: [github('evil/one')] }),
      layerOf('parent', { blockedMarketplaces: [github('evil/two')] }),
    ]);
    expect(plain(view.get('blockedMarketplaces'))).toEqual([
      github('evil/one'),
      github('evil/two'),
    ]);
  });

  test('a parent allowlist counts only when the managed source sets none', () => {
    const parent = layerOf('parent', { strictKnownMarketplaces: [github('parent/p')] });
    const managed = layerOf('managed', { strictKnownMarketplaces: [github('managed/m')] });
    expect(plain(createPolicyView([parent, managed]).get('strictKnownMarketplaces'))).toEqual([
      github('managed/m'),
    ]);
    expect(plain(createPolicyView([parent]).get('strictKnownMarketplaces'))).toEqual([
      github('parent/p'),
    ]);
  });

  test('a marketplace defined in two files is taken whole from the higher one', () => {
    const user = {
      acme: { source: { source: 'url', url: 'https://a.example/m.json', headers: { K: 'v' } } },
    };
    const project = { acme: { source: { source: 'url', url: 'https://b.example/m.json' } } };
    const view = createPolicyView([
      layerOf('user', { extraKnownMarketplaces: { ...user, only: { source: github('x/y') } } }),
      layerOf('project', { extraKnownMarketplaces: project }),
    ]);
    expect(plain(view.get('extraKnownMarketplaces'))).toEqual({
      ...project,
      only: { source: github('x/y') },
    });
  });

  test('plugins are decided per plugin id: the highest file that names one wins', () => {
    const view = createPolicyView([
      layerOf('user', { enabledPlugins: { 'a@m': true, 'b@m': true } }),
      layerOf('project', { enabledPlugins: { 'a@m': false } }),
    ]);
    expect(view.get('enabledPlugins')).toEqual({ 'a@m': false, 'b@m': true });
  });

  test('a map key named __proto__ stays a key', () => {
    const raw: unknown = JSON.parse('{"skillOverrides":{"__proto__":"off"}}');
    const merged = createPolicyView([layerOf('user', raw)]).get('skillOverrides');
    expect(Object.keys(merged ?? {})).toEqual(['__proto__']);
  });

  test('the value of a key no layer may carry is not merged, even in a hand-built layer', () => {
    const hand: SettingsLayer = { scope: 'user', settings: { strictKnownMarketplaces: [] } };
    expect(createPolicyView([hand]).get('strictKnownMarketplaces')).toBeUndefined();
  });

  test('the view merges hooks the way mergeHooks does', () => {
    const hooks = { Stop: [{ hooks: [{ type: 'command', command: 'x.sh' }] }] };
    expect(plain(createPolicyView([layerOf('user', { hooks })]).get('hooks'))).toEqual(hooks);
  });
});
