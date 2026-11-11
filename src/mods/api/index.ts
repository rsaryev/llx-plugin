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
  type AgentType,
  type BackdropBoard,
  type CommandDef,
  type CommandRunDepth,
  type CommandRuns,
  type ModRegistries,
  type RegisteredKind,
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
  QUEUE_DROPS,
  REFUSAL_REASONS,
  STOPPED_NOTICES,
  unsentReason,
  type NoticeKind,
  type NoticeOutcome,
  type RunGate,
  type RunLimits,
} from './gate.ts';
export { type CallContext, type Scope } from './scope.ts';
export {
  createStateStore,
  type StateEntry,
  type StateRef,
  type StateListener,
  type StateStore,
  type StateWrite,
} from './state.ts';
export {
  atom,
  INSTRUCTION_FILE_KINDS,
  TIERS,
  derive,
  memberOf,
  read,
  update,
  type Atom,
  type AtomKey,
  type Derived,
  type StateHost,
  type StateSource,
  type StateValue,
} from './state-library.ts';
export { contextUsage } from './context-usage.ts';
export { STATE_LIBRARY_SOURCE } from './state-library-source.ts';
export { isValidModName, nameProblem } from './names.ts';

export {
  settingsLayersForMods,
  createModSettingsReader,
  mergeModSettingsLayers,
} from './settings-layers.ts';
export { readEngineSettings, type EngineReadOptions } from './engine-settings.ts';
export { API_RULES } from './rules.ts';
export { commandPresentation, type CommandPresentation } from './command.ts';
export { settleModApi, type ModApiSettlementOptions, type ScopeBook } from './engine-create.ts';
export { runScopedModCall } from './scoped-call.ts';
export type * from './ports.ts';
export {
  OPTIONAL_PORT_DEFAULTS,
  withDefaultPorts,
  type ModHostPorts,
  type ModHostPortsInput,
  type ModOptionalPorts,
  type ModPlatformPorts,
  type ModSessionPorts,
} from './host-ports.ts';
export {
  modFetchVerdict,
  type FetchPolicyFacts,
  type ModFetchFacts,
  type ModFetchVerdict,
} from './fetch-policy.ts';
