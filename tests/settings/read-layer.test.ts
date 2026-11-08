/**
 * settings-reference.md § Settings index and each key's **Scope** line (Any file; Managed, "ignores
 * the key in user, project, and local settings and in `--settings`, with a warning"; User or
 * managed; User, local, or managed, and `--settings`), § "Marketplace key aliases" (the alias reads
 * as the canonical key; both in one file: the canonical value wins), managed-settings.md § "Keys
 * that fail closed" ("A `null` removes the key"), errors.md § "Managed settings document could not
 * be parsed" (the verbatim message), permissions.md § "Additional directories grant file access,
 * not configuration" (a `--add-dir` directory's settings carry `enabledPlugins` and
 * `extraKnownMarketplaces` only), claude-apps-gateway.md § "How hook and skill keys in parent
 * settings take effect" (which keys a parent passes). The keys have ids of their own, proven where
 * their behaviour is, so this file is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import { POLICY_KEYS, type PolicyKey } from '../../src/protocol/settings-keys.ts';
import { POLICY_SCOPES, readSettingsLayer, type PolicyScope } from '../../src/settings/index.ts';
import { issuesOf, layerOf, plain } from '../support/settings-layers.ts';

/** A valid value for each key: one the key's repair keeps as it is. */
const VALID: Readonly<Record<PolicyKey, unknown>> = {
  allowAllClaudeAiMcps: true,
  allowManagedMcpServersOnly: true,
  allowedMcpServers: [{ serverName: 'search' }],
  allowedProviders: ['bedrock'],
  availableModelsMatch: 'exact',
  deniedMcpServers: [{ serverUrl: 'https://evil.example/*' }],
  deniedModels: ['opus'],
  disableSideloadFlags: true,
  forceLoginOrgUUID: '11111111-1111-4111-8111-111111111111',
  forceRemoteSettingsRefresh: true,
  gatewayInternalNetworks: ['203.0.113.0/24'],
  managedMcpServers: { search: { type: 'http', url: 'https://mcp.example.com' } },
  managedSourcesBehavior: 'merge',
  parentSettingsBehavior: 'merge',
  policyHelper: { path: '/opt/policy-helper' },
  wslInheritsWindowsSettings: true,
  allowManagedHooksOnly: true,
  allowedChannelPlugins: [{ marketplace: 'claude-plugins-official', plugin: 'telegram' }],
  allowedHttpHookUrls: ['https://hooks.example.com/*'],
  appendPlugins: ['audit@acme'],
  blockedMarketplaces: [{ source: 'github', repo: 'evil/plugins' }],
  channelsEnabled: true,
  disableAllHooks: true,
  disableBundledSkills: true,
  disableCommandPluginSources: true,
  disableSkillShellExecution: true,
  disableWorkflows: true,
  enableWorkflows: true,
  enabledPlugins: { 'formatter@team-tools': true },
  extraKnownMarketplaces: { acme: { source: { source: 'github', repo: 'acme/plugins' } } },
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x.sh' }] }] },
  httpHookAllowedEnvVars: ['MY_TOKEN'],
  pluginConfigs: { 'formatter@team-tools': { options: { style: 'tabs' } } },
  pluginSuggestionMarketplaces: ['acme'],
  pluginTrustMessage: 'Plugins here are reviewed by security.',
  prependPlugins: ['guard@acme'],
  skillOverrides: { deploy: 'off' },
  strictKnownMarketplaces: [{ source: 'github', repo: 'acme/plugins' }],
  strictPluginOnlyCustomization: ['hooks'],
  syncClaudeAiPlugins: false,
  syncClaudeAiSkills: false,
  workflowKeywordTriggerEnabled: false,
  workflowSizeGuideline: 'small',
};

const FILES: readonly PolicyScope[] = ['managed', 'flag', 'local', 'project', 'user'];

/** The files each key's **Scope** line allows, copied by hand from settings-reference.md. */
const ANY: readonly PolicyKey[] = [
  'allowedHttpHookUrls',
  'allowedMcpServers',
  'deniedMcpServers',
  'forceLoginOrgUUID',
  'disableAllHooks',
  'disableBundledSkills',
  'disableSkillShellExecution',
  'disableWorkflows',
  'enabledPlugins',
  'enableWorkflows',
  'extraKnownMarketplaces',
  'hooks',
  'httpHookAllowedEnvVars',
  'skillOverrides',
  'workflowKeywordTriggerEnabled',
  'workflowSizeGuideline',
];
const MANAGED: readonly PolicyKey[] = [
  'allowAllClaudeAiMcps',
  'allowManagedMcpServersOnly',
  'allowedProviders',
  'availableModelsMatch',
  'deniedModels',
  'disableSideloadFlags',
  'forceRemoteSettingsRefresh',
  'gatewayInternalNetworks',
  'managedMcpServers',
  'managedSourcesBehavior',
  'parentSettingsBehavior',
  'policyHelper',
  'wslInheritsWindowsSettings',
  'allowedChannelPlugins',
  'allowManagedHooksOnly',
  'blockedMarketplaces',
  'channelsEnabled',
  'disableCommandPluginSources',
  'pluginSuggestionMarketplaces',
  'pluginTrustMessage',
  'strictKnownMarketplaces',
  'strictPluginOnlyCustomization',
];
const USER_OR_MANAGED: readonly PolicyKey[] = ['appendPlugins', 'pluginConfigs', 'prependPlugins'];
const USER_LOCAL_MANAGED_FLAG: readonly PolicyKey[] = ['syncClaudeAiPlugins', 'syncClaudeAiSkills'];

/**
 * Where a parent (the SDK `managedSettings`) is documented to pass a key: the gateway page's
 * restrictive keys and the four managed-settings.md, "Let an embedding host add policy", checks.
 */
const PARENT_KEYS: readonly PolicyKey[] = [
  'allowedMcpServers',
  'allowedProviders',
  'deniedMcpServers',
  'forceLoginOrgUUID',
  'disableAllHooks',
  'disableSkillShellExecution',
  'strictKnownMarketplaces',
  'blockedMarketplaces',
  'strictPluginOnlyCustomization',
];

/** The only keys a `--add-dir` directory's settings carry (permissions.md). */
const ADD_DIR_KEYS: readonly PolicyKey[] = ['enabledPlugins', 'extraKnownMarketplaces'];

const scopesOf = (key: PolicyKey): readonly PolicyScope[] => {
  if (ANY.includes(key)) return ADD_DIR_KEYS.includes(key) ? [...FILES, 'addDir'] : FILES;
  if (MANAGED.includes(key)) return ['managed'];
  if (USER_OR_MANAGED.includes(key)) return ['user', 'managed'];
  return ['user', 'local', 'managed', 'flag'];
};

const carried = (scope: PolicyScope, key: PolicyKey): boolean =>
  key in layerOf(scope, { [key]: VALID[key] }).settings;

describe('the scope of every key', () => {
  test('the four tables above cover every key once', () => {
    const all = [...ANY, ...MANAGED, ...USER_OR_MANAGED, ...USER_LOCAL_MANAGED_FLAG];
    expect(all.toSorted()).toEqual([...POLICY_KEYS].toSorted());
  });

  test('a key is read from the files its Scope line names and from no other', () => {
    for (const key of POLICY_KEYS) {
      const expected = scopesOf(key);
      for (const scope of POLICY_SCOPES.filter((one) => one !== 'parent')) {
        expect([key, scope, carried(scope, key)]).toEqual([key, scope, expected.includes(scope)]);
      }
    }
  });

  test('a parent passes the keys the gateway page names, and no other', () => {
    for (const key of POLICY_KEYS) {
      expect([key, carried('parent', key)]).toEqual([key, PARENT_KEYS.includes(key)]);
    }
  });

  test('a key dropped for its scope is reported with a warning that names the key and the source', () => {
    const found = issuesOf('user', { strictKnownMarketplaces: [], model: 'opus' });
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe('warning');
    expect(found[0]?.path).toBe('user:strictKnownMarketplaces');
    expect(found[0]?.message).toContain('user settings');
  });

  test('a key a parent may only pass empty is dropped when it has entries', () => {
    expect(layerOf('parent', { allowedHttpHookUrls: [] }).settings).toEqual({
      allowedHttpHookUrls: [],
    });
    expect(layerOf('parent', { httpHookAllowedEnvVars: [] }).settings).toEqual({
      httpHookAllowedEnvVars: [],
    });
    expect(layerOf('parent', { allowedHttpHookUrls: ['https://a.example/*'] }).settings).toEqual(
      {},
    );
    expect(layerOf('parent', { httpHookAllowedEnvVars: ['TOKEN'] }).settings).toEqual({});
  });
});

describe('what a source carries besides policy keys', () => {
  test('keys the kit has no policy for stay as written', () => {
    const raw = { model: 'opus', permissions: { allow: ['Bash(git *)'] } };
    for (const scope of ['managed', 'flag', 'local', 'project', 'user', 'parent'] as const) {
      expect(plain(layerOf(scope, raw).settings)).toEqual(raw);
    }
  });

  test('a --add-dir directory carries enabledPlugins and extraKnownMarketplaces only', () => {
    const raw = {
      enabledPlugins: { 'a@b': true },
      extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'a/b' } } },
      hooks: VALID.hooks,
      model: 'opus',
    };
    expect(Object.keys(layerOf('addDir', raw).settings).toSorted()).toEqual([
      'enabledPlugins',
      'extraKnownMarketplaces',
    ]);
    expect(issuesOf('addDir', { model: 'opus' })).toEqual([]);
  });

  test('a null removes the key', () => {
    expect(layerOf('managed', { disableAllHooks: null, hooks: null }).settings).toEqual({});
    expect(issuesOf('managed', { disableAllHooks: null })).toEqual([]);
  });

  test('a key named __proto__ stays a key', () => {
    const raw = JSON.parse('{"__proto__":{"x":1}}');
    expect(Object.keys(layerOf('user', raw).settings)).toEqual(['__proto__']);
  });
});

describe('marketplace key aliases', () => {
  const entry = { source: 'github', repo: 'acme/plugins' };

  test('allowedMarketplaces reads as strictKnownMarketplaces', () => {
    expect(plain(layerOf('managed', { allowedMarketplaces: [entry] }).settings)).toEqual({
      strictKnownMarketplaces: [entry],
    });
  });

  test('additionalMarketplaces reads as extraKnownMarketplaces', () => {
    const marketplaces = { acme: { source: entry } };
    expect(plain(layerOf('project', { additionalMarketplaces: marketplaces }).settings)).toEqual({
      extraKnownMarketplaces: marketplaces,
    });
  });

  test('with both spellings in one file the canonical value is used and the alias ignored', () => {
    const other = { source: 'github', repo: 'other/plugins' };
    expect(
      plain(
        layerOf('managed', { allowedMarketplaces: [other], strictKnownMarketplaces: [entry] })
          .settings,
      ),
    ).toEqual({ strictKnownMarketplaces: [entry] });
  });

  test('an alias is read exactly as the canonical key: a file that cannot carry it drops it', () => {
    const found = issuesOf('user', { allowedMarketplaces: [entry] });
    expect(layerOf('user', { allowedMarketplaces: [entry] }).settings).toEqual({});
    expect(found.map((one) => one.path)).toEqual(['user:strictKnownMarketplaces']);
  });

  test('an alias is repaired as the canonical key is', () => {
    expect(plain(layerOf('managed', { allowedMarketplaces: 'github' }).settings)).toEqual({
      strictKnownMarketplaces: [],
    });
  });
});

describe('a source that is not a JSON object', () => {
  test('an absent source is an empty layer without a word', () => {
    expect(readSettingsLayer('user', undefined)).toEqual({
      layer: { scope: 'user', settings: {} },
      issues: [],
    });
  });

  test('managed: the message of errors.md, an error, and none of its settings in effect', () => {
    for (const raw of ['text', 5, [], null]) {
      const { layer, issues } = readSettingsLayer('managed', raw);
      expect(layer.settings).toEqual({});
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe('error');
      expect(issues[0]?.message).toBe(
        'Managed settings document could not be parsed as a JSON object; none of its settings are in effect. Fix or remove it.',
      );
    }
  });

  test('another source is skipped with a Settings Error', () => {
    const { layer, issues } = readSettingsLayer('project', ['x']);
    expect(layer.settings).toEqual({});
    expect(issues.map((one) => one.severity)).toEqual(['error']);
  });
});
