import type { PermissionMode } from '../protocol/official.ts';
import type { DocumentedTool } from '../protocol/tool-names.ts';

/** How a subagent is started, as far as its tools are concerned. */
export interface SubagentRun {
  /** A fork "skips both filters and receives the main conversation's exact tool pool". */
  readonly kind: 'subagent' | 'fork';
  /** Runs in the background: the second filter applies. */
  readonly background: boolean;
  /** At the depth limit Claude Code withholds `Agent` from every subagent. */
  readonly atDepthLimit: boolean;
  /** The subagent's own `permissionMode`: `ExitPlanMode` stays only for `plan`. */
  readonly permissionMode: PermissionMode;
  /** The agent runs as the main thread (`claude --agent` or the `agent` setting). */
  readonly asMainThread: boolean;
  /**
   * The host gives this subagent `SubagentHandback` (tools-reference.md: auto mode, a local
   * subagent that is not a fork). It is granted whatever `tools` and `disallowedTools` say.
   */
  readonly handback?: boolean;
  /**
   * The subagent is an agent team teammate (sub-agents.md, "Available tools"): in the background
   * it also keeps the task tools and cron tools.
   */
  readonly teammate?: boolean;
}

/** The first filter, sub-agents.md "Available tools": removed "even when listed in the `tools` field". */
const REMOVED_FROM_EVERY_SUBAGENT = [
  'AskUserQuestion',
  'EndConversation',
  'EnterPlanMode',
  'ScheduleWakeup',
  'WaitForMcpServers',
  'Workflow',
] as const satisfies readonly DocumentedTool[];

/** The built-in tools a background subagent keeps (the second filter); every MCP tool stays. */
export const BACKGROUND_BUILTIN_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'LSP',
  'Bash',
  'PowerShell',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'Skill',
  'ToolSearch',
  'EnterWorktree',
  'ExitWorktree',
  'Monitor',
  'TaskStop',
  'SendMessage',
  'Artifact',
] as const satisfies readonly DocumentedTool[];

/** What makes the first filter remove a tool of this name: always, or when the run says so. */
const FIRST_FILTER: ReadonlyMap<string, (run: SubagentRun) => boolean> = new Map<
  string,
  (run: SubagentRun) => boolean
>([
  ...REMOVED_FROM_EVERY_SUBAGENT.map((tool): [string, () => boolean] => [tool, () => true]),
  ['Agent', (run) => run.atDepthLimit],
  ['ExitPlanMode', (run) => run.permissionMode !== 'plan'],
  // Never inherited: the host grants it (`SubagentRun.handback`), which also beats `disallowedTools`.
  ['SubagentHandback', () => true],
]);

/** What a teammate keeps in the background on top of `BACKGROUND_BUILTIN_TOOLS`. */
const TEAMMATE_BACKGROUND_TOOLS = [
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskUpdate',
  'CronCreate',
  'CronDelete',
  'CronList',
] as const satisfies readonly DocumentedTool[];

const BACKGROUND_KEEPS: ReadonlySet<string> = new Set(BACKGROUND_BUILTIN_TOOLS);
const TEAMMATE_KEEPS: ReadonlySet<string> = new Set(TEAMMATE_BACKGROUND_TOOLS);

/** "Apart from `Agent` and `ExitPlanMode`, which follow the first filter's conditions wherever the subagent runs". */
const FOLLOWS_FIRST_FILTER_ONLY: ReadonlySet<string> = new Set(['Agent', 'ExitPlanMode']);

/**
 * Whether a subagent of this run never gets the built-in tool `tool`: the first filter, then (for
 * a background run) the second. A fork and an agent running as the main thread are not narrowed
 * (spec/judgments.md).
 */
export function removedFromSubagent(tool: string, run: SubagentRun): boolean {
  if (run.asMainThread) return false;
  if (FIRST_FILTER.get(tool)?.(run) === true) return true;
  if (!run.background || FOLLOWS_FIRST_FILTER_ONLY.has(tool) || BACKGROUND_KEEPS.has(tool)) {
    return false;
  }
  return !(run.teammate === true && TEAMMATE_KEEPS.has(tool));
}
