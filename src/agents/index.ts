/** Sub-agent behaviour above the file format: which tools a subagent gets, and how it is scoped. */
export { parseToolEntry, toolEntryMatches, type ToolEntry } from './tool-list.ts';
export { BACKGROUND_BUILTIN_TOOLS, removedFromSubagent, type SubagentRun } from './tool-filters.ts';
export {
  resolveSubagentTools,
  type AgentToolFields,
  type ToolPool,
  type ToolRefusal,
  type ToolsOutcome,
} from './tool-resolution.ts';
export {
  PERMISSION_MODE_INPUTS,
  PERMISSION_MODE_TRAITS,
  type GrantEnvironment,
  type MainStance,
  type PermissionModeInput,
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
