/** Sub-agent behaviour above the file format: which tools a subagent gets, and how it is scoped. */
export { parseToolEntry, toolEntryMatches, type ToolEntry } from './tool-list.ts';
export { BACKGROUND_BUILTIN_TOOLS, removedFromSubagent, type SubagentRun } from './tool-filters.ts';
export {
  resolveSubagentTools,
  type AgentToolFields,
  type SpawnTypes,
  type ToolPool,
  type ToolRefusal,
  type ToolsOutcome,
} from './tool-resolution.ts';
export { CONNECTIONS, type BuiltinModelInput, type Connection } from './builtin-model.ts';
export {
  PERMISSION_MODE_INPUTS,
  PERMISSION_MODE_TRAITS,
  type GrantEnvironment,
  type MainStance,
  type PermissionModeTraits,
} from './permission-mode.ts';
export {
  baselineDecision,
  type ActionCategory,
  type BaselineAction,
  type BaselineDecision,
} from './permission-baseline.ts';
export {
  resolveSubagentPermissionMode,
  type SubagentModeBasis,
  type SubagentPermission,
  type SubagentPermissionInput,
} from './subagent-permission.ts';
export {
  agentHookGroups,
  hooksTrustGate,
  selectAgentHooks,
  type AgentHookContext,
  type AgentHookSelection,
  type AgentRunKind,
} from './hooks.ts';
export {
  claudeMdScopes,
  effectiveAutoCompactWindow,
  effectiveCacheTtl,
  mainSessionFirstTurn,
  runsInBackground,
  turnLimitOutcome,
  worktreeDisposition,
  type AutoCompactInput,
  type BackgroundInput,
  type ClaudeMdScopes,
  type TurnLimitOutcome,
  type WorktreeDisposition,
} from './launch.ts';
export {
  resolveSubagentEffort,
  resolveSubagentModel,
  type ModelSource,
  type SubagentEffortInput,
  type SubagentModel,
  type SubagentModelInput,
} from './launch-model.ts';
export {
  planAgentMemory,
  truncateMemoryIndex,
  type MemoryContext,
  type MemoryPlan,
} from './memory.ts';
export {
  agentFolderTrust,
  inlineServerLifecycle,
  resolveAgentMcpServers,
  type AgentFolderTrust,
  type AgentFolderTrustInput,
  type AgentMcpResolution,
  type InlineServerLifecycle,
  type McpPolicy,
  type McpSkipReason,
  type ProjectTrustEntry,
} from './mcp-scope.ts';
export {
  checkAgainstAllowlist,
  modelValueAccepted,
  type CheckedModel,
  type ModelAllowlist,
  type ModelCheckInput,
} from './model-choice.ts';
export {
  MODEL_ALIASES,
  modelFamily,
  modelValueKind,
  type ModelAlias,
  type ModelValueKind,
} from './model-value.ts';
export {
  planPreloadedSkills,
  type PreloadPlan,
  type SkillCatalog,
  type SkillSkipReason,
} from './preload-skills.ts';
export { afterHandbackDenial, type HandbackAfterDenial } from './handback-denial.ts';
export { permissionSubagentPromptSurface, type SubagentPromptSurface } from './prompt-surface.ts';
