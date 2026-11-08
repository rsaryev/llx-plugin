/** Settings layers and the policy keys, pure over data (docs/API.md, "Settings"). */
export type { PolicyContext } from './context.ts';
export { mergeSettingsHooks } from './hooks-policy.ts';
export { KEY_SPECS, SCOPE_RULES, admits, type KeySpec, type ScopeRule } from './key-spec.ts';
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
export { loadSettingsLayers, type SettingsSources } from './sources.ts';
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
  type IgnoredReason,
  type IgnoredVariable,
  type SettingsEnv,
  type SettingsEnvContext,
} from './env.ts';
export {
  AUTO_MODE_LISTS,
  BYPASS_AS_ROOT,
  BYPASS_IGNORED_NOTICE,
  HIPAA_AUTO_NOTICE,
  SURFACES,
  bypassAcceptance,
  createPermissionsPolicy,
  type Acceptance,
  type AutoModeList,
  type AutoModeSettings,
  type PermissionsPolicy,
  type SettingsDirectory,
  type SettingsRule,
  type StartInput,
  type StartSource,
  type StartingMode,
  type Surface,
} from './permissions/index.ts';
export {
  settingsLocations,
  type SettingsLocations,
  type SettingsLocationsInput,
} from './locations.ts';
