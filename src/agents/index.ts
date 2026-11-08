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
