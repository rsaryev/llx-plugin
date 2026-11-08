/** The mods API: the `$` a hook receives, built from ports (plugins/mods/api.md, reference.md "Mods API methods"). */
export {
  createModsApi,
  type ModPluginRef,
  type ModsApiHandle,
  type ModsApiOptions,
} from './build.ts';
export { type Deps } from './call.ts';
export {
  createRegistries,
  toolFullName,
  type AgentType,
  type CommandDef,
  type ModRegistries,
  type Registry,
  type ToolDef,
} from './registries.ts';
export { createScope, type CallContext, type Scope } from './scope.ts';
export { createStateStore, type StateStore } from './state.ts';
export { atom, read, update, type Atom, type AtomKey, type StateHost } from './state-library.ts';
export { isValidModName, nameProblem } from './names.ts';
export { readEngineSettings, type EngineReadOptions } from './engine-settings.ts';
export { apiEventRules, withApiRules } from './rules.ts';
export type { ScopeBook } from './engine-create.ts';
export type * from './ports.ts';
