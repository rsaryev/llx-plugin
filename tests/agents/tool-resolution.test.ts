/**
 * sub-agents.md, "Frontmatter reference" (`tools`, `disallowedTools`), "Available tools",
 * "Restrict which tools a subagent can use" (with "MCP server names that contain a double
 * underscore"), "Restrict which subagents can be spawned" and "Let subagents spawn their own
 * subagents"; errors.md, "Agent would be spawned with zero tools"; tools-reference.md, the
 * paragraph on which tools a non-fork subagent can use.
 */
import { describe, expect, test } from 'bun:test';
import { DOCUMENTED_TOOLS } from '../../src/protocol/tool-names.ts';
import { spec } from '../support/spec.ts';
import {
  background,
  FULL_POOL,
  granted,
  GITHUB,
  MCP_NAMES,
  names,
  REPORTS_V2,
  resolve,
  run,
  sorted,
} from '../support/tool-pool.ts';

const fork = (how = {}) => run({ kind: 'fork', ...how });

const REMOVED_FROM_EVERY_SUBAGENT = [
  'AskUserQuestion',
  'EndConversation',
  'EnterPlanMode',
  'ScheduleWakeup',
  'WaitForMcpServers',
  'Workflow',
] as const;

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
  describe('omitted: inherits every tool available to subagents', () => {
    test('the foreground subagent gets the pool minus the first filter, MCP tools included', () => {
      const tools = names({});
      expect(tools).toEqual(
        sorted([
          ...DOCUMENTED_TOOLS.filter(
            (tool) =>
              !(REMOVED_FROM_EVERY_SUBAGENT as readonly string[]).includes(tool) &&
              tool !== 'ExitPlanMode' &&
              tool !== 'SubagentHandback',
          ),
          ...MCP_NAMES,
        ]),
      );
      expect(tools).toContain('Bash');
      expect(tools).toContain('mcp__github__get_pr');
    });

    test.each(REMOVED_FROM_EVERY_SUBAGENT)('%s is removed from every subagent', (tool) => {
      expect(names({})).not.toContain(tool);
      expect(names({}, background())).not.toContain(tool);
    });

    test('the first filter removes a tool even when it is listed in tools', () => {
      expect(names({ tools: ['AskUserQuestion', 'Workflow', 'Read'] })).toEqual(['Read']);
    });

    test('ExitPlanMode stays only for a subagent whose permissionMode is plan', () => {
      expect(names({}, run({ permissionMode: 'plan' }))).toContain('ExitPlanMode');
      expect(names({ tools: ['ExitPlanMode', 'Read'] }, run({ permissionMode: 'plan' }))).toEqual([
        'ExitPlanMode',
        'Read',
      ]);
      for (const mode of [
        'default',
        'acceptEdits',
        'auto',
        'dontAsk',
        'bypassPermissions',
      ] as const) {
        expect(names({}, run({ permissionMode: mode }))).not.toContain('ExitPlanMode');
      }
    });

    test('Agent is withheld at the depth limit and kept below it', () => {
      expect(names({})).toContain('Agent');
      expect(names({}, run({ atDepthLimit: true }))).not.toContain('Agent');
    });
  });

  describe('listed: an allowlist', () => {
    test('the doc example safe-researcher: only Read, Grep, Glob and Bash, no MCP tools', () => {
      const tools = names({ tools: ['Read', 'Grep', 'Glob', 'Bash'] });
      expect(tools).toEqual(['Bash', 'Glob', 'Grep', 'Read']);
      expect(tools).not.toContain('Edit');
      expect(tools).not.toContain('Write');
      expect(tools.filter((tool) => tool.startsWith('mcp__'))).toEqual([]);
    });

    test('mcp__github__* gives every tool of that server and no other', () => {
      expect(names({ tools: ['mcp__github__*'] })).toEqual(sorted(GITHUB));
    });

    test('one MCP tool is named by its full name', () => {
      expect(names({ tools: ['mcp__github__get_pr', 'Read'] })).toEqual([
        'Read',
        'mcp__github__get_pr',
      ]);
    });

    test('a server whose name holds __ is written mcp__reports__v2__*', () => {
      expect(names({ tools: ['mcp__reports__v2__*'] })).toEqual(REPORTS_V2);
    });

    test('mcp__reports__v2 without the trailing __* matches none of that server tools', () => {
      const outcome = resolve({ tools: ['mcp__reports__v2'] });
      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? [] : outcome.refusal.matchedNoTools).toEqual(['mcp__reports__v2']);
    });

    test('the same entry list is the same subagent whatever the order of the pool', () => {
      const reversed = { ...FULL_POOL, builtin: [...FULL_POOL.builtin].toReversed() };
      expect(names({ tools: ['Read', 'Bash'] }, run(), reversed)).toEqual(['Bash', 'Read']);
    });
  });

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
      expect(names({}, fork({ background: true }))).toEqual(
        sorted([...DOCUMENTED_TOOLS, ...MCP_NAMES]),
      );
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

  describe('Agent(type) allowlist', () => {
    const coordinator = { tools: ['Agent(worker, researcher)', 'Read', 'Bash'] };
    const main = run({ asMainThread: true });

    test('as the main thread only worker and researcher can be spawned', () => {
      const outcome = resolve(coordinator, main);
      expect(granted(outcome)).toEqual(['Agent', 'Read', 'Bash']);
      expect(outcome.ok && outcome.spawnTypes).toEqual(['worker', 'researcher']);
    });

    test('Agent without parentheses allows any subagent', () => {
      const outcome = resolve({ tools: ['Agent', 'Read', 'Bash'] }, main);
      expect(outcome.ok && outcome.spawnTypes).toBe('any');
    });

    test('omitting Agent from tools means no subagent can be spawned', () => {
      const outcome = resolve({ tools: ['Read', 'Bash'] }, main);
      expect(granted(outcome)).toEqual(['Read', 'Bash']);
      expect(outcome.ok && outcome.spawnTypes).toBe('none');
    });

    test('in a subagent definition the type list is ignored: it may spawn any type', () => {
      const outcome = resolve(coordinator, run());
      expect(granted(outcome)).toContain('Agent');
      expect(outcome.ok && outcome.spawnTypes).toBe('any');
    });

    test('a subagent at the depth limit spawns nothing, even with Agent listed', () => {
      const outcome = resolve({ tools: ['Agent', 'Read'] }, run({ atDepthLimit: true }));
      expect(granted(outcome)).toEqual(['Read']);
      expect(outcome.ok && outcome.spawnTypes).toBe('none');
    });

    test('Task(...) works as an alias of Agent(...)', () => {
      const outcome = resolve({ tools: ['Task(worker)', 'Read'] }, main);
      expect(granted(outcome)).toEqual(['Agent', 'Read']);
      expect(outcome.ok && outcome.spawnTypes).toEqual(['worker']);
    });
  });

  describe('Agent would be spawned with zero tools', () => {
    test('the documented message for a misspelled entry, verbatim', () => {
      const outcome = resolve({ tools: ['Grpe'] });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal.message).toBe(
        "Agent 'code-reviewer' would be spawned with zero tools — refusing. Its tools list resolved to nothing: unrecognized [Grpe]. Fix the agent's tools frontmatter or pass a different subagent_type.",
      );
      expect(outcome.refusal.unrecognized).toEqual(['Grpe']);
    });

    test('an entry that is a real tool subagents cannot use is not available to subagents', () => {
      const outcome = resolve({ tools: ['AskUserQuestion'] });
      expect(outcome.ok ? [] : outcome.refusal.notAvailableToSubagents).toEqual([
        'AskUserQuestion',
      ]);
    });

    test('a valid entry nothing in the session matches matched no tools (mcp__github__* with no server)', () => {
      const noGithub = { ...FULL_POOL, mcp: FULL_POOL.mcp.filter((t) => t.server !== 'github') };
      const outcome = resolve({ tools: ['mcp__github__*'] }, run(), noGithub);
      expect(outcome.ok ? [] : outcome.refusal.matchedNoTools).toEqual(['mcp__github__*']);
    });

    test('Agent at the depth limit is reported under matched no tools, not under not available', () => {
      const outcome = resolve({ tools: ['Agent'] }, run({ atDepthLimit: true }));
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal.matchedNoTools).toEqual(['Agent']);
      expect(outcome.refusal.notAvailableToSubagents).toEqual([]);
    });

    test('the entries are grouped by what went wrong', () => {
      const outcome = resolve({ tools: ['Grpe', 'CronCreate', 'mcp__nope__*'] }, background(), {
        ...FULL_POOL,
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal.unrecognized).toEqual(['Grpe']);
      expect(outcome.refusal.notAvailableToSubagents).toEqual(['CronCreate']);
      expect(outcome.refusal.matchedNoTools).toEqual(['mcp__nope__*']);
    });

    test('omitting tools never refuses, even for a pool with nothing usable', () => {
      const outcome = resolve({}, run(), { builtin: [], mcp: [] });
      expect(granted(outcome)).toEqual([]);
    });

    test('an empty tools list launches the subagent without tools', () => {
      expect(granted(resolve({ tools: [] }))).toEqual([]);
    });

    test('some resolved entries mean no refusal, whatever else is misspelled', () => {
      expect(granted(resolve({ tools: ['Grpe', 'Read'] }))).toEqual(['Read']);
    });
  });
});
