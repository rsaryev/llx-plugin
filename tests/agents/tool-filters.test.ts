/**
 * sub-agents.md, "Available tools" (the second filter for background subagents, teammates,
 * forks); tools-reference.md, the paragraph on which tools a non-fork subagent can use.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../support/spec.ts';
import {
  background,
  granted,
  MCP_NAMES,
  names,
  resolve,
  run,
  sorted,
} from '../support/tool-pool.ts';

const fork = (how = {}) => run({ kind: 'fork', ...how });

const BACKGROUND_KEEPS = [
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
] as const;

spec('agents.frontmatter.tools', () => {
  describe('background subagents keep a smaller built-in tool set', () => {
    test('a background subagent keeps exactly the listed built-in tools and every MCP tool', () => {
      const tools = names({}, background());
      expect(tools).toEqual(sorted([...BACKGROUND_KEEPS, 'Agent', ...MCP_NAMES]));
    });

    test('a tool outside the set is dropped silently when other entries resolve', () => {
      const outcome = resolve({ tools: ['Read', 'CronCreate'] }, background());
      expect(granted(outcome)).toEqual(['Read']);
      expect(names({ tools: ['Read', 'CronCreate'] })).toEqual(['CronCreate', 'Read']);
    });

    test('the same definition resolves to different tools in the foreground and the background', () => {
      const fields = { tools: ['Read', 'TaskCreate', 'CronCreate'] };
      expect(names(fields)).toEqual(['CronCreate', 'Read', 'TaskCreate']);
      expect(names(fields, background())).toEqual(['Read']);
    });

    test('a teammate also keeps the task tools and cron tools in the background', () => {
      const tasks = [
        'CronCreate',
        'CronDelete',
        'CronList',
        'TaskCreate',
        'TaskGet',
        'TaskList',
        'TaskUpdate',
      ];
      const fields = { tools: [...tasks, 'Read', 'AskUserQuestion'] };
      expect(names(fields, background({ teammate: true }))).toEqual(sorted([...tasks, 'Read']));
      expect(names(fields, background())).toEqual(['Read']);
      expect(names({}, background({ teammate: true }))).toEqual(
        sorted([...BACKGROUND_KEEPS, ...tasks, 'Agent', ...MCP_NAMES]),
      );
    });

    test('Agent and ExitPlanMode follow the first filter in the background too', () => {
      expect(names({}, background())).toContain('Agent');
      expect(names({}, background({ atDepthLimit: true }))).not.toContain('Agent');
      expect(names({}, background())).not.toContain('ExitPlanMode');
      expect(names({}, background({ permissionMode: 'plan' }))).toContain('ExitPlanMode');
    });

    test('an entry the background drops that leaves nothing is refused and named', () => {
      const outcome = resolve({ tools: ['CronCreate'] }, background());
      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? [] : outcome.refusal.notAvailableToSubagents).toEqual(['CronCreate']);
    });

    test('a subagent Claude waits for runs in the foreground and keeps the tool', () => {
      expect(names({ tools: ['CronCreate'] }, run())).toEqual(['CronCreate']);
    });
  });

  describe('forks skip both filters', () => {
    test('a fork receives the main conversation exact tool pool', () => {
      const pool = {
        builtin: ['Read', 'AskUserQuestion', 'Workflow', 'SubagentHandback', 'HostOnlyTool'],
        mcp: [{ server: 'github', name: 'mcp__github__get_pr' }],
      };
      expect(names({ tools: ['Grep'] }, fork({ background: true }), pool)).toEqual([
        'AskUserQuestion',
        'HostOnlyTool',
        'Read',
        'SubagentHandback',
        'Workflow',
        'mcp__github__get_pr',
      ]);
    });

    test('a fork keeps AskUserQuestion and CronCreate that a subagent loses', () => {
      const tools = names({ tools: ['Read'] }, fork({ background: true }));
      expect(tools).toContain('AskUserQuestion');
      expect(tools).toContain('CronCreate');
      expect(tools).toContain('Read');
    });

    test('a fork at the depth limit keeps Agent listed but cannot spawn', () => {
      const outcome = resolve({}, fork({ atDepthLimit: true }));
      expect(granted(outcome)).toContain('Agent');
      expect(outcome.ok && outcome.spawnTypes).toBe('none');
    });
  });
});
