/** The subagent catalog: where subagents come from, which one a name means, and who may spawn whom. */
export {
  BUILTIN_AGENT_NAMES,
  builtinAgents,
  type BuiltinAgentName,
  type BuiltinPolicy,
} from './builtin.ts';
export {
  AGENT_SCOPE_RULES,
  AGENTS_FOLDER,
  BUILTIN_PRIORITY,
  type AgentFolder,
  type AgentFolderContext,
  type AgentScanRequest,
  type AgentScopeRule,
} from './scopes.ts';
export {
  scanAgents,
  type AgentScanContext,
  type AgentScanOutcome,
  type ScannedAgent,
} from './scan.ts';
export {
  resolveAgents,
  resolveSubagentType,
  type AgentCatalog,
  type AgentSources,
  type Shadowed,
  type SubagentTypeOutcome,
} from './resolve.ts';
export {
  agentMentions,
  agentTypeahead,
  resumeSessionAgent,
  selectSessionAgent,
  sessionAgentLabel,
  type AgentMention,
  type MentionsFound,
  type ResumedSessionAgent,
  type SessionAgentChoice,
  type SessionAgentSource,
  type TypeaheadEntry,
} from './invoke.ts';
export {
  DEFAULT_SPAWN_DEPTH,
  namedSubagent,
  nestingAt,
  spawnableAgents,
  spawnDepthLimit,
  type NamedSubagent,
  type NamedSubagentInput,
  type Nesting,
} from './spawn.ts';
export {
  catalogAgentOf,
  isBuiltinAgent,
  type CatalogAgent,
  type CatalogSource,
  type StartContext,
} from './types.ts';
