import type { RuleFormatId } from '../../src/rules/index.ts';

/**
 * The tools table of tools-reference.md copied by hand: the "Permission required" column, the
 * "Rule format" table's "Applies to" column (a tool it does not list takes only its bare name),
 * and a call of each tool that stays inside the working directory `/work/app`. Tests read this,
 * never the catalog, so the catalog is checked against the docs and not against itself.
 */
export interface ToolRow {
  readonly tool: string;
  readonly permissionRequired: boolean;
  readonly format: RuleFormatId;
  readonly input: unknown;
}

const row = (
  tool: string,
  permissionRequired: 'Yes' | 'No',
  format: RuleFormatId = 'bare',
  input: unknown = {},
): ToolRow => ({ tool, permissionRequired: permissionRequired === 'Yes', format, input });

export const TOOL_TABLE: readonly ToolRow[] = [
  row('Agent', 'No', 'subagent-type', {
    subagent_type: 'Explore',
    prompt: 'look',
    description: 'x',
  }),
  row('Artifact', 'Yes', 'bare', { file_path: '/work/app/page.html' }),
  row('AskUserQuestion', 'No'),
  row('Bash', 'Yes', 'command', { command: 'rm -rf build' }),
  row('CronCreate', 'No'),
  row('CronDelete', 'No'),
  row('CronList', 'No'),
  row('Edit', 'Yes', 'edit-path', {
    file_path: '/work/app/a.ts',
    old_string: 'a',
    new_string: 'b',
  }),
  row('EndConversation', 'No'),
  row('EnterPlanMode', 'No'),
  row('EnterWorktree', 'Yes'),
  row('ExitPlanMode', 'Yes'),
  row('ExitWorktree', 'No'),
  row('Glob', 'No', 'read-path', { pattern: '*.ts', path: '/work/app/src' }),
  row('Grep', 'No', 'read-path', { pattern: 'TODO', path: '/work/app/src' }),
  row('ListAgents', 'No'),
  row('ListMcpResourcesTool', 'No'),
  row('LSP', 'No', 'read-path'),
  row('Monitor', 'Yes', 'command', { command: 'tail -f build.log' }),
  row('NotebookEdit', 'Yes', 'edit-path', { notebook_path: '/work/app/a.ipynb' }),
  row('PowerShell', 'Yes', 'powershell-command', { command: 'Remove-Item build' }),
  row('PushNotification', 'No'),
  row('Read', 'No', 'read-path', { file_path: '/work/app/a.ts' }),
  row('ReadMcpResourceTool', 'No'),
  row('RemoteTrigger', 'No'),
  row('ReportFindings', 'No'),
  row('ScheduleWakeup', 'No'),
  row('SendFeedback', 'No'),
  row('SendMessage', 'No'),
  row('SendUserFile', 'No'),
  row('ShareOnboardingGuide', 'Yes'),
  row('Skill', 'Yes', 'skill-name', { skill: 'deploy' }),
  row('SubagentHandback', 'No'),
  row('TaskCreate', 'No'),
  row('TaskGet', 'No'),
  row('TaskList', 'No'),
  row('TaskOutput', 'No'),
  row('TaskStop', 'No'),
  row('TaskUpdate', 'No'),
  row('TodoWrite', 'No'),
  row('ToolSearch', 'No'),
  row('WaitForMcpServers', 'No'),
  row('WebFetch', 'Yes', 'domain', { url: 'https://example.com/docs', prompt: 'summarise' }),
  row('WebSearch', 'Yes'),
  row('Workflow', 'Yes'),
  row('Write', 'Yes', 'edit-path', { file_path: '/work/app/new.ts', content: 'x' }),
];
