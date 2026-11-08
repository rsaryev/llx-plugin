import type { BuiltinToolName } from './official-tools.ts';
import type { Assert, Equal } from './type-equality.ts';

/**
 * The tools of tools-reference.md ("Tool" column of the first table), in the table's order. The
 * docs say which tools exist and what each is called; a rule or a hook matcher uses these
 * canonical names, never the label a tool shows in the transcript (permissions.md, "Match all
 * uses of a tool").
 */
export const DOCUMENTED_TOOLS = [
  'Agent',
  'Artifact',
  'AskUserQuestion',
  'Bash',
  'CronCreate',
  'CronDelete',
  'CronList',
  'Edit',
  'EndConversation',
  'EnterPlanMode',
  'EnterWorktree',
  'ExitPlanMode',
  'ExitWorktree',
  'Glob',
  'Grep',
  'ListAgents',
  'ListMcpResourcesTool',
  'LSP',
  'Monitor',
  'NotebookEdit',
  'PowerShell',
  'PushNotification',
  'Read',
  'ReadMcpResourceTool',
  'RemoteTrigger',
  'ReportFindings',
  'ScheduleWakeup',
  'SendFeedback',
  'SendMessage',
  'SendUserFile',
  'ShareOnboardingGuide',
  'Skill',
  'SubagentHandback',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'TaskUpdate',
  'TodoWrite',
  'ToolSearch',
  'WaitForMcpServers',
  'WebFetch',
  'WebSearch',
  'Workflow',
  'Write',
] as const;

export type DocumentedTool = (typeof DOCUMENTED_TOOLS)[number];

/**
 * Tools the SDK's `BUILTIN_TOOL_NAMES` lists that the tools-reference table does not: the docs
 * are silent on them, so the kit names them but claims nothing about their behaviour.
 */
export const SDK_ONLY_TOOLS = [
  'ClaudeDesign',
  'OfferChromeSetup',
  'Projects',
  'propose_skills',
  'ProposeGoal',
  'ReadMcpResourceDirTool',
  'ReadNotifications',
  'SendUserMessage',
  'ShowOnboardingRolePicker',
] as const;

export type SdkOnlyTool = (typeof SDK_ONLY_TOOLS)[number];

/**
 * Tools Claude Code removed but a rule may still name: the table says `TaskOutput` was "Removed in
 * v2.1.277", and permissions.md ("Tool name wildcards") exempts removed tools from the
 * matches-no-tool warning.
 */
export const REMOVED_TOOLS = ['TaskOutput'] as const satisfies readonly DocumentedTool[];

export type RemovedTool = (typeof REMOVED_TOOLS)[number];

/**
 * @public A compile-time drift guard: a tool the SDK adds, or the table drops, fails the typecheck
 * until the lists are updated.
 */
export type ToolNamesMatchSdk = Assert<
  Equal<Exclude<DocumentedTool, RemovedTool> | SdkOnlyTool, BuiltinToolName>
>;
