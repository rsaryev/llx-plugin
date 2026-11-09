/** The mods API: the `$` a hook receives, built from ports (plugins/mods/api.md, reference.md "Mods API methods"). */
export {
  createModsApi,
  type ModPluginRef,
  type ModsApiHandle,
  type ModsApiOptions,
} from './build.ts';
export { type Deps } from './call.ts';
export {
  describeApi,
  type ApiDescription,
  type ApiMember,
  type ApiMemberKind,
  type ApiNamespace,
} from './describe.ts';
export {
  createRegistries,
  toolFullName,
  type AgentType,
  type CommandDef,
  type ModRegistries,
  type Registry,
  type ToolDef,
} from './registries.ts';
export {
  createReplayLedger,
  replayedLine,
  REPLAYED_CALLS,
  type ReplayedCall,
  type ReplayLedger,
  type ReplayMode,
} from './replay.ts';
export {
  createRunGate,
  HELD_AT_TIMEOUT,
  STOPPED_TOAST,
  openGate,
  QUEUE_DROPS,
  REFUSAL_REASONS,
  STOPPED_NOTICES,
  unsentReason,
  type NoticeKind,
  type NoticeOutcome,
  type RunGate,
  type RunLimits,
} from './gate.ts';
export { createScope, type CallContext, type Scope } from './scope.ts';
export { createStateStore, type StateStore } from './state.ts';
export { atom, read, update, type Atom, type AtomKey, type StateHost } from './state-library.ts';
export { isValidModName, nameProblem } from './names.ts';
export {
  settingsLayersForMods,
  createModSettingsReader,
  mergeModSettingsLayers,
} from './settings-layers.ts';
export { readEngineSettings, type EngineReadOptions } from './engine-settings.ts';
export { apiEventRules, withApiRules } from './rules.ts';
export { settleModApi, type ModApiSettlementOptions, type ScopeBook } from './engine-create.ts';
export { runScopedModCall } from './scoped-call.ts';
export type * from './ports.ts';
export { modFetchVerdict, type ModFetchFacts, type ModFetchVerdict } from './fetch-policy.ts';
