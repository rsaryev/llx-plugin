/**
 * sub-agents.md § Available tools: the first filter removes eight tools from every subagent "even
 * when listed in the `tools` field", each with its own condition (`Agent` at the depth limit,
 * `ExitPlanMode` unless the subagent's `permissionMode` is `plan`); § Restrict which tools a
 * subagent can use: the MCP server entries of `disallowedTools` (`mcp__github`, `mcp__github__*`,
 * `mcp__*`). One block per tool of the list.
 */
import { expect, test } from 'bun:test';
import { nestingAt } from '../../src/agents/catalog/spawn.ts';
import { spec } from '../support/spec.ts';
import {
  background,
  FULL_POOL,
  GITHUB,
  granted,
  MCP_NAMES,
  names,
  resolve,
  run,
  sorted,
} from '../support/tool-pool.ts';

/** Asked for by name: the subagent lists the tool and still does not get it. */
const listed = (tool: string, how = run()): readonly string[] =>
  names({ tools: [tool, 'Read'] }, how);

spec('agents.behavior.Available tools.AskUserQuestion', () => {
  test('AskUserQuestion is withheld from a foreground and a background subagent, even when listed', () => {
    expect(listed('AskUserQuestion')).toEqual(['Read']);
    expect(listed('AskUserQuestion', background())).toEqual(['Read']);
  });

  test('a subagent that lists AskUserQuestion alone is refused as having zero tools', () => {
    const outcome = resolve({ tools: ['AskUserQuestion'] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal.notAvailableToSubagents).toEqual(['AskUserQuestion']);
  });
});

spec('agents.behavior.Available tools.EnterPlanMode', () => {
  test('EnterPlanMode is withheld, even when listed, and stays out in every permission mode, plan included', () => {
    for (const permissionMode of ['default', 'plan', 'acceptEdits'] as const) {
      expect(listed('EnterPlanMode', run({ permissionMode }))).toEqual(['Read']);
    }
  });
});

spec('agents.behavior.Available tools.ScheduleWakeup', () => {
  test('ScheduleWakeup is not inherited either', () => {
    expect(names({})).not.toContain('ScheduleWakeup');
    expect(listed('ScheduleWakeup')).toEqual(['Read']);
  });
});

spec('agents.behavior.Available tools.WaitForMcpServers', () => {
  test('WaitForMcpServers is not inherited, though the MCP tools themselves are', () => {
    expect(names({})).not.toContain('WaitForMcpServers');
    expect(listed('WaitForMcpServers', background())).toEqual(['Read']);
    expect(names({})).toEqual(expect.arrayContaining(MCP_NAMES));
  });
});

spec('agents.behavior.Available tools.Workflow', () => {
  test('Workflow is removed with the others, and Read, Edit and the rest stay', () => {
    expect(names({})).not.toContain('Workflow');
    expect(listed('Workflow')).toEqual(['Read']);
    expect(names({})).toEqual(expect.arrayContaining(['Read', 'Edit', 'Bash']));
  });
});

spec('agents.behavior.Available tools.EndConversation', () => {
  test('EndConversation, which can end only the main conversation, is withheld from a subagent', () => {
    expect(listed('EndConversation')).toEqual(['Read']);
    expect(listed('EndConversation', background())).toEqual(['Read']);
  });

  test('the agent that runs as the main thread keeps it', () => {
    const tools = granted(resolve({}, run({ asMainThread: true })));
    expect(tools).toContain('EndConversation');
  });
});

spec('agents.behavior.Available tools.ExitPlanMode', () => {
  test('ExitPlanMode is removed, even when listed, unless the subagent permissionMode is plan', () => {
    expect(listed('ExitPlanMode')).toEqual(['Read']);
    expect(listed('ExitPlanMode', run({ permissionMode: 'acceptEdits' }))).toEqual(['Read']);
    expect(listed('ExitPlanMode', run({ permissionMode: 'plan' }))).toEqual(
      sorted(['ExitPlanMode', 'Read']),
    );
  });

  test('a background subagent in plan mode keeps it as well: it follows the first filter wherever it runs', () => {
    expect(listed('ExitPlanMode', background({ permissionMode: 'plan' }))).toEqual(
      sorted(['ExitPlanMode', 'Read']),
    );
    expect(listed('ExitPlanMode', background())).toEqual(['Read']);
  });
});

spec('agents.behavior.Available tools.Agent', () => {
  test('Agent is removed from a subagent at the depth limit, even when listed', () => {
    expect(listed('Agent')).toEqual(sorted(['Agent', 'Read']));
    expect(listed('Agent', run({ atDepthLimit: true }))).toEqual(['Read']);
    expect(names({}, run({ atDepthLimit: true }))).not.toContain('Agent');
  });

  test('a fork at the depth limit keeps the tool listed, and a call of it does not spawn', () => {
    const tools = granted(resolve({}, run({ kind: 'fork', atDepthLimit: true })));
    expect(tools).toContain('Agent');
    expect(nestingAt({ layer: 3, limit: 3, fork: true })).toEqual({
      agentToolListed: true,
      spawns: false,
    });
    expect(nestingAt({ layer: 3, limit: 3, fork: false })).toEqual({
      agentToolListed: false,
      spawns: false,
    });
  });

  test('a fork skips both filters, so it also gets the tools the first filter removes', () => {
    const fork = granted(resolve({}, run({ kind: 'fork' })));
    expect(fork).toContain('AskUserQuestion');
    expect(fork).toContain('Workflow');
  });
});

spec("agents.behavior.Restrict which tools a subagent can use.Withhold one server's tools", () => {
  test('`mcp__github` and `mcp__github__*` both remove every tool of that server only', () => {
    for (const entry of ['mcp__github', 'mcp__github__*']) {
      const tools = names({ disallowedTools: [entry] });
      for (const tool of GITHUB) expect(tools).not.toContain(tool);
      expect(tools).toEqual(
        expect.arrayContaining(['mcp__slack__post_message', 'mcp__reports__run_query', 'Bash']),
      );
    }
  });

  test('the docs example local-only keeps the built-in tools and the other servers', () => {
    const tools = names({ disallowedTools: ['mcp__github'] });
    expect(tools).toEqual(sorted(names({}).filter((tool) => !GITHUB.includes(tool))));
  });

  test('the same entry in `tools` does not withhold: only `mcp__github__*` there gives the server', () => {
    expect(names({ tools: ['mcp__github__*'] })).toEqual(sorted(GITHUB));
  });
});

spec(
  'agents.behavior.Restrict which tools a subagent can use.Withhold every MCP tool from any server',
  () => {
    test('`mcp__*` in disallowedTools removes every MCP tool and keeps the built-in tools', () => {
      const tools = names({ disallowedTools: ['mcp__*'] });
      for (const tool of MCP_NAMES) expect(tools).not.toContain(tool);
      expect(tools).toEqual(sorted(names({}).filter((tool) => !MCP_NAMES.includes(tool))));
      expect(tools).toContain('Bash');
    });

    test('a `tools` allowlist of built-ins already gives no MCP tool, as in the safe-researcher example', () => {
      const tools = names({ tools: ['Read', 'Grep', 'Glob', 'Bash'] });
      expect(tools).toEqual(sorted(['Read', 'Grep', 'Glob', 'Bash']));
      expect(FULL_POOL.mcp.length).toBeGreaterThan(0);
    });
  },
);
