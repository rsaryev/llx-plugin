import { DOCUMENTED_TOOLS, SDK_ONLY_TOOLS, REMOVED_TOOLS } from '../../protocol/tool-names.ts';
import type { DocumentedTool } from '../../protocol/tool-names.ts';
import type { RuleFormatId } from './rule-formats.ts';

/**
 * What tools-reference.md says about a tool in rules: the "Permission required" column of the tools
 * table and the "Rule format" table ("Configure tools with permission rules and hooks"), whose
 * "Applies to" column names the tools each format covers; "Tools not listed here ... accept only
 * the bare tool name with no specifier".
 */
export interface ToolEntry {
  /** The tool prompts in Manual mode for paths inside the working directory. */
  readonly permissionRequired: boolean;
  readonly ruleFormat: RuleFormatId;
}

const yes = (ruleFormat: RuleFormatId = 'bare'): ToolEntry => ({
  permissionRequired: true,
  ruleFormat,
});
const no = (ruleFormat: RuleFormatId = 'bare'): ToolEntry => ({
  permissionRequired: false,
  ruleFormat,
});

/** One entry per documented tool: a tool the table adds fails the typecheck until it is described here. */
export const TOOL_CATALOG: { readonly [T in DocumentedTool]: ToolEntry } = {
  Agent: no('subagent-type'),
  Artifact: yes(),
  AskUserQuestion: no(),
  Bash: yes('command'),
  CronCreate: no(),
  CronDelete: no(),
  CronList: no(),
  Edit: yes('edit-path'),
  EndConversation: no(),
  EnterPlanMode: no(),
  EnterWorktree: yes(),
  ExitPlanMode: yes(),
  ExitWorktree: no(),
  Glob: no('read-path'),
  Grep: no('read-path'),
  ListAgents: no(),
  ListMcpResourcesTool: no(),
  LSP: no('read-path'),
  Monitor: yes('command'),
  NotebookEdit: yes('edit-path'),
  PowerShell: yes('powershell-command'),
  PushNotification: no(),
  Read: no('read-path'),
  ReadMcpResourceTool: no(),
  RemoteTrigger: no(),
  ReportFindings: no(),
  ScheduleWakeup: no(),
  SendFeedback: no(),
  SendMessage: no(),
  SendUserFile: no(),
  ShareOnboardingGuide: yes(),
  Skill: yes('skill-name'),
  SubagentHandback: no(),
  TaskCreate: no(),
  TaskGet: no(),
  TaskList: no(),
  TaskOutput: no(),
  TaskStop: no(),
  TaskUpdate: no(),
  TodoWrite: no(),
  ToolSearch: no(),
  WaitForMcpServers: no(),
  WebFetch: yes('domain'),
  WebSearch: yes(),
  Workflow: yes(),
  Write: yes('edit-path'),
};

const ENTRY_OF: ReadonlyMap<string, ToolEntry> = new Map(
  DOCUMENTED_TOOLS.map((tool) => [tool, TOOL_CATALOG[tool]]),
);

/** The entry of a documented tool, or `undefined` for any other name (an MCP tool, a typo). */
export const catalogEntry = (toolName: string): ToolEntry | undefined => ENTRY_OF.get(toolName);

const REMOVED: ReadonlySet<string> = new Set(REMOVED_TOOLS);

/**
 * The tool names a rule can name without a typo warning: the documented tools Claude Code still
 * has and the SDK's own tools the docs leave undescribed. Pass it to `ruleIssues`.
 */
export const KNOWN_TOOLS: ReadonlySet<string> = new Set<string>([
  ...DOCUMENTED_TOOLS.filter((tool) => !REMOVED.has(tool)),
  ...SDK_ONLY_TOOLS,
]);

/** Whether `toolName` is a built-in tool Claude Code has (the removed `TaskOutput` is not). */
export const isKnownTool = (toolName: string): boolean => KNOWN_TOOLS.has(toolName);

/**
 * `DecideContext.requiresPermission` for the kit's catalog: the "Permission required" column for a
 * documented tool, and `true` for any other name (an MCP tool prompts "on first use of each tool",
 * mcp.md; spec/judgments.md).
 */
export const toolRequiresPermission = (toolName: string): boolean =>
  catalogEntry(toolName)?.permissionRequired ?? true;
