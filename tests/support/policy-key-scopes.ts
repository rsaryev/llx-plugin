/** settings-reference.md, each policy key's Scope line; hand-copied test data, not the implementation registry. */
import type { PolicyKey } from '../../src/protocol/settings-keys.ts';
import type { PolicyScope } from '../../src/settings/index.ts';
/** A valid value for each key: one the key's repair keeps as it is. */
export const VALID: Readonly<Record<PolicyKey, unknown>> = {
  allowAllClaudeAiMcps: true,
  allowClaudeInChromeWithManagedMcp: true,
  allowManagedMcpServersOnly: true,
  allowedMcpServers: [{ serverName: 'search' }],
  allowedProviders: ['bedrock'],
  availableModelsMatch: 'exact',
  deniedMcpServers: [{ serverUrl: 'https://evil.example/*' }],
  deniedModels: ['opus'],
  disableSideloadFlags: true,
  forceLoginOrgUUID: '11111111-1111-4111-8111-111111111111',
  forceRemoteSettingsRefresh: true,
  gatewayInternalNetworks: ['11.22.33.0/24'],
  managedMcpServers: { search: { type: 'http', url: 'https://mcp.example.com' } },
  managedSourcesBehavior: 'merge',
  parentSettingsBehavior: 'merge',
  policyHelper: { path: '/opt/policy-helper' },
  wslInheritsWindowsSettings: true,
  allowManagedHooksOnly: true,
  allowManagedPermissionRulesOnly: true,
  allowedChannelPlugins: [{ marketplace: 'claude-plugins-official', plugin: 'telegram' }],
  allowedHttpHookUrls: ['https://hooks.example.com/*'],
  appendPlugins: ['audit@acme'],
  autoMode: { environment: ['Trusted: github.com/acme'] },
  blockedMarketplaces: [{ source: 'github', repo: 'evil/plugins' }],
  channelsEnabled: true,
  disableAllHooks: true,
  disableAutoMode: 'disable',
  disableBundledSkills: true,
  disableClaudeAiConnectors: true,
  disableCommandPluginSources: true,
  disableSkillShellExecution: true,
  disableWorkflows: true,
  disabledMcpjsonServers: ['filesystem'],
  enableAllProjectMcpServers: true,
  enableWorkflows: true,
  enabledMcpjsonServers: ['memory', 'github'],
  enabledPlugins: { 'formatter@team-tools': true },
  extraKnownMarketplaces: { acme: { source: { source: 'github', repo: 'acme/plugins' } } },
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x.sh' }] }] },
  httpHookAllowedEnvVars: ['MY_TOKEN'],
  permissions: { allow: ['Bash(npm run *)'] },
  pluginConfigs: { 'formatter@team-tools': { options: { style: 'tabs' } } },
  pluginSuggestionMarketplaces: ['acme'],
  pluginTrustMessage: 'Plugins here are reviewed by security.',
  prependPlugins: ['guard@acme'],
  skillOverrides: { deploy: 'off' },
  skipAutoPermissionPrompt: true,
  skipDangerousModePermissionPrompt: true,
  strictKnownMarketplaces: [{ source: 'github', repo: 'acme/plugins' }],
  strictPluginOnlyCustomization: ['hooks'],
  syncClaudeAiPlugins: false,
  syncClaudeAiSkills: false,
  useAutoModeDuringPlan: false,
  workflowKeywordTriggerEnabled: false,
  workflowSizeGuideline: 'small',
};
const FILES: readonly PolicyScope[] = ['managed', 'flag', 'local', 'project', 'user'];
/** The files each key's **Scope** line allows, copied by hand from settings-reference.md. */
export const ANY: readonly PolicyKey[] = [
  'allowedHttpHookUrls',
  'allowedMcpServers',
  'deniedMcpServers',
  'forceLoginOrgUUID',
  'disableAllHooks',
  'disableAutoMode',
  'disableBundledSkills',
  'disableClaudeAiConnectors',
  'disableSkillShellExecution',
  'disableWorkflows',
  'disabledMcpjsonServers',
  'enableAllProjectMcpServers',
  'enabledMcpjsonServers',
  'enabledPlugins',
  'enableWorkflows',
  'extraKnownMarketplaces',
  'hooks',
  'httpHookAllowedEnvVars',
  'permissions',
  'skillOverrides',
  'workflowKeywordTriggerEnabled',
  'workflowSizeGuideline',
];
export const MANAGED: readonly PolicyKey[] = [
  'allowAllClaudeAiMcps',
  'allowClaudeInChromeWithManagedMcp',
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
  'allowManagedPermissionRulesOnly',
  'blockedMarketplaces',
  'channelsEnabled',
  'disableCommandPluginSources',
  'pluginSuggestionMarketplaces',
  'pluginTrustMessage',
  'strictKnownMarketplaces',
  'strictPluginOnlyCustomization',
];
export const USER_OR_MANAGED: readonly PolicyKey[] = [
  'appendPlugins',
  'pluginConfigs',
  'prependPlugins',
  'skipAutoPermissionPrompt',
];
/** `autoMode`: "User or managed", and read from `--settings` too (auto-mode-config.md, "Where the classifier reads configuration"). */
export const USER_FLAG_MANAGED: readonly PolicyKey[] = ['autoMode'];
export const USER_LOCAL_MANAGED_FLAG: readonly PolicyKey[] = [
  'skipDangerousModePermissionPrompt',
  'syncClaudeAiPlugins',
  'syncClaudeAiSkills',
  'useAutoModeDuringPlan',
];

/** Where a parent (the SDK `managedSettings`) is documented to pass a key. */
export const PARENT_KEYS: readonly PolicyKey[] = [
  'allowedMcpServers',
  'deniedMcpServers',
  'allowedProviders',
  'forceLoginOrgUUID',
  'disableAllHooks',
  'disableSkillShellExecution',
  'strictKnownMarketplaces',
  'blockedMarketplaces',
  'strictPluginOnlyCustomization',
  'permissions',
];

/** The only keys a `--add-dir` directory's settings carry (permissions.md). */
const ADD_DIR_KEYS: readonly PolicyKey[] = ['enabledPlugins', 'extraKnownMarketplaces'];

export const scopesOf = (key: PolicyKey): readonly PolicyScope[] => {
  if (ANY.includes(key)) return ADD_DIR_KEYS.includes(key) ? [...FILES, 'addDir'] : FILES;
  if (MANAGED.includes(key)) return ['managed'];
  if (USER_OR_MANAGED.includes(key)) return ['user', 'managed'];
  if (USER_FLAG_MANAGED.includes(key)) return ['user', 'flag', 'managed'];
  return ['user', 'local', 'managed', 'flag'];
};
