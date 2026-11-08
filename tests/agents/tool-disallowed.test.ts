/**
 * sub-agents.md, "Frontmatter reference" (`disallowedTools`) and "Restrict which tools a subagent
 * can use" (with "MCP server names that contain a double underscore"); tools-reference.md, the
 * paragraph on which tools a non-fork subagent can use ("Both set: `disallowedTools` takes
 * precedence").
 */
import { expect, test } from 'bun:test';
import { DOCUMENTED_TOOLS } from '../../src/protocol/tool-names.ts';
import { spec } from '../support/spec.ts';
import {
  background,
  GITHUB,
  granted,
  MCP_NAMES,
  names,
  resolve,
  run,
  sorted,
} from '../support/tool-pool.ts';

/** What a foreground subagent never inherits: the first filter, `ExitPlanMode` outside plan mode, the host-granted tool. */
const NOT_INHERITED: ReadonlySet<string> = new Set([
  'AskUserQuestion',
  'EndConversation',
  'EnterPlanMode',
  'ScheduleWakeup',
  'WaitForMcpServers',
  'Workflow',
  'ExitPlanMode',
  'SubagentHandback',
]);

spec('agents.frontmatter.disallowedTools', () => {
  test('omitted tools: the subagent inherits its pool except the listed tools', () => {
    const tools = names({ disallowedTools: ['Write', 'Edit'] });
    expect(tools).not.toContain('Write');
    expect(tools).not.toContain('Edit');
    expect(tools).toContain('Bash');
    expect(tools).toEqual(expect.arrayContaining(MCP_NAMES));
    expect(tools).toEqual(
      sorted([
        ...DOCUMENTED_TOOLS.filter(
          (tool) => !NOT_INHERITED.has(tool) && !['Write', 'Edit'].includes(tool),
        ),
        ...MCP_NAMES,
      ]),
    );
  });

  test('a tool listed in both tools and disallowedTools is removed', () => {
    expect(names({ tools: ['Read', 'Write', 'Edit'], disallowedTools: ['Write'] })).toEqual([
      'Edit',
      'Read',
    ]);
  });

  // The documented order (disallowedTools first, then tools against the remaining pool) is only
  // observable in the mixed-list refusal, which the docs leave open: spec/judgments.md, tool-judgments.test.ts.
  test('a tools entry naming only denied tools adds nothing, the other entries still resolve', () => {
    const outcome = resolve({
      tools: ['mcp__github__*', 'Read'],
      disallowedTools: ['mcp__github'],
    });
    expect(granted(outcome)).toEqual(['Read']);
  });

  test('a specifier still removes the whole tool: Bash(git push *) removes Bash', () => {
    const tools = names({ disallowedTools: ['Bash(git push *)'] });
    expect(tools).not.toContain('Bash');
    expect(tools).toContain('Read');
  });

  test('a specifier removes the whole tool from an allowlist too', () => {
    expect(names({ tools: ['Bash', 'Read'], disallowedTools: ['Bash(git push *)'] })).toEqual([
      'Read',
    ]);
  });

  test('mcp__github withholds that server only, keeping other servers and the built-ins', () => {
    const tools = names({ disallowedTools: ['mcp__github'] });
    for (const tool of GITHUB) expect(tools).not.toContain(tool);
    expect(tools).toContain('mcp__slack__post_message');
    expect(tools).toContain('Bash');
  });

  test('mcp__github__* withholds the same tools as mcp__github', () => {
    expect(names({ disallowedTools: ['mcp__github__*'] })).toEqual(
      names({ disallowedTools: ['mcp__github'] }),
    );
  });

  test('mcp__* withholds every MCP tool of every server', () => {
    const tools = names({ disallowedTools: ['mcp__*'] });
    expect(tools.filter((tool) => tool.startsWith('mcp__'))).toEqual([]);
    expect(tools).toContain('Bash');
  });

  test('mcp__reports and mcp__reports__* also withhold the reports__v2 server tools', () => {
    for (const entry of ['mcp__reports', 'mcp__reports__*']) {
      const tools = names({ disallowedTools: [entry] });
      expect(tools).not.toContain('mcp__reports__run_query');
      expect(tools).not.toContain('mcp__reports__v2__get_totals');
      expect(tools).toContain('mcp__github__get_pr');
    }
  });

  test('to withhold only the reports server, list its tools one by one', () => {
    const tools = names({ disallowedTools: ['mcp__reports__run_query'] });
    expect(tools).not.toContain('mcp__reports__run_query');
    expect(tools).toContain('mcp__reports__v2__get_totals');
  });

  test('Agent in disallowedTools keeps the subagent from spawning others', () => {
    const outcome = resolve({ disallowedTools: ['Agent'] });
    expect(granted(outcome)).not.toContain('Agent');
    expect(outcome.ok && outcome.spawnTypes).toBe('none');
  });

  test('Task is an alias of Agent in disallowedTools too', () => {
    const outcome = resolve({ disallowedTools: ['Task'] });
    expect(granted(outcome)).not.toContain('Agent');
    expect(outcome.ok && outcome.spawnTypes).toBe('none');
  });

  test('Agent(type) in disallowedTools removes Agent, as the tool is removed whole', () => {
    expect(granted(resolve({ disallowedTools: ['Agent(worker)'] }))).not.toContain('Agent');
    expect(granted(resolve({ disallowedTools: ['Task(worker)'] }))).not.toContain('Agent');
  });

  test('on the main thread disallowedTools: Agent wins over an Agent(type) allowlist', () => {
    const outcome = resolve(
      { tools: ['Agent(worker, researcher)', 'Read'], disallowedTools: ['Agent'] },
      run({ asMainThread: true }),
    );
    expect(granted(outcome)).toEqual(['Read']);
    expect(outcome.ok && outcome.spawnTypes).toBe('none');
  });

  test('on the main thread the Agent(type) allowlist holds when nothing denies Agent', () => {
    const outcome = resolve(
      { tools: ['Agent(worker, researcher)', 'Read'] },
      run({ asMainThread: true }),
    );
    expect(granted(outcome)).toEqual(['Agent', 'Read']);
    expect(outcome.ok && outcome.spawnTypes).toEqual(['worker', 'researcher']);
  });

  test('a disallowedTools that removes every tools entry does not refuse: no tools, no error', () => {
    const outcome = resolve({ tools: ['Read', 'Grep'], disallowedTools: ['Read', 'Grep'] });
    expect(granted(outcome)).toEqual([]);
  });

  test('a subagent that reports through SubagentHandback gets it even when listed as disallowed', () => {
    const how = run({ handback: true });
    expect(names({ tools: ['Read'] }, how)).toEqual(['Read', 'SubagentHandback']);
    expect(names({ disallowedTools: ['SubagentHandback'] }, how)).toContain('SubagentHandback');
    expect(names({ tools: ['Read'] })).toEqual(['Read']);
  });

  test('a tools list that names only SubagentHandback is not refused when the host grants it', () => {
    for (const how of [run({ handback: true }), background({ handback: true })]) {
      expect(names({ tools: ['SubagentHandback'] }, how)).toEqual(['SubagentHandback']);
    }
  });

  test('SubagentHandback stays granted in the background, with tools omitted or listed', () => {
    const how = background({ handback: true });
    expect(names({}, how)).toContain('SubagentHandback');
    expect(names({ tools: ['Read'] }, how)).toEqual(['Read', 'SubagentHandback']);
    expect(names({ tools: ['Read', 'SubagentHandback'] }, how)).toEqual([
      'Read',
      'SubagentHandback',
    ]);
    expect(names({ tools: ['Read'], disallowedTools: ['SubagentHandback'] }, how)).toEqual([
      'Read',
      'SubagentHandback',
    ]);
  });
});
