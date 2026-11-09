/** Settings layers and the policy keys, pure over data (docs/API.md, "Settings"). */
export { policyContext, type PolicyContext } from './context.ts';
export { problemKind, type ProblemKind } from './broken-file.ts';
export { mergeSettingsHooks } from './hooks-policy.ts';
export {
  KEY_SPECS,
  SCOPE_RULES,
  SPECS,
  admits,
  type KeySpec,
  type ScopeRule,
  type ValueSpec,
} from './key-spec.ts';
export {
  POLICY_SCOPES,
  SCOPE_RANK,
  orderedLayers,
  type KeyHolder,
  type PolicyScope,
  type PolicyLayer,
} from './layers.ts';
export { MERGE_KINDS, type MergeKind } from './merge.ts';
export { readSettingsLayer } from './read-layer.ts';
export { REPAIR_KINDS, type RepairKind } from './repair.ts';
export { loadSettingsLayers, type LoadedSettings, type SettingsSources } from './sources.ts';
export { createPolicyView, type PolicyView } from './view.ts';
export {
  resolvePolicy,
  type MarketplaceSettingsPolicy,
  type ResolveInput,
  type ResolvedPolicy,
} from './resolve.ts';
export {
  IGNORED_REASONS,
  applySettingsEnv,
  resolveSettingsEnv,
  type IgnoredReason as IgnoredEnvReason,
  type IgnoredVariable,
  type SettingsEnv,
  type SettingsEnvContext,
} from './env.ts';
export {
  AUTO_MODE_LISTS,
  BYPASS_AS_ROOT,
  BYPASS_IGNORED_NOTICE,
  HIPAA_AUTO_NOTICE,
  LAUNCH_SURFACES,
  bypassAcceptance,
  createPermissionsPolicy,
  type BypassAcceptance,
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
export * from './host-switches.ts';
