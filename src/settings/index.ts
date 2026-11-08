/** Settings layers and the policy keys, pure over data (docs/API.md, "Settings"). */
export { mergeHooks } from './hooks-policy.ts';
export { KEY_SPECS, SCOPE_RULES, admits, type KeySpec, type ScopeRule } from './key-spec.ts';
export {
  POLICY_SCOPES,
  SCOPE_RANK,
  orderedLayers,
  type KeyHolder,
  type PolicyScope,
  type SettingsLayer,
} from './layers.ts';
export { MERGE_KINDS, type MergeKind } from './merge.ts';
export { readSettingsLayer } from './read-layer.ts';
export { REPAIR_KINDS, type RepairKind } from './repair.ts';
export { loadSettingsLayers, type SettingsSources } from './sources.ts';
export { createPolicyView, type PolicyView } from './view.ts';
