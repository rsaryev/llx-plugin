/**
 * sub-agents.md, "Restrict which subagents can be spawned" (the `Agent(worker, researcher)` allowlist of
 * a main-thread agent; `Agent` alone; no `Agent` at all; the list ignored in a subagent definition),
 * "Let subagents spawn their own subagents" (three layers by default, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`,
 * `Agent` withheld at the limit except from a fork, where it errors) and "Subagent names" (a `name` on
 * the Agent call with agent teams on makes the subagent addressable, and starts a teammate in an
 * interactive session unless the call is a fork or sets `isolation`); errors.md, "subagent_type is required".
 */
import { describe, expect, test } from 'bun:test';
import { resolveAgents, resolveSubagentType } from '../../../src/agents/catalog/resolve.ts';
import {
  DEFAULT_SPAWN_DEPTH,
  namedSubagent,
  nestingAt,
  spawnableAgents,
  spawnDepthLimit,
} from '../../../src/agents/catalog/spawn.ts';
import { builtinAgents } from '../../../src/agents/catalog/builtin.ts';
import { catalogTier } from '../../../src/agents/catalog/types.ts';
import { resolveSubagentTools, type ToolPool } from '../../../src/agents/tool-resolution.ts';
import type { SubagentRun } from '../../../src/agents/tool-filters.ts';
import { spec } from '../../support/spec.ts';
import { flagAgent, pluginAgent, scannedAgent } from '../../support/agent-catalog.ts';

const POOL: ToolPool = { builtin: ['Agent', 'Read', 'Bash', 'Grep', 'Glob', 'Write'], mcp: [] };

const run = (override: Partial<SubagentRun> = {}): SubagentRun => ({
  kind: 'subagent',
  background: true,
  atDepthLimit: false,
  permissionMode: 'default',
  asMainThread: true,
  ...override,
});

const catalog = resolveAgents({
  builtin: builtinAgents({ interactive: true, disableExplorePlan: false, disableAll: false }),
  scanned: [
    scannedAgent('project', 'worker'),
    scannedAgent('project', 'researcher'),
    scannedAgent('project', 'reviewer'),
  ],
});

const winners = (resolved: ReturnType<typeof resolveAgents>) =>
  resolved.agents.map((agent) => `${agent.name}:${catalogTier(agent.source)}`).toSorted();

const spawnTypes = (fields: { tools?: string[]; disallowedTools?: string[] }, over = {}) => {
  const outcome = resolveSubagentTools({ name: 'coordinator', ...fields }, POOL, run(over));
  if (!outcome.ok) throw new Error(outcome.refusal.message);
  return outcome.spawnTypes;
};

spec('agents.behavior.Restrict which subagents can be spawned', () => {
  test('Agent(worker, researcher) is an allowlist: only those two can be spawned', () => {
    const allowed = spawnableAgents(
      catalog,
      spawnTypes({ tools: ['Agent(worker, researcher)', 'Read', 'Bash'] }),
    );
    expect(allowed.agents.map((agent) => agent.name)).toEqual(['researcher', 'worker']);
    expect(resolveSubagentType(allowed, 'worker').ok).toBe(true);
  });

  test('any other type fails, and the agent sees only the allowed types', () => {
    const allowed = spawnableAgents(catalog, spawnTypes({ tools: ['Agent(worker, researcher)'] }));
    const refused = resolveSubagentType(allowed, 'reviewer');
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.message).toBe(
      "Agent type 'reviewer' not found. Available agents: researcher, worker",
    );
  });

  test('a built-in is outside the list too: Explore cannot be spawned when it is not named', () => {
    const allowed = spawnableAgents(catalog, spawnTypes({ tools: ['Agent(worker)'] }));
    expect(resolveSubagentType(allowed, 'Explore').ok).toBe(false);
    expect(resolveSubagentType(allowed, 'worker').ok).toBe(true);
  });

  test('Agent without parentheses allows any subagent', () => {
    const allowed = spawnableAgents(catalog, spawnTypes({ tools: ['Agent', 'Read', 'Bash'] }));
    expect(allowed.agents).toEqual(catalog.agents);
  });

  test('without Agent in the list the agent cannot spawn any subagent', () => {
    const none = spawnableAgents(catalog, spawnTypes({ tools: ['Read', 'Bash'] }));
    expect(none.agents).toEqual([]);
    expect(resolveSubagentType(none, 'worker').ok).toBe(false);
  });

  test('in a subagent definition any type list inside the parentheses is ignored', () => {
    const types = spawnTypes({ tools: ['Agent(worker)', 'Read'] }, { asMainThread: false });
    expect(types).toBe('any');
    expect(spawnableAgents(catalog, types).agents).toEqual(catalog.agents);
  });

  test('the allowlist counts for a call without subagent_type: general-purpose must be in it (errors.md)', () => {
    const allowed = spawnableAgents(catalog, spawnTypes({ tools: ['Agent(worker)'] }));
    const omitted = resolveSubagentType(allowed, undefined);
    expect(!omitted.ok && omitted.message).toBe(
      'subagent_type is required: the general-purpose agent is not available in this session. Available agents: worker',
    );
    const withFallback = spawnableAgents(
      catalog,
      spawnTypes({ tools: ['Agent(worker, general-purpose)'] }),
    );
    const fell = resolveSubagentType(withFallback, undefined);
    expect(fell.ok && fell.agent.name).toBe('general-purpose');
  });

  test('a name in the list that no subagent has is just not spawnable', () => {
    const allowed = spawnableAgents(catalog, ['worker', 'ghost']);
    expect(allowed.agents.map((agent) => agent.name)).toEqual(['worker']);
  });

  test('the older Task(...) spelling is the same allowlist', () => {
    const allowed = spawnableAgents(catalog, spawnTypes({ tools: ['Task(worker)'] }));
    expect(allowed.agents.map((agent) => agent.name)).toEqual(['worker']);
  });
});

describe('nested subagents', () => {
  spec('agents.behavior.Let subagents spawn their own subagents', () => {
    test('by default a subagent can spawn its own, up to three layers below the main conversation', () => {
      expect(DEFAULT_SPAWN_DEPTH).toBe(3);
      const limit = spawnDepthLimit(undefined);
      expect([0, 1, 2, 3].map((layer) => nestingAt({ layer, limit, fork: false }).spawns)).toEqual([
        true,
        true,
        true,
        false,
      ]);
    });

    test('CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2: the second layer exists and cannot delegate further', () => {
      const limit = spawnDepthLimit('2');
      expect([0, 1, 2].map((layer) => nestingAt({ layer, limit, fork: false }).spawns)).toEqual([
        true,
        true,
        false,
      ]);
    });

    test('1 turns nesting off: only the main conversation spawns', () => {
      const limit = spawnDepthLimit('1');
      expect([0, 1].map((layer) => nestingAt({ layer, limit, fork: false }).spawns)).toEqual([
        true,
        false,
      ]);
    });

    test('at the limit Claude Code withholds the Agent tool from a subagent: it does the work itself', () => {
      const limit = spawnDepthLimit(undefined);
      const nesting = nestingAt({ layer: 3, limit, fork: false });
      expect(nesting.agentToolListed).toBe(false);
      const outcome = resolveSubagentTools(
        { name: 'deep', tools: ['Agent', 'Read'] },
        POOL,
        run({ asMainThread: false, atDepthLimit: !nesting.agentToolListed }),
      );
      expect(outcome.ok && outcome.tools).toEqual(['Read']);
      expect(outcome.ok && outcome.spawnTypes).toBe('none');
    });

    test('a fork at the limit keeps Agent in its tool list, but the tool errors instead of spawning', () => {
      const limit = spawnDepthLimit(undefined);
      const nesting = nestingAt({ layer: 3, limit, fork: true });
      expect(nesting).toEqual({ agentToolListed: true, spawns: false });
      const outcome = resolveSubagentTools(
        { name: 'fork' },
        POOL,
        run({ kind: 'fork', asMainThread: false, atDepthLimit: !nesting.spawns }),
      );
      expect(outcome.ok && outcome.tools).toContain('Agent');
      expect(outcome.ok && outcome.spawnTypes).toBe('none');
    });

    test('below the limit a fork spawns like any subagent', () => {
      expect(nestingAt({ layer: 1, limit: 3, fork: true })).toEqual({
        agentToolListed: true,
        spawns: true,
      });
    });

    test('a nested subagent resolves from the same scopes as a top-level one', () => {
      const sources = {
        builtin: builtinAgents({ interactive: true, disableExplorePlan: false, disableAll: false }),
        flag: [flagAgent('shared'), flagAgent('flagged')],
        scanned: [
          scannedAgent('managed', 'shared'),
          scannedAgent('project', 'flagged'),
          scannedAgent('project', 'projected'),
          scannedAgent('user', 'projected'),
          scannedAgent('user', 'personal'),
          scannedAgent('user', 'Explore'),
        ],
        plugin: [pluginAgent('team', 'shared'), pluginAgent('team', 'personal')],
      };
      const seenBy = (asMainThread: boolean) =>
        spawnableAgents(resolveAgents(sources), spawnTypes({ tools: ['Agent'] }, { asMainThread }));
      const mainThread = seenBy(true);
      const nested = seenBy(false);
      expect(winners(nested)).toEqual(winners(mainThread));
      expect(winners(nested)).toEqual([
        'Explore:user',
        'Plan:builtin',
        'claude-code-guide:builtin',
        'claude:builtin',
        'flagged:flag',
        'general-purpose:builtin',
        'personal:user',
        'projected:project',
        'shared:managed',
        'statusline-setup:builtin',
        'team:personal:plugin',
        'team:shared:plugin',
      ]);
    });

    test('to keep one subagent from spawning while nesting is on, omit Agent from tools or add it to disallowedTools', () => {
      const sub = { asMainThread: false };
      expect(spawnTypes({ tools: ['Read', 'Grep'] }, sub)).toBe('none');
      expect(spawnTypes({ disallowedTools: ['Agent'] }, sub)).toBe('none');
      expect(spawnTypes({ tools: ['Agent', 'Read'] }, sub)).toBe('any');
    });
  });
});

describe('judgments of the depth limit (spec/judgments.md)', () => {
  test('a value that is not a positive whole number leaves the default', () => {
    for (const value of ['0', '-1', 'two', '', '2.5', ' ']) {
      expect(spawnDepthLimit(value)).toBe(DEFAULT_SPAWN_DEPTH);
    }
  });

  test('a number with spaces around it is the number', () => {
    expect(spawnDepthLimit(' 2 ')).toBe(2);
  });
});

spec('agents.behavior.Subagent names', () => {
  const base = {
    agentTeams: true,
    interactive: true,
    fromMainConversation: true,
    fork: false,
    isolationOnCall: false,
  };

  test('with agent teams on, a name on the Agent call makes the subagent addressable', () => {
    expect(namedSubagent({ ...base, name: 'auth-review', interactive: false }).addressable).toBe(
      true,
    );
  });

  test('in an interactive session with agent teams, a named subagent from the main conversation launches as a teammate', () => {
    expect(namedSubagent({ ...base, name: 'auth-review' })).toEqual({
      addressable: true,
      launchesAs: 'teammate',
    });
  });

  test('a fork, or a call that passes isolation itself, stays a subagent', () => {
    expect(namedSubagent({ ...base, name: 'x', fork: true }).launchesAs).toBe('subagent');
    expect(namedSubagent({ ...base, name: 'x', isolationOnCall: true }).launchesAs).toBe(
      'subagent',
    );
  });

  test('an isolation value in the subagent frontmatter does not prevent it (only the call counts)', () => {
    // The frontmatter value is not an input: the same facts give a teammate.
    expect(namedSubagent({ ...base, name: 'x' }).launchesAs).toBe('teammate');
  });

  test('without agent teams the name parameter is not offered: nothing is addressable, nothing is a teammate', () => {
    expect(namedSubagent({ ...base, agentTeams: false, name: 'x' })).toEqual({
      addressable: false,
      launchesAs: 'subagent',
    });
  });

  test('a call without a name is an ordinary subagent', () => {
    expect(namedSubagent({ ...base, name: undefined })).toEqual({
      addressable: false,
      launchesAs: 'subagent',
    });
  });

  test('a non-interactive session starts no teammate', () => {
    expect(namedSubagent({ ...base, name: 'x', interactive: false }).launchesAs).toBe('subagent');
  });

  test('a subagent spawned by another subagent is not started from the main conversation: no teammate', () => {
    expect(namedSubagent({ ...base, name: 'x', fromMainConversation: false }).launchesAs).toBe(
      'subagent',
    );
  });
});
