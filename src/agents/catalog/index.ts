/** The subagent catalog: where subagents come from, which one a name means, and who may spawn whom. */
export { builtinAgents, type BuiltinPolicy } from './builtin.ts';

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
  type AgentSetting,
  type SessionAgentChoice,
  type SessionAgentSource,
  type TypeaheadEntry,
} from './invoke.ts';
export {
  namedSubagent,
  nestingAt,
  spawnableAgents,
  spawnDepthLimit,
  spawnRefusal,
  type NamedSubagent,
  type NamedSubagentInput,
  type Nesting,
} from './spawn.ts';
export {
  catalogAgentOf,
  catalogTier,
  type AgentFolderScope,
  type CatalogAgent,
  type CatalogSource,
  type CatalogTier,
  type StartContext,
} from './types.ts';
