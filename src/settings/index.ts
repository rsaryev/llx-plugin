/** Settings layers and the policy keys, pure over data (docs/API.md, "Settings"). */
export type { PolicyContext } from './context.ts';
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
export { loadSettingsLayers, type SettingsSources } from './sources.ts';
export { createPolicyView, type PolicyView } from './view.ts';
export {
  resolvePolicy,
  type MarketplaceSettingsPolicy,
  type ResolveInput,
  type ResolvedPolicy,
} from './resolve.ts';
