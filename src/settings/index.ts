/** Settings layers and the policy keys, pure over data (docs/API.md, "Settings"). */
export { policyContext, type PolicyContext } from './context.ts';
export { problemKind, type ProblemKind } from './broken-file.ts';
export { KEY_SPECS, SPECS, admits, type KeySpec, type ScopeRule } from './key-spec.ts';
export type { ValueSpec } from './value-spec.ts';
export { POLICY_SCOPES, type KeyHolder, type PolicyScope, type PolicyLayer } from './layers.ts';
export type { MergeKind } from './merge.ts';
export { readSettingsLayer } from './read-layer.ts';
export type { RepairKind } from './repair/kinds.ts';
export { loadSettingsLayers, type LoadedSettings, type SettingsSources } from './sources.ts';
export { createPolicyView, type PolicyView } from './view.ts';
export {
  resolvePolicy,
  type MarketplaceSettingsPolicy,
  type ResolveInput,
  type ResolvedPolicy,
} from './resolve.ts';
export {
  applySettingsEnv,
  resolveSettingsEnv,
  type SettingsEnv,
  type SettingsEnvContext,
} from './env/settings-env.ts';
export {
  AUTO_MODE_LISTS,
  LAUNCH_SURFACES,
  createPermissionsPolicy,
  type AutoModeList,
  type AutoModeSettings,
  type PermissionsPolicy,
  type SettingsDirectory,
  type SettingsRule,
  type StartInput,
  type StartSource,
  type StartingMode,
  type LaunchSurface,
} from './permissions/index.ts';
export {
  settingsLocations,
  type SettingsLocations,
  type SettingsLocationsInput,
} from './locations.ts';
export {
  officialMarketplaceAutoinstallEnabled,
  permissionPromptNotifyHooksEnabled,
  policySkillsEnabled,
  backgroundPluginRefreshEnabled,
  maxConcurrentSubagents,
  pluginGitTimeoutMs,
  preferHttps,
  type SyncInstallWait,
  syncPluginInstall,
  telemetryOptedOut,
  pluginSeedDirectories,
  claudeTempDirectory,
} from './host-switches.ts';
